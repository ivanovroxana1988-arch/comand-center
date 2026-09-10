import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { taskService } from './command-center.mjs';
export const commandCenterOrigin='https://bogdan-roxana-command-center.roxana-roxy-5897.chatgpt.site';
export async function siteTaskService() {
  // These headers are supplied by Sites dispatch after its private access policy.
  // Never deploy this adapter on an origin where callers can forge those headers.
  const h=await headers(), id=h.get('oai-authenticated-user-id');
  if(!id) return null;
  return taskService(env.DB,{id,scopes:['tasks:read','tasks:write']});
}
