'use client';
import {Check,ChevronRight} from 'lucide-react';
import {statusInfo} from '@/lib/status';
export default function OrderJourney({journey,onRecord,currentID}){
 if(!journey)return null;
 return <section className="order-journey no-print"><div className="row"><div><h4>Order journey</h4><p className="muted">{journey.sales.external_id} · Open a saved step to continue.</p></div><button className="record-link" onClick={()=>onRecord(journey.sales)}>Sales order <ChevronRight size={13}/></button></div><div className="journey-grid">{journey.steps.map((step,index)=>{const s=statusInfo(step.record?.status);return <button key={step.label} disabled={!step.record||step.record.id===currentID} className={'journey-step '+(step.done?'complete':'')+(step.record?.id===currentID?' current':'')} onClick={()=>step.record&&onRecord(step.record)} style={{'--step-color':s.color}}><span className="step-number">{step.done?<Check size={14}/>:index+1}</span><span><b>{step.label}</b><small>{step.note}</small></span>{step.record&&<ChevronRight size={13}/>}</button>})}</div></section>
}
