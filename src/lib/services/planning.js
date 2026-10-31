const {actorLabel,currentUser}=require('../actor.js');
const {randomUUID}=require('node:crypto');const {fail,date,today,integer,calendar,stableHash}=require('../core.js');
const {normalize}=require('../registry.js');const {insertRecord,canonical,filtered}=require('./records.js');const {nextCode}=require('./naming.js');const {MILESTONES,TASK_ACTIONS}=require('../workspace-config.js');
const brief=r=>({id:r.id,resource:r.resource,external_id:r.external_id,name:r.name,status:r.status});
async function log(trx,scope,id,action,description){await trx('activity_log').insert({...scope,record_id:id,actor:actorLabel('local-planning'),action,description});}
async function predecessors(db,scope,id){return db('planning_task_dependencies as d').join('records as r','r.id','d.prerequisite_id').where({'d.company_id':scope.company_id,'d.dataset_id':scope.dataset_id,'d.task_id':id}).select('r.id','r.resource','r.external_id','r.name','r.status','r.data');}
async function commandTask(db,scope,id,action,body={}){
 fail(scope.dataset_id==='smarterp-demo','Historical datasets do not support operational planning writes.',403);fail(TASK_ACTIONS.includes(action),'Unsupported planning command.');
 return db.transaction(async trx=>{
  fail(await trx('companies').where({id:scope.company_id}).forUpdate().first(),'Company is not initialized.',409);
  const r=await trx('records').where({...scope,id,resource:'tasks'}).forUpdate().first();fail(r,'Planning task not found in this scope.',404);
  let source_event=id+':'+action;
  if(action==='reschedule_task'){fail(/^[0-9a-f-]{36}$/i.test(body.request_key||''),'A reschedule request key is required.');source_event+=':'+body.request_key;}
  const request_hash=stableHash(canonical(body)),prior=await trx('posting_events').where({...scope,source_event,kind:action}).first();
  if(prior){fail(prior.result.request_hash===request_hash,'This task event already used different inputs.',409);return {...prior.result,replayed:true};}
  const version=Number(r.data.version||0);fail(integer(body.expected_version,'Expected task version')===version,'Task changed in another view. Refresh and review the latest schedule.',409);
  fail(['Draft','InProgress'].includes(r.status),'Completed or cancelled tasks cannot change in this release.',409);
  const eventID=randomUUID();await trx('posting_events').insert({id:eventID,...scope,source_event,kind:action,result:{request_hash}});
  let status=r.status,patch={version:version+1},description='';
  if(['start_task','complete_task'].includes(action)){
   const deps=await predecessors(trx,scope,id);fail(deps.every(d=>d.status==='Done'),'Complete the prerequisite milestone before starting or completing this task.',409);
   if(action==='start_task'){fail(r.status==='Draft','This task is already in progress.',409);status='InProgress';patch.actual_start=today();description='Milestone started. No stock, invoice or cash posting.';}
   else{status='Done';patch.actual_start=r.data.actual_start||today();patch.actual_completed=today();description='Milestone marked complete after prerequisite review. Operational posting remains separate.';}
  }
  if(action==='reschedule_task'){
   const planned_start=date(body.planned_start,'Planned start'),due_date=date(body.due_date,'Due date'),reason=String(body.reason||'').trim();fail(reason&&reason.length<=500,'Provide a reschedule reason of 1–500 characters.');fail(planned_start<=due_date,'Planned start must not follow due date.');fail(planned_start!==r.data.planned_start||due_date!==r.data.due_date,'Schedule dates have not changed.',409);
   const so=await trx('records').where({...scope,resource:'sales',external_id:r.data.source_sales_id}).first();fail(so&&planned_start>=calendar(so.business_date),'Planning cannot begin before the Sales Order.');
   const deps=await predecessors(trx,scope,id);fail(deps.every(d=>planned_start>=d.data.due_date),'Start must be on or after the prerequisite due date.',409);
   const children=await trx('planning_task_dependencies as d').join('records as c','c.id','d.task_id').where({'d.company_id':scope.company_id,'d.dataset_id':scope.dataset_id,'d.prerequisite_id':id}).whereNotIn('c.status',['Cancelled','Deleted','Archived']).select('c.data');
   fail(children.every(c=>due_date<=c.data.planned_start),'New due date overlaps a dependent milestone. Reschedule the dependent task first.',409);
   patch={...patch,planned_start,due_date};description=`Schedule changed ${r.data.planned_start}–${r.data.due_date} to ${planned_start}–${due_date}: ${reason}`;
  }
  if(action==='cancel_task'){
   const children=await trx('planning_task_dependencies as d').join('records as c','c.id','d.task_id').where({'d.company_id':scope.company_id,'d.dataset_id':scope.dataset_id,'d.prerequisite_id':id}).whereNotIn('c.status',['Cancelled','Deleted','Archived']).first();fail(!children,'Cancel dependent milestones first.',409);
   const reason=String(body.reason||'').trim();fail(reason&&reason.length<=500,'Provide a cancellation reason of 1–500 characters.');status='Cancelled';patch.cancel_reason=reason;description='Milestone cancelled: '+reason;
  }
  const data={...r.data,...patch};await trx('records').where({...scope,id}).update({status,business_date:data.due_date,data:JSON.stringify(data)});await log(trx,scope,id,action,description);
  const result={record_id:id,record:{...brief(r),status},request_hash};await trx('posting_events').where({id:eventID}).update({result:JSON.stringify(result)});return result;
 });
}
async function createPlan(db,scope,salesID,body={}){
 fail(scope.dataset_id==='smarterp-demo','T&A plans belong to Operations only.',403);
 const planned_start=date(body.planned_start,'Plan start'),target_date=date(body.target_date,'Target delivery date');fail(planned_start<=target_date,'Plan start must not follow target date.');
 return db.transaction(async trx=>{
  fail(await trx('companies').where({id:scope.company_id}).forUpdate().first(),'Company is not initialized.',409);
  const so=await trx('records').where({...scope,id:salesID,resource:'sales'}).forUpdate().first();fail(so,'Sales Order not found in this scope.',404);
  const lastDeleted=await trx('records').where({...scope,resource:'tasks',status:'Deleted'}).whereRaw("data->>'source_sales_id' = ?",[so.external_id]).orderBy('created_at','desc').orderBy('id').first();
  const source_event=salesID+':create_ta_plan'+(lastDeleted?':after:'+lastDeleted.id:''),request_hash=stableHash({planned_start,target_date}),prior=await trx('posting_events').where({...scope,source_event,kind:'create_ta_plan'}).first();
  if(prior){fail(prior.result.request_hash===request_hash,'This order already has a plan. Reschedule individual tasks instead.',409);return {...prior.result,replayed:true};}
  fail(so.status==='Confirmed','Create a plan for a confirmed, undelivered Sales Order.',409);fail(planned_start>=calendar(so.business_date),'Planning cannot begin before the Sales Order.');
  const sheet=await trx('records').where({...scope,resource:'merchandising',status:'Approved'}).whereRaw("data->>'source_sales_id' = ?",[so.external_id]).first();fail(sheet,'Approve the Merchandising sheet before creating a T&A plan.',409);
  fail(!await trx('records').where({...scope,resource:'tasks'}).whereNotIn('status',['Deleted','Archived']).whereRaw("data->>'source_sales_id' = ?",[so.external_id]).first(),'This order already has milestones. Open or reschedule the existing plan.',409);
  const eventID=randomUUID();await trx('posting_events').insert({id:eventID,...scope,source_event,kind:'create_ta_plan',result:{request_hash}});
  const start=new Date(planned_start+'T00:00:00Z').getTime(),days=Math.round((new Date(target_date+'T00:00:00Z').getTime()-start)/86400000),at=i=>new Date(start+Math.floor(days*i/8)*86400000).toISOString().slice(0,10);
  const records=[];let previous='';
  for(const [index,[milestone,title]]of Object.entries(Object.entries(MILESTONES))){const i=Number(index);const normalized=await normalize(trx,scope,'tasks',[{external_id:await nextCode(trx,scope,'TNA'),source_sales_id:so.external_id,title,milestone,planned_start:at(i),due_date:at(i+1),owner:milestone==='SHIPMENT'?'Merchandising':milestone==='SAMPLE'?'Sampling':milestone.startsWith('FABRIC')?'Purchasing':milestone==='QC'?'Quality':'Production',priority:'Normal',depends_on:previous}]);const task=(await insertRecord(trx,scope,'tasks',normalized)).record;records.push({...brief(task),due_date:task.data.due_date});previous=task.external_id;}
  await log(trx,scope,so.id,'TA_PLAN_CREATED',`Eight Draft milestones created from ${planned_start} to ${target_date}. Dates are planned, not posted operational events.`);
  const result={record_id:so.id,record:brief(so),tasks:records,request_hash};await trx('posting_events').where({id:eventID}).update({result:JSON.stringify(result)});return result;
 });
}
function monthRange(month){fail(/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''),'Choose a month in YYYY-MM format.');fail(Number(month.slice(0,4))>=1900&&Number(month.slice(0,4))<=2200,'Choose a supported calendar year.');const from=date(month+'-01'),d=new Date(from+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return {from,to:d.toISOString().slice(0,10)};}
async function calendarTasks(db,scope,filters={}){
 fail(scope.dataset_id==='smarterp-demo','T&A calendar is available for Operations only.');const month=filters.month||today().slice(0,7),range=monthRange(month),query=filtered(db,scope,'tasks',{search:filters.search,status:filters.status,order:filters.order,...(filters.overdue==='1'?{overdue:'1'}:range)});
 const total=Number((await query.clone().count('* as n').first()).n);fail(total<=500,'More than 500 milestones match this month. Narrow by Sales Order, status or search.',413);
 const rows=await query.select('id','external_id','name','status','resource','data','business_date').orderBy('business_date').orderBy('external_id');
 const data=rows.map(r=>({...brief(r),...Object.fromEntries(['title','milestone','source_sales_id','planned_start','due_date','owner','priority','depends_on','baseline_start','baseline_due_date'].map(k=>[k,r.data[k]])),version:Number(r.data.version||0),overdue:!['Done','Cancelled','Deleted','Archived'].includes(r.status)&&r.data.due_date<today()}));
 return {month,...range,today:today(),data,total,summary:{open:data.filter(r=>!['Done','Cancelled','Deleted','Archived'].includes(r.status)).length,overdue:data.filter(r=>r.overdue).length,done:data.filter(r=>r.status==='Done').length},note:'Planned dates and manual milestone progress only. Completion does not post production, QC, delivery, invoice or cash.'};
}
async function detailPlanning(db,scope,r){
 if(r.resource==='tasks'){const dependencies=await predecessors(db,scope,r.id),children=await db('planning_task_dependencies as d').join('records as c','c.id','d.task_id').where({'d.company_id':scope.company_id,'d.dataset_id':scope.dataset_id,'d.prerequisite_id':r.id}).select('c.id','c.resource','c.external_id','c.name','c.status');return {dependencies:dependencies.map(brief),dependents:children,version:Number(r.data.version||0),overdue:!['Done','Cancelled','Deleted','Archived'].includes(r.status)&&r.data.due_date<today()};}
 const q=db('records').where({...scope,resource:'tasks'}).whereNotIn('status',['Deleted','Archived']).whereRaw("data->>'source_sales_id' = ?",[r.external_id]),counts=await q.clone().select('status').count('* as n').groupBy('status');
 return {total:counts.reduce((n,c)=>n+Number(c.n),0),done:counts.filter(c=>c.status==='Done').reduce((n,c)=>n+Number(c.n),0),tasks:(await q.orderBy('business_date').limit(100)).map(brief)};
}
module.exports={commandTask,createPlan,calendarTasks,detailPlanning,monthRange};
