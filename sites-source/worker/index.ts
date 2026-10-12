/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { notificationRoute, drainNotifications, enqueueDueReminders } from '../lib/push-notifications.mjs';
import { workspaceStream } from '../lib/workspace-stream.mjs';
import { sessionUser } from '../lib/google-auth.mjs';
import { authGate } from '../lib/google-auth.mjs';
import { oauthRoute } from '../lib/mcp-oauth.mjs';
import { secureAppResponse } from '../lib/response-security.mjs';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  COMMAND_CENTER_SETUP_MODE?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async()=>{await enqueueDueReminders(env.DB);await drainNotifications(env.DB);const cutoff=new Date(Date.now()-30*86400000).toISOString();await env.DB.prepare('DELETE FROM notification_deliveries WHERE event_id IN (SELECT id FROM notification_events WHERE created_at<?)').bind(cutoff).run();await env.DB.prepare('DELETE FROM notification_events WHERE created_at<?').bind(cutoff).run()})());
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Only compiled presentation assets are public; every application/data route
    // continues through the session gate below. Never return login HTML as CSS/JS.
    const assetPath = new URL(request.url).pathname;
    if (/^\/assets\/[A-Za-z0-9_-]+\.(css|js|woff2?)$/.test(assetPath) || /^\/fonts\/(manrope|dm-serif)-(latin|extended)\.woff2$/.test(assetPath) || ['/manifest.webmanifest','/sw.js','/offline.html'].includes(assetPath) || /^\/icons\/app-(192|512|maskable)\.png$/.test(assetPath) || assetPath === '/favicon.svg') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', {status:405});
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set('x-content-type-options', 'nosniff');
      if(assetPath==='/sw.js'){response.headers.set('cache-control','no-cache');response.headers.set('service-worker-allowed','/')}
      if(assetPath==='/manifest.webmanifest')response.headers.set('content-type','application/manifest+json');
      return response;
    }
    try {
      const oauth = await oauthRoute(request, env);
      if (oauth){if(request.method==='POST'&&assetPath==='/mcp')ctx.waitUntil(drainNotifications(env.DB).catch(()=>{}));return oauth;}
      const access=await authGate(request,env);
      if(access instanceof Response)return access;
    } catch {
      return new Response('Serviciul este temporar indisponibil. Reîncearcă în câteva momente.',{status:503,headers:{'cache-control':'no-store'}});
    }
    const notifications=await notificationRoute(request,env);
    if(notifications)return notifications;
    if(assetPath==='/api/workspace-events'){
      if(request.method!=='GET')return new Response('Method not allowed',{status:405});
      return workspaceStream({signal:request.signal,authorized:async()=>!!(await sessionUser(request,env)),readRevision:async()=>{const row=await env.DB.prepare('SELECT revision FROM workspace_revision WHERE id=1').first<{revision:number}>();return row?.revision??0}});
    }
    const cleanHeaders=new Headers(request.headers);
    for(const name of [...cleanHeaders.keys()])if(name.startsWith('oai-authenticated-'))cleanHeaders.delete(name);
    request=new Request(request,{headers:cleanHeaders});
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const result=await handler.fetch(request, env, ctx);
    if(!['GET','HEAD'].includes(request.method))ctx.waitUntil(drainNotifications(env.DB).catch(()=>{}));
    return secureAppResponse(result);
  },
};

export default worker;
