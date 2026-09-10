import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { taskService } from './command-center.mjs';
import { APP_ORIGIN, sessionUser } from './google-auth.mjs';
export const commandCenterOrigin=APP_ORIGIN;
export async function siteTaskService() {
  const h=await headers();
  const user=await sessionUser(new Request(APP_ORIGIN,{headers:{cookie:h.get('cookie')||''}}),env);
  if(!user) return null;
  return taskService(env.DB,{id:user.id,scopes:['tasks:read','tasks:write']});
}
