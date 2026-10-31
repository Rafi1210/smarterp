'use client';
import {authFetch as fetch} from '@/lib/client-api';
import {useEffect,useState} from 'react';
import {makeRequestKey} from '@/lib/request-key';
import {useSession} from './session-context';
import {MILESTONES} from '@/lib/workspace-config';
import {Save,Hash,Users,ArrowRight,AlertTriangle} from 'lucide-react';
import {Button} from './ui/button';
import RecordPicker,{referenceResources} from './record-picker';
export default function RecordForm({resource,dataset,config,onCreated,kind=''}){
 const user=useSession(),buyer=resource==='customers';
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const [requestKey]=useState(()=>makeRequestKey()),[values,setValues]=useState(Object.fromEntries(config.fields.map(f=>[f.key,f.key==='line_id'?'1':['date','due_date','delivery_date','planned_start'].includes(f.key)?today:f.key==='kind'&&kind?kind:'']))),[error,setError]=useState(''),[busy,setBusy]=useState(false),[duplicates,setDuplicates]=useState(null),[duplicateConfirmed,setDuplicateConfirmed]=useState(false),[duplicateReason,setDuplicateReason]=useState('');
 useEffect(()=>{setDuplicateConfirmed(false);if(!buyer||dataset!=='smarterp-demo')return;const a=new AbortController();const timer=setTimeout(()=>{const p=new URLSearchParams({dataset,view:'duplicates',name:values.name||'',email:values.email||'',phone:values.phone||'',registration_no:values.registration_no||'',external_id:values.external_id||''});fetch('/api/records/customers?'+p,{signal:a.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setDuplicates(d);}).catch(e=>{if(e.name!=='AbortError')setDuplicates(null)});},350);return()=>{clearTimeout(timer);a.abort();};},[buyer,dataset,values.name,values.email,values.phone,values.registration_no,values.external_id]);
 async function save(e){
  e.preventDefault();const form=new FormData(e.currentTarget),row={...values};for(const key of ['date','due_date','delivery_date','planned_start'])if(Object.hasOwn(row,key))row[key]=String(form.get(key)||row[key]);
  setBusy(true);setError('');try{const duplicate_ack=duplicateConfirmed?{fingerprint:duplicates?.fingerprint,reason:duplicateReason}:undefined;const r=await fetch(`/api/records/${resource}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataset,rows:[row],request_key:requestKey,duplicate_ack})});const data=await r.json();if(!r.ok){if(data.details?.code==='POSSIBLE_DUPLICATE_BUYER'){setDuplicates(data.details);setDuplicateConfirmed(false);}throw Error(data.error);}onCreated(data.record);}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 function control(f){
  const reference=referenceResources[f.key]||(f.key==='source_id'&&resource==='invoices'?(values.kind==='PURCHASE'?'purchases':'sales'):f.key==='target_id'&&resource==='payments'?(values.kind==='SALARY'?'payroll':'invoices'):null);
  const set=v=>setValues({...values,[f.key]:v,...(f.key==='kind'&&['invoices','payments'].includes(resource)?{source_id:'',target_id:''}:{})});
  if(reference)return <RecordPicker resource={reference} dataset={dataset} label={f.key==='customer_id'?'Buyer / customer':f.label} value={values[f.key]||''} onChange={set} required={f.required} disabled={busy}/>;
  if(f.key==='kind'){const options=resource==='invoices'&&user?.role==='operations'?['PURCHASE']:resource==='items'?['raw','finished']:resource==='payments'?['CUSTOMER','SUPPLIER','SALARY']:['SALES','PURCHASE'];return <select value={values[f.key]} required disabled={busy} onChange={e=>set(e.target.value)}><option value="">Choose type</option>{options.map(s=><option key={s}>{s}</option>)}</select>;}
  if(f.key==='milestone')return <select required value={values[f.key]||''} onChange={e=>set(e.target.value)}><option value="">Choose milestone</option>{Object.entries(MILESTONES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>;
  if(f.key==='priority')return <select value={values[f.key]||'Normal'} onChange={e=>set(e.target.value)}>{['Low','Normal','High'].map(s=><option key={s}>{s}</option>)}</select>;
  if(f.key==='uom')return <select value={values[f.key]} required onChange={e=>set(e.target.value)}><option value="">Choose base unit</option><option value="kg">Kilograms (kg)</option><option value="pieces">Pieces</option></select>;
  const max=f.key==='external_id'?80:{name:200,email:200,country:100,phone:40,contact_person:160,address:500,registration_no:100}[f.key];
  return <input name={f.key} required={f.key!=='external_id'&&f.required} disabled={busy} maxLength={max} placeholder={f.key==='external_id'?'Assigned automatically on save':undefined} type={['date','due_date','delivery_date','planned_start'].includes(f.key)?'date':f.key==='period'?'month':f.key==='email'?'email':'text'} {...(['date','due_date','delivery_date','planned_start'].includes(f.key)?{defaultValue:values[f.key]||''}:{value:values[f.key]||''})} onChange={e=>set(e.target.value)} autoComplete="off"/>;
 }
 const codeLabel=buyer?'Buyer code (optional)':{suppliers:'Supplier code (optional)',items:'Item code (optional)',employees:'Employee code (optional)'}[resource]||'Document no. / code (optional)';
 return <form onSubmit={save}>
  {error&&<div className="error" role="alert">{error}</div>}
  <div className="form-callout"><Hash size={17}/><span>{buyer?'One buyer record can have many orders. Leave Buyer code blank for an automatic CUS number.':'Leave the code blank for the next automatic number. CSV imports retain the supplied source IDs.'}</span></div>
  <div className="form-grid">{config.fields.map(f=><label className="field" key={f.key}>{f.key==='external_id'?codeLabel:f.key==='customer_id'?'Buyer / customer':f.label.replaceAll('_',' ')}{f.key!=='external_id'&&f.required?' *':''}{control(f)}</label>)}</div>
  {buyer&&duplicates?.matches?.length>0&&<section className="duplicate-panel" aria-label="Possible duplicate buyers"><div className="panel-heading"><h4><Users size={17}/> A similar buyer is already saved</h4><AlertTriangle size={18}/></div><p>Select the existing buyer to keep its orders together. Shared contact details can also belong to different companies.</p>{duplicates.matches.map(r=><div className="duplicate-row" key={r.id}><span><b>{r.name}</b><small>{[r.external_id,r.country,r.email,r.status==='Archived'?'Archived':null].filter(Boolean).join(' · ')}</small><small>{r.reasons.join(' · ')}</small></span><Button type="button" size="sm" variant="outline" onClick={()=>onCreated({...r,resource:'customers',dataset_id:dataset})}>Open existing<ArrowRight size={13}/></Button></div>)}<label className="check-line"><input type="checkbox" checked={duplicateConfirmed} onChange={e=>setDuplicateConfirmed(e.target.checked)}/>This is a separate buyer; create a different code.</label>{duplicateConfirmed&&<label className="field">Why is this a different buyer?<input required minLength={6} maxLength={500} value={duplicateReason} onChange={e=>setDuplicateReason(e.target.value)} placeholder="For example: separate registered company sharing the purchasing office"/></label>}</section>}
  <p className="muted">{config.grouped?'One line in this form; CSV supports complete multi-line drafts. Posting supports one finished style and one fabric component. ':''}{buyer?'Use this saved buyer again when creating its next order.':'Transactions are saved as Draft. Posting is a separate action.'}</p>
  <div className="toolbar"><Button type="submit" disabled={busy}><Save size={16}/>{busy?'Saving…':buyer?'Save buyer':config.grouped?'Save draft':'Save record'}</Button></div>
 </form>;
}
