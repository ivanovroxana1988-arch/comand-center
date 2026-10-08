export const attachmentLimit=20*1024*1024;
export class AttachmentError extends Error{constructor(message,status=400){super(message);this.status=status}}
export async function storeAttachment(db,bucket,user,taskId,file){
 if(!user)throw new AttachmentError('Autentificare necesară.',401);
 if(!Number.isSafeInteger(taskId)||taskId<1||!(file instanceof File)||!file.size)throw new AttachmentError('Alege un task și un fișier.');
 if(file.size>attachmentLimit)throw new AttachmentError('Maximum 20 MB per fișier.',413);
 if(!await db.prepare('SELECT id FROM tasks WHERE id=?').bind(taskId).first())throw new AttachmentError('Taskul nu există.',404);
 const id=crypto.randomUUID(),name=file.name.replace(/[\u0000-\u001f\u007f/\\]/g,'_').slice(0,240)||'document',mime=file.type||'application/octet-stream',key='task-attachments/'+id,createdAt=new Date().toISOString();
 try{await bucket.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:mime}});await db.prepare('INSERT INTO task_attachments(id,task_id,name,size,mime,object_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,taskId,name,file.size,mime,key,user,createdAt).run();return{id,taskId,name,size:file.size,createdAt}}
 catch(error){await bucket.delete(key).catch(()=>{});throw error}
}
