import { env } from 'cloudflare:workers';
import {siteUser} from '../../../../lib/site-task-service';
import { licitatiiService, ModuleError } from '../../../../lib/licitatii/service.mjs';

async function handle(request:Request,method:string,kind:string){
  try {
    const id=(await siteUser())?.id;
    if(!id)return Response.json({error:'Autentificare necesară.'},{status:401});
    if(method!=='GET'){
      const origin=request.headers.get('origin');
      if(!origin||origin!==new URL(request.url).origin)return Response.json({error:'Origine nepermisă.'},{status:403});
    }
    const service=licitatiiService(env.DB,{id}),url=new URL(request.url);
    if(method==='GET'){
      const recordId=url.searchParams.get('id');
      return Response.json(recordId?{item:await service.get(kind,recordId)}:await service.list(kind,Object.fromEntries(url.searchParams)));
    }
    const input=await request.json();
    if(method==='POST'&&kind==='configurations'&&input.action==='evaluate')return Response.json(await service.evaluate(input.id,input.prices||{}));
    if(method==='POST'&&input.action==='propose-task')return Response.json(await service.proposeTask(kind,input.id,input.task||{}),{status:201});
    if(method==='POST')return Response.json({item:await service.create(kind,input)},{status:201});
    const {id:recordId,version,...patch}=input;
    return Response.json({item:await service.update(kind,recordId,version,patch)});
  }catch(error){
    if(error instanceof ModuleError)return Response.json({error:error.message},{status:error.status});
    if(error instanceof SyntaxError)return Response.json({error:'JSON invalid.'},{status:400});
    console.error('Licitații module request failed',error);
    return Response.json({error:'Nu am putut salva sau încărca datele. Încearcă din nou.'},{status:500});
  }
}
type Context={params:Promise<{kind:string}>};
export async function GET(r:Request,c:Context){return handle(r,'GET',(await c.params).kind)}
export async function POST(r:Request,c:Context){return handle(r,'POST',(await c.params).kind)}
export async function PATCH(r:Request,c:Context){return handle(r,'PATCH',(await c.params).kind)}
