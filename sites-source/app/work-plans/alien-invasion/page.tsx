import { plan,project } from '../../../lib/alien-invasion-plan.mjs';
import { siteTaskService } from '../../../lib/site-task-service';
export const dynamic='force-dynamic';
export default async function WorkPlan(){
 const service=await siteTaskService();
 const saved=service?(await service.list({area:'Board Games & Simulations',project,limit:100})).tasks:[];
 const complete=plan.every(p=>saved.some((t:{title:string})=>t.title===p.title));
 return <main style={{maxWidth:900,margin:'40px auto',padding:28,background:'#f0f8ff',borderRadius:24,color:'#17364c'}}><a href="/">← Command Center</a><h1>{project}</h1><p>Board Games &amp; Simulations · 12 participanți · fără termene-limită impuse</p><ol>{plan.map(t=><li key={t.title} style={{marginBottom:24}}><h2 style={{fontSize:20}}>{t.title} — {t.owner}</h2><p>{t.nextStep}</p><p>{t.notes}</p></li>)}</ol>{complete?<p role="status">Cele șase taskuri sunt salvate în dashboard.</p>:<form action="/api/work-plans/alien-invasion" method="post"><input type="hidden" name="confirmed" value="true"/><button disabled={!service} style={{padding:14,background:'#b9e1fa',borderRadius:12}}>Confirmă și salvează cele 6 taskuri</button><p>Salvarea repetată nu dublează taskurile. Status inițial: De făcut.</p></form>}</main>
}
