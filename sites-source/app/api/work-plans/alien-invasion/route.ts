import { env } from 'cloudflare:workers';
import { siteTaskService, commandCenterOrigin } from '../../../../lib/site-task-service';
import { savePlan } from '../../../../lib/alien-invasion-plan.mjs';
export async function POST(request:Request){
 if(!await siteTaskService())return Response.json({error:'Autentificarea este necesară.'},{status:401});
 if(request.headers.get('origin')!==commandCenterOrigin)return new Response('Forbidden',{status:403});
 const data=await request.formData();
 if(data.get('confirmed')!=='true')return Response.json({error:'Confirmarea este necesară.'},{status:400});
 await savePlan(env.DB);
 return Response.redirect(new URL('/work-plans/alien-invasion?saved=1',commandCenterOrigin),303);
}
