import {env} from 'cloudflare:workers';
import {siteUser} from '../../../../lib/site-task-service';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 if(!(await siteUser())?.id)return new Response('Autentificare necesară.',{status:401});
 const {id}=await params;
 const file=await env.DB.prepare('SELECT a.* FROM task_attachments a JOIN tasks t ON t.id=a.task_id WHERE a.id=?').bind(id).first();
 if(!file)return new Response('Fișierul nu există.',{status:404});
 const object=await env.BUCKET.get(file.object_key);if(!object)return new Response('Fișierul nu este disponibil.',{status:404});
 return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.name),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
}
