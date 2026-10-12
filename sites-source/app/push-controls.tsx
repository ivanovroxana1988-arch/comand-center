'use client';
import {useEffect,useState} from 'react';
const api=async(path:string,init?:RequestInit)=>{const r=await fetch(path,init),d=await r.json();if(!r.ok)throw new Error(d.error||'Operațiunea nu a reușit.');return d};
export default function PushControls(){
 const [supported,setSupported]=useState(false),[active,setActive]=useState(false),[owner,setOwner]=useState(''),[publicKey,setPublicKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[settings,setSettings]=useState(false);
 useEffect(()=>{
  setSupported('Notification'in window&&'PushManager'in window&&'serviceWorker'in navigator);
  api('/api/notifications').then(async d=>{setOwner(d.owner);setPublicKey(d.publicKey);if('serviceWorker'in navigator){const r=await navigator.serviceWorker.ready,s=await r.pushManager?.getSubscription();if(s){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s.endpoint)));const id=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');setActive(d.subscriptions.includes(id))}}}).catch(()=>{});
 },[]);
 async function enable(){
  setMessage('');setBusy(true);
  try{
   const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Permisiunea de notificare nu a fost acordată. O poți modifica în setările telefonului.');
   const key=publicKey||((await api('/api/notifications')).publicKey);const registration=await navigator.serviceWorker.ready;
   const padded=key+'='.repeat((4-key.length%4)%4),bytes=Uint8Array.from(atob(padded.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
   const subscription=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
   const data=await api('/api/notifications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint:subscription.endpoint,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone})});
   setOwner(data.owner);setActive(true);setMessage('Notificările pentru '+data.owner+' sunt active pe acest dispozitiv.');
  }catch(e){setMessage(e instanceof Error?e.message:'Activarea nu a reușit.')}finally{setBusy(false)}
 }
 async function action(disable=false){setBusy(true);try{const registration=await navigator.serviceWorker.ready,subscription=await registration.pushManager.getSubscription();if(!subscription)throw new Error('Activează notificările mai întâi.');await api(disable?'/api/notifications':'/api/notifications/test',{method:disable?'DELETE':'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint:subscription.endpoint})});if(disable){await subscription.unsubscribe();setActive(false);setMessage('Notificări dezactivate pe acest dispozitiv.')}else setMessage('Notificarea de test a fost trimisă pe acest dispozitiv.')}catch(e){setMessage(e instanceof Error?e.message:'Operațiunea nu a reușit.')}finally{setBusy(false)}}
 return <div className="push-controls">{supported?<><button disabled={busy||!owner} onClick={active?()=>setSettings(v=>!v):enable}>{active?'Notificări · '+owner:'Activează notificările'}</button>{active&&settings&&<><button disabled={busy} onClick={()=>action()}>Test</button><button disabled={busy} onClick={()=>action(true)}>Oprește</button></>}</>:<button onClick={()=>setMessage('Pe iPhone, instalează aplicația pe ecranul principal și activează notificările de acolo. Pe Android, folosește Chrome.')}>Notificări pe telefon</button>}{message&&<div className="push-message" role="status">{message}<button onClick={()=>setMessage('')}>Închide</button></div>}</div>;
}
