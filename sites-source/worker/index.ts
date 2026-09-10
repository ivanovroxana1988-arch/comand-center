/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { authGate } from '../lib/google-auth.mjs';

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Only compiled presentation assets are public; every application/data route
    // continues through the session gate below. Never return login HTML as CSS/JS.
    const assetPath = new URL(request.url).pathname;
    if (/^\/assets\/[A-Za-z0-9_-]+\.(css|js|woff2?)$/.test(assetPath) || assetPath === '/favicon.svg') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', {status:405});
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set('x-content-type-options', 'nosniff');
      return response;
    }
    try {
      const access=await authGate(request,env);
      if(access instanceof Response)return access;
    } catch {
      return new Response('Serviciul este temporar indisponibil. Reîncearcă în câteva momente.',{status:503,headers:{'cache-control':'no-store'}});
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
    const secured=new Response(result.body,result);
    secured.headers.set('cache-control','private, no-store');
    secured.headers.set('referrer-policy','no-referrer');
    secured.headers.set('x-content-type-options','nosniff');
    secured.headers.set('x-frame-options','DENY');
    return secured;
  },
};

export default worker;
