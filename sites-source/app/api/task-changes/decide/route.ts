import { siteTaskService, commandCenterOrigin } from '../../../../lib/site-task-service';
export async function POST(request:Request) {
  // No MCP tool can call this operation. Require an authenticated, same-origin form.
  if(request.headers.get('origin')!==commandCenterOrigin)return new Response('Forbidden',{status:403});
  if(request.headers.get('sec-fetch-site')!=='same-origin')return new Response('Forbidden',{status:403});
  const service=await siteTaskService(); if(!service)return new Response('Unauthorized',{status:401});
  const form=await request.formData(),id=form.get('proposal_id'),decision=form.get('decision');
  if(typeof id!=='string'||!['approve','reject'].includes(String(decision)))return new Response('Invalid request',{status:400});
  try {await service.decide(id,decision==='approve')} catch {return new Response('Modificarea nu a fost aplicată. Propunerea poate fi expirată sau taskul s-a schimbat. Cere o propunere nouă.',{status:409})}
  return Response.redirect(`${commandCenterOrigin}/confirm-change?id=${encodeURIComponent(id)}`,303);
}
