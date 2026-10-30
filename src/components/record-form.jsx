'use client';
import {authFetch as fetch} from '@/lib/client-api';
import {useState} from 'react';import {makeRequestKey} from '@/lib/request-key';
import {useSession} from './session-context';
import {MILESTONES} from '@/lib/workspace-config';
import {Save,Hash} from 'lucide-react';
import {Button} from './ui/button';
import RecordPicker,{referenceResources} from './record-picker';
export default function RecordForm({resource,dataset,config,onCreated,kind=''}){
 const user=useSession();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const [requestKey]=useState(()=>makeRequestKey()),[values,setValues]=useState(Object.fromEntries(config.fields.map(f=>[f.key,f.key==='line_id'?'1':['date','due_date','delivery_date','planned_start'].includes(f.key)?today:f.key==='kind'&&kind?kind:'']))),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function save(e){e.preventDefault();const form=new FormData(e.currentTarget),row={...values};for(const key of ['date','due_date','delivery_date','planned_start'])if(Object.hasOwn(row,key))row[key]=String(form.get(key)||row[key]);setBusy(true);setError('');try{const r=await fetch(`/api/records/${resource}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataset,rows:[row],request_key:requestKey})});const data=await r.json();if(!r.ok)throw Error(data.error);onCreated(data.record)}catch(e){setError(e.message)}finally{setBusy(false)}}
 function control(f){const reference=referenceResources[f.key]||(f.key==='source_id'&&resource==='invoices'?(values.kind==='PURCHASE'?'purchases':'sales'):f.key==='target_id'&&resource==='payments'?(values.kind==='SALARY'?'payroll':'invoices'):null);const set=v=>setValues({...values,[f.key]:v});
  if(reference)return <RecordPicker resource={reference} dataset={dataset} label={f.label} value={values[f.key]||''} onChange={set} required={f.required} disabled={busy}/>;
  if(f.key==='kind'){const options=resource==='invoices'&&user?.role==='operations'?['PURCHASE']:resource==='items'?['raw','finished']:resource==='payments'?['CUSTOMER','SUPPLIER','SALARY']:['SALES','PURCHASE'];return <select value={values[f.key]} required disabled={busy} onChange={e=>set(e.target.value)}><option value="">Choose type</option>{options.map(s=><option key={s}>{s}</option>)}</select>}
  if(f.key==='milestone')return <select required value={values[f.key]||''} onChange={e=>set(e.target.value)}><option value="">Choose milestone</option>{Object.entries(MILESTONES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>;
  if(f.key==='priority')return <select value={values[f.key]||'Normal'} onChange={e=>set(e.target.value)}>{['Low','Normal','High'].map(s=><option key={s}>{s}</option>)}</select>;
  if(f.key==='uom')return <select value={values[f.key]} required onChange={e=>set(e.target.value)}><option value="">Choose base unit</option><option value="kg">Kilograms (kg)</option><option value="pieces">Pieces</option></select>;
  return <input name={f.key} required={f.key!=='external_id'&&f.required} disabled={busy} maxLength={f.key==='external_id'?80:undefined} placeholder={f.key==='external_id'?'Assigned automatically on save':undefined} type={['date','due_date','delivery_date','planned_start'].includes(f.key)?'date':f.key==='period'?'month':'text'} {...(['date','due_date','delivery_date','planned_start'].includes(f.key)?{defaultValue:values[f.key]||''}:{value:values[f.key]||''})} onChange={e=>set(e.target.value)} autoComplete="off"/>;
 }
 return <form onSubmit={save}>{error&&<div className="error" role="alert">{error}</div>}<div className="form-callout"><Hash size={17}/><span>Leave the document number blank for the next number in its series. CSV imports keep your supplied source IDs.</span></div><div className="form-grid">{config.fields.map(f=><label className="field" key={f.key}>{f.key==='external_id'?'Document no. / code (optional)':f.label.replaceAll('_',' ')}{f.key!=='external_id'&&f.required?' *':''}{control(f)}</label>)}</div><p className="muted">{config.grouped?'One line in this form; CSV supports complete multi-line drafts. Posting currently supports one finished style and one fabric component. ':''}Transactions are saved as Draft. Posting is a separate action.</p><div className="toolbar"><Button type="submit" disabled={busy}><Save size={16}/>{busy?'Saving…':'Save draft / record'}</Button></div></form>
}
