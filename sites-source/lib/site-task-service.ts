import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { taskService } from './command-center.mjs';
import { APP_ORIGIN, sessionUser } from './google-auth.mjs';
export const commandCenterOrigin=APP_ORIGIN;
export async function siteUser() {
  const h=await headers();
  const user=await sessionUser(new Request(APP_ORIGIN,{headers:{cookie:h.get('cookie')||''}}),env);
  return user;
}

export async function siteTaskService() {
 const user=await siteUser();
 return user?taskService(env.DB,{id:user.id,scopes:['tasks:read','tasks:write']}):null;
}
