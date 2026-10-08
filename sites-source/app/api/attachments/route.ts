import {env} from 'cloudflare:workers';
import {siteUser} from '../../../lib/site-task-service';
import {storeAttachment,attachmentLimit as limit,AttachmentError} from '../../../lib/attachments.mjs';
export async function GET(){if(!(await siteUser())?.id)return Response.json({error:'Autentificare necesară.'},{status:401});try{const rows=await env.DB.prepare('SELECT id,task_id AS taskId,name,size,created_at AS createdAt FROM task_attachments ORDER BY created_at').all();return Response.json({attachments:rows.results},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'Atașamentele nu au putut fi încărcate.'},{status:500})}}
export async function POST(request:Request){
 const user=(await siteUser())?.id;if(!user)return Response.json({error:'Autentificare necesară.'},{status:401});
 if(Number(request.headers.get('content-length'))>limit+65536)return Response.json({error:'Maximum 20 MB per fișier.'},{status:413});
 try{const form=await request.formData();const attachment=await storeAttachment(env.DB,env.BUCKET,user,Number(form.get('taskId')),form.get('file'));return Response.json({attachment},{status:201})}catch(e){return Response.json({error:e instanceof AttachmentError?e.message:'Fișierul nu a putut fi atașat.'},{status:e instanceof AttachmentError?e.status:500})}
}
