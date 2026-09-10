import { siteTaskService } from '../../lib/site-task-service';
export const dynamic='force-dynamic';
const labels:Record<string,string>={title:'Task',area:'Arie',project:'Proiect',owner:'Responsabil',dueDate:'Termen',status:'Status',priority:'Prioritate',nextStep:'Următorul pas',link:'Documente',notes:'Observații',parent_task_id:'Task părinte'};
export default async function ConfirmChange({searchParams}:{searchParams:Promise<{id?:string}>}) {
  const {id}=await searchParams;
  const service=await siteTaskService();
  if(!service)return <main style={{padding:32}}>Autentifică-te în Command Center pentru a verifica propunerea.</main>;
  let p;try{p=await service.proposal(id||'')}catch{return <main style={{padding:32}}>Propunerea nu există sau nu îți aparține.</main>}
  const before=JSON.parse(p.before_json),after={...before,...JSON.parse(p.payload)};
  const active=p.status==='pending'&&p.expires_at>new Date().toISOString();
  return <main style={{maxWidth:900,margin:'40px auto',padding:24}}><h1>Confirmă modificarea</h1><p>Verifică schimbările propuse pentru Command Center.</p>
    <table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Câmp</th><th>Înainte</th><th>După</th></tr></thead><tbody>{Object.entries(labels).filter(([k])=>!before||before[k]!==after[k]).map(([k,label])=><tr key={k}><th style={{padding:12}}>{label}</th><td style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{String(before?.[k]??'—')}</td><td style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{String(after[k]??'—')}</td></tr>)}</tbody></table>
    {active?<form action="/api/task-changes/decide" method="post"><input type="hidden" name="proposal_id" value={p.id}/><button name="decision" value="approve" style={{padding:12,margin:12}}>Confirmă și salvează</button><button name="decision" value="reject" style={{padding:12}}>Anulează</button></form>:<p>{p.status==='applied'?'Modificarea a fost salvată.':p.status==='cancelled'?'Propunerea a fost anulată.':'Propunerea a expirat.'}</p>}
    <p><a href="/">Înapoi la Command Center</a></p></main>;
}
