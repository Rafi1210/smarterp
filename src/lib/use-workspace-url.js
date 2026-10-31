'use client';
import {useEffect} from 'react';
import {useSearchParams,usePathname} from 'next/navigation';
import {readValues,queryPatch,withQuery} from './workspace-routes';
// Next.js integrates native same-page History changes with its search-param hook.
// Module navigation still goes through the App Router; query changes do not reload it.
export function updateWorkspaceQuery(patch,{replace=false,defaults={}}={}){
 const href=withQuery(window.location.pathname,queryPatch(window.location.search,patch,defaults))+window.location.hash;
 if(href===window.location.pathname+window.location.search+window.location.hash)return;
 window.history[replace?'replaceState':'pushState'](null,'',href);
}
export function useUrlState(defaults){
 const search=useSearchParams(),pathname=usePathname(),values=readValues(search,defaults);
 // Store the first resolved date scope so copied links keep their exact dates.
 useEffect(()=>{const p=new URLSearchParams(window.location.search),patch={};for(const key of ['from','to','month'])if(defaults[key]&&!p.has(key))patch[key]=defaults[key];if(Object.keys(patch).length)updateWorkspaceQuery(patch,{replace:true});},[pathname]);
 function setValues(next,options={}){const current=readValues(window.location.search,defaults),result=typeof next==='function'?next(current):next;const patch={};for(const key of Object.keys(defaults))if(String(current[key])!==String(result[key]??defaults[key]))patch[key]=result[key]??defaults[key];if(Object.keys(patch).length)updateWorkspaceQuery(patch,{...options,defaults});}
 return [values,setValues];
}
export function urlFieldSetter(key,defaults){return value=>{const current=readValues(window.location.search,defaults);updateWorkspaceQuery({[key]:typeof value==='function'?value(current[key]):value},{defaults,replace:key==='search'});};}
