'use client';
import {useState} from 'react';
import {Archive,Trash2,RotateCcw,ShieldCheck,ArrowUpRight,AlertTriangle} from 'lucide-react';
import {authFetch as fetch} from '@/lib/client-api';
import {makeRequestKey} from '@/lib/request-key';
import {Button} from './ui/button';
import {Modal} from './ui/modal';
const explanations={delete_draft:'Remove this unused Draft from current lists. Its code, original content, links and activity remain in Deleted drafts for audit. Restore it from that view if needed.',archive:'Remove this master record from current lists and new document selections. Existing history stays linked. You can restore it later.',restore:'Return this archived record or deleted Draft to its previous state. Its original code and history stay the same; inactive sources must be restored first.',cancel_document:'Cancel this unposted document. Its source number and activity history remain available.',reverse_payment:'Create an opposite cash voucher and balanced journal, undo this payment allocation and reopen the invoice/bill or payroll balance. Original postings stay immutable. A salary reversal also marks the original payslip Reversed. This records a correction; it does not contact a bank.'};
export default function RecordLifecycle({record,dataset,onChanged,onRelated}){
 const [selected,setSelected]=useState(null),[reason,setReason]=useState(''),[confirmation,setConfirmation]=useState(''),[date,setDate]=useState(''),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[blocked,setBlocked]=useState([]);
 const meta=record.lifecycle;if(!meta)return null;
 const icons={delete_draft:Trash2,archive:Archive,restore:RotateCcw,cancel_document:Archive,reverse_payment:RotateCcw};
 const protectedState=['Deleted','Archived','Reversed'].includes(record.status);
 function open(action){setSelected(action);setReason('');setConfirmation('');setError('');setBlocked([]);setKey(makeRequestKey());setDate(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));}
 async function apply(e){e.preventDefault();setBusy(true);setError('');setBlocked([]);try{
  const response=await fetch(`/api/records/${record.resource}/lifecycle`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataset,id:record.id,action:selected.action,reason,request_key:key,...(selected.action==='reverse_payment'?{date}:{})})});
  const data=await response.json();if(!response.ok){setBlocked(data.details?.records||[]);throw Error(data.error);}setSelected(null);onChanged(data);
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 return <>
  {protectedState&&<div className="lifecycle-notice"><ShieldCheck size={18}/><span><b>{record.status==='Deleted'?'Deleted draft · retained for audit':record.status==='Reversed'?'Reversed · original history retained':'Archived · unavailable for new documents'}</b><small>{record.data.lifecycle?.reason||record.data.reversal_reason||meta.note}</small></span></div>}
  {!!meta.actions?.length&&<details className="record-management no-print"><summary><Archive size={15}/>Manage this record<span>{meta.actions.map(a=>a.label).join(' · ')}</span></summary><p>{meta.note}</p>{meta.pending_review&&<p className="text-error">A review is pending. Cancel or return it in Approval Inbox first.</p>}{meta.blocked_documents>0&&<p className="muted">{meta.blocked_documents}{meta.more?'+':''} related document(s) protect this record from removal.</p>}<div className="toolbar">{meta.actions.map(a=>{const Icon=icons[a.action]||Archive;return <Button key={a.action} variant={['delete_draft','reverse_payment','cancel_document'].includes(a.action)?'danger':'outline'} onClick={()=>open(a)}><Icon size={14}/>{a.label}</Button>})}</div></details>}
  <Modal open={Boolean(selected)} onOpenChange={value=>{if(!busy&&!value)setSelected(null)}} title={selected?.label||'Manage record'} description={record.external_id}>
   <form onSubmit={apply}><div className="lifecycle-explanation"><AlertTriangle size={19}/><p>{explanations[selected?.action]}</p></div>{error&&<div className="error" role="alert">{error}</div>}{blocked.map(r=><Button key={r.id} size="sm" variant="outline" onClick={()=>{setSelected(null);onRelated(r)}}>{r.external_id}<ArrowUpRight size={12}/></Button>)}
    {selected?.action==='reverse_payment'&&<label className="field">Reversal business date<input type="date" required min={record.business_date?.slice(0,10)} max={new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())} value={date} onChange={e=>setDate(e.target.value)}/></label>}
    <label className="field">Reason<input aria-label="Record action reason" required minLength={6} maxLength={500} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)} placeholder="Explain the correction or why this record is no longer needed"/></label>
    {selected?.action!=='restore'&&<label className="field">Type {record.external_id} to confirm<input aria-label="Confirm record code" required value={confirmation} disabled={busy} onChange={e=>setConfirmation(e.target.value)} autoComplete="off"/></label>}
    <div className="toolbar"><Button type="submit" variant={selected?.action==='restore'?'default':'danger'} disabled={busy||(selected?.action!=='restore'&&confirmation!==record.external_id)}>{busy?'Applying…':selected?.label}</Button><Button variant="outline" disabled={busy} onClick={()=>setSelected(null)}>Back</Button></div>
   </form>
  </Modal>
 </>;
}
