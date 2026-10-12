'use client';
import {useEffect,useRef} from 'react';
export function useWorkspaceRefresh(refresh:()=>Promise<unknown>,blocked=false){
 const latest=useRef(refresh),lock=useRef(blocked),pending=useRef(false),running=useRef(false);
 latest.current=refresh;lock.current=blocked;
 const run=async()=>{
  if(lock.current||running.current){pending.current=true;return}
  running.current=true;pending.current=false;
  try{await latest.current()}catch{/* The next connection/focus refresh retries. */}
  finally{running.current=false;if(pending.current&&!lock.current)void run()}
 };
 useEffect(()=>{if(!blocked&&pending.current)void run()},[blocked]);
 useEffect(()=>{
  const update=()=>{void run()};
  window.addEventListener('workspace-change',update);window.addEventListener('focus',update);
  return()=>{window.removeEventListener('workspace-change',update);window.removeEventListener('focus',update)};
 },[]);
}
