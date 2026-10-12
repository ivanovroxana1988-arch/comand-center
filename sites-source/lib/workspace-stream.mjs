const encoder=new TextEncoder();
export function pause(ms,signal){
 return new Promise(resolve=>{
  if(signal.aborted)return resolve();
  const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve()};
  const timer=setTimeout(done,ms);signal.addEventListener('abort',done,{once:true});
 });
}
// Only a revision number travels over this authenticated connection.
// Task details continue to use the existing authenticated APIs.
export function workspaceStream({readRevision,authorized,signal,interval=2000,wait=pause}){
 const stop=new AbortController();let previous=null,closed=false;
 const abort=()=>stop.abort();signal?.addEventListener('abort',abort,{once:true});
 if(signal?.aborted)abort();
 const cleanup=()=>{stop.abort();signal?.removeEventListener('abort',abort)};
 const body=new ReadableStream({
  async pull(controller){
   if(closed)return;
   try{
    if(stop.signal.aborted){closed=true;controller.close();cleanup();return}
    if(!await authorized()){
     controller.enqueue(encoder.encode('event: auth-expired\ndata: {}\n\n'));
     closed=true;controller.close();cleanup();return;
    }
    const revision=await readRevision();
    if(stop.signal.aborted){closed=true;controller.close();cleanup();return}
    controller.enqueue(encoder.encode(previous!==revision?`retry: 3000\nevent: workspace\ndata: ${JSON.stringify({revision})}\n\n`:': heartbeat\n\n'));
    previous=revision;await wait(interval,stop.signal);
   }catch(error){if(!closed&&!stop.signal.aborted){closed=true;controller.error(error)}cleanup()}
  },
  cancel(){closed=true;cleanup()},
 });
 return new Response(body,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'private, no-store, no-transform','X-Content-Type-Options':'nosniff'}});
}
