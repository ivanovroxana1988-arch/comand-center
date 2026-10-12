'use client';
import {useEffect,useState} from 'react';
import './mobile-app.css';
import PushControls from './push-controls';
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export default function MobileApp(){
 const [status,setStatus]=useState('Se conectează…'),[install,setInstall]=useState<InstallPrompt|null>(null),[installed,setInstalled]=useState(false),[help,setHelp]=useState(false);
 useEffect(()=>{
  setInstalled(matchMedia('(display-mode: standalone)').matches||!!(navigator as Navigator&{standalone?:boolean}).standalone);
  const capture=(e:Event)=>{e.preventDefault();setInstall(e as InstallPrompt)};
  const done=()=>{setInstalled(true);setInstall(null)};
  window.addEventListener('beforeinstallprompt',capture);window.addEventListener('appinstalled',done);
  if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});
  return()=>{window.removeEventListener('beforeinstallprompt',capture);window.removeEventListener('appinstalled',done)};
 },[]);
 useEffect(()=>{
  let source:EventSource|null=null,expired=false;
  const refresh=()=>window.dispatchEvent(new Event('workspace-change'));
  const close=()=>{source?.close();source=null};
  const connect=()=>{
   close();if(document.hidden)return;
   if(!navigator.onLine){setStatus('Fără conexiune');return}
   if(expired)return;
   setStatus('Se conectează…');source=new EventSource('/api/workspace-events');
   source.onopen=()=>{setStatus('Sincronizare activă');refresh()};
   source.addEventListener('workspace',()=>{setStatus('Sincronizat');refresh()});
   source.addEventListener('auth-expired',()=>{expired=true;close();setStatus('Autentificare necesară')});
   source.onerror=()=>{if(source?.readyState===EventSource.CLOSED){expired=true;close();setStatus('Autentificare necesară')}else setStatus(navigator.onLine?'Se reconectează…':'Fără conexiune')};
  };
  const visibility=()=>{if(document.hidden)close();else{refresh();connect()}};
  const offline=()=>{close();setStatus('Fără conexiune')};
  connect();document.addEventListener('visibilitychange',visibility);window.addEventListener('online',connect);window.addEventListener('offline',offline);
  return()=>{close();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',connect);window.removeEventListener('offline',offline)};
 },[]);
 async function installApp(){
  if(!install){setHelp(v=>!v);return}
  await install.prompt();const choice=await install.userChoice;
  if(choice.outcome==='accepted')setInstalled(true);setInstall(null);
 }
 return <div className="app-dock"><PushControls/><span className="sync-status" role="status"><i className={status==='Sincronizat'||status==='Sincronizare activă'?'connected':''}/>{status}</span>{!installed&&<button onClick={installApp}>Instalează aplicația</button>}{status==='Autentificare necesară'&&<a href="/auth/google/start">Conectare Google</a>}{help&&<div className="install-help"><strong>Command Center pe telefon</strong><p>Android: deschide în Chrome → meniul ⋮ → Instalează aplicația / Adaugă pe ecranul de pornire.</p><p>iPhone: deschide în Safari → Partajează → Adaugă pe ecranul principal.</p><button onClick={()=>setHelp(false)}>Am înțeles</button></div>}</div>;
}
