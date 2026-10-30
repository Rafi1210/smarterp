'use client';
import {authFetch as fetch} from '@/lib/client-api';
import {useEffect,useId,useState} from 'react';
export const referenceResources={customer_id:'customers',supplier_id:'suppliers',employee_id:'employees',item_id:'items',finished_item_id:'items',component_item_id:'items',source_sales_id:'sales',purchase_id:'purchases',workorder_id:'workorders',bom_id:'bom',attendance_id:'attendance',depends_on:'tasks'};
export default function RecordPicker({resource,dataset,value,onChange,required=false,disabled=false,label,kind=''}){
 const id=useId(),[rows,setRows]=useState([]),[error,setError]=useState('');
 useEffect(()=>{const abort=new AbortController();const timer=setTimeout(()=>{setError('');const query=new URLSearchParams({dataset,search:value||'',size:'25',sort:'external_id',direction:'asc',...(kind?{kind}:{})});fetch(`/api/records/${resource}?${query}`,{signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.data)}).catch(e=>{if(e.name!=='AbortError')setError(e.message)});},180);return()=>{clearTimeout(timer);abort.abort()}},[resource,dataset,value,kind]);
 const selected=rows.find(r=>r.external_id===value);
 return <><input aria-label={label} list={id} value={value} onChange={e=>onChange(e.target.value)} placeholder="Search code or name…" required={required} disabled={disabled} autoComplete="off"/><datalist id={id}>{rows.map(r=><option key={r.id} value={r.external_id}>{r.name} · {r.status}</option>)}</datalist><small className={error?'text-error':'field-hint'}>{error||selected?.name||'Select a saved record code. Type to search.'}</small></>
}
