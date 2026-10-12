export function localDay(date=new Date()){
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
const priorities={'Urgentă':0,'Ridicată':1,'Medie':2,'Scăzută':3};
export function orderTasks(tasks){
 return [...tasks].sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||(priorities[a.priority]??2)-(priorities[b.priority]??2)||a.id-b.id);
}
export function todayGroups(tasks,owner,today=localDay()){
 const groups={mine:[],waiting:[],late:[]};
 if(!['Roxana','Bogdan'].includes(owner))return groups;
 for(const task of orderTasks(tasks)){
  if(task.status==='Finalizat'||![owner,'Împreună'].includes(task.owner))continue;
  if(task.dueDate&&task.dueDate<today)groups.late.push(task);
  else if(task.status==='Așteptăm'||/follow[\s-]*up/i.test(task.title))groups.waiting.push(task);
  else groups.mine.push(task);
 }
 return groups;
}
export function teamGroups(tasks){
 return ['Roxana','Bogdan','Împreună'].map(owner=>({owner,tasks:orderTasks(tasks.filter(t=>t.owner===owner&&t.status!=='Finalizat'))}));
}
