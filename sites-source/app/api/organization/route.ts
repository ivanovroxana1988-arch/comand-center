import {env} from 'cloudflare:workers';
import {siteUser} from '../../../lib/site-task-service';
import {organizationService,OrganizationError} from '../../../lib/organization.mjs';
async function authorized(){return !!(await siteUser())}
export async function GET(){if(!await authorized())return Response.json({error:'Autentificare necesară.'},{status:401});try{return Response.json(await organizationService(env.DB).get(),{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Organizarea nu a putut fi încărcată.'},{status:500})}}
export async function POST(request:Request){if(!await authorized())return Response.json({error:'Autentificare necesară.'},{status:401});try{const body=await request.json();const service=organizationService(env.DB);return Response.json(body.action==='undo'?await service.undo(body):await service.move(body))}catch(e){return Response.json({error:e instanceof OrganizationError?e.message:'Modificarea nu a fost salvată.'},{status:e instanceof OrganizationError?409:500})}}
