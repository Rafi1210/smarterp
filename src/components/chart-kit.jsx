'use client';
import {Tooltip as RechartsTooltip} from 'recharts';
import {amount,currency,dateLabel} from '@/lib/chart-format';
function TooltipBody({active,payload,label,formatter,labelFormatter,unit}){
 if(!active||!payload?.length)return null;
 const title=labelFormatter?labelFormatter(label,payload):dateLabel(label);
 return <div className="erp-chart-tooltip">{title!==''&&title!==undefined&&title!==null&&<strong className="erp-tooltip-title">{title}</strong>}<div>{payload.filter(p=>p.value!==null&&p.value!==undefined).map((entry,index)=>{
  let name=entry.name||entry.dataKey,value;
  if(formatter){const result=formatter(entry.value,name,entry,index,payload);if(Array.isArray(result)){[value,name]=result;}else value=result;}
  if(value===undefined)value=unit==='money'||/BDT|amount|value|cash|outstanding/i.test(String(name))?currency(entry.value):/%|share/i.test(String(name))?amount(entry.value)+'%':amount(entry.value);
  return <div className="erp-tooltip-row" key={String(entry.dataKey||name)+index}><i style={{background:entry.color||entry.fill||'#8caee0'}}/><span>{name}</span><b>{value}</b></div>;
 })}</div></div>;
}
export function ReportTooltip({unit='number',...props}){
 const base={cursor:{fill:'#eef3fa',fillOpacity:.65,stroke:'#a4b8d4',strokeDasharray:'3 4'},isAnimationActive:false,wrapperStyle:{zIndex:5,outline:'none'}};
 return <RechartsTooltip {...base} {...props} content={props.content||<TooltipBody unit={unit} {...props}/>}/>;
}
export function ChartUnitNote(){return <span className="chart-unit-note">BDT = Bangladeshi taka · k = thousand · L = lakh · cr = crore</span>;}
