const {reviewPermission,readAllowed}=require('../resource-access.js');
const {actorLabel,currentUser}=require('../actor.js');
const {randomUUID}=require('node:crypto');
const {fail,stableHash,calendar,today,integer,date}=require('../core.js');
const {canonical}=require('./records.js');const {nextCode}=require('./naming.js');const {REVIEWS}=require('../workspace-config.js');
const note=(value,required=false)=>{const s=String(value||'').trim();fail(s.length<=1000&&(!required||s.length>0),'Provide a review note of 1–1,000 characters.');return s;};
const pattern=value=>'%'+String(value).replace(/[\\%_]/g,c=>'\\'+c)+'%';
async function fingerprint(db,scope,r){const lines=await db('document_lines').where({...scope,document_id:r.id}).select('external_line_id','item_id','quantity','unit_price_minor','line_total_minor','uom').orderBy('external_line_id');return stableHash(canonical({external_id:r.external_id,name:r.name,resource:r.resource,status:r.status,business_date:r.business_date?calendar(r.business_date):null,data:r.data,lines}));}
function eligible(r){return REVIEWS[r.resource]?.state===r.status;}
async function submit(db,scope,document_id,body={}){
 fail(scope.dataset_id==='smarterp-demo','Historical documents cannot enter operational approvals.',403);
 fail(/^[0-9a-f-]{36}$/i.test(body.request_key||''),'A valid review request key is required.');
 const submit_note=note(body.note),request_hash=stableHash(canonical({document_id,submit_note}));
 return db.transaction(async trx=>{
  fail(await trx('companies').where({id:scope.company_id}).forUpdate().first(),'Company is not initialized.',409);
  const replay=await trx('approval_requests').where({...scope,client_key:body.request_key}).first();
  if(replay){reviewPermission(replay.resource);fail(replay.request_hash===request_hash,'Review request key already used for different inputs.',409);return {request:replay,replayed:true};}
  const r=await trx('records').where({...scope,id:document_id}).forUpdate().first();fail(r,'Document not found in this scope.',404);fail(eligible(r),'This document is not ready for review. Payroll must first have reviewed components and attendance.',409);
  reviewPermission(r.resource);
  const hash=await fingerprint(trx,scope,r),pending=await trx('approval_requests').where({...scope,document_id,status:'Pending'}).first();
  if(pending){fail(pending.fingerprint===hash&&pending.submit_note===submit_note,'A review request already exists. Open Approval Inbox.',409);return {request:pending,replayed:true};}
  const request={id:randomUUID(),...scope,document_id,external_id:await nextCode(trx,scope,'APR'),resource:r.resource,status:'Pending',fingerprint:hash,client_key:body.request_key,request_hash,submit_note,submitted_by:currentUser()?.id||null};
  const [saved]=await trx('approval_requests').insert(request).returning('*');
  await trx('activity_log').insert({...scope,record_id:r.id,actor:actorLabel('local-review'),action:'REVIEW_REQUESTED',description:`${request.external_id} submitted for review${submit_note?': '+submit_note:'.'}`});
  return {request:saved};
 });
}
async function decide(db,scope,id,body={}){
 fail(scope.dataset_id==='smarterp-demo','Historical documents cannot be approved.',403);
 fail(['Approved','Returned','Cancelled'].includes(body.decision),'Unsupported review decision.');
 const reason=note(body.reason,body.decision!=='Approved'),checks=body.checks||{},request_hash=stableHash(canonical({decision:body.decision,reason,checks}));
 return db.transaction(async trx=>{
  fail(await trx('companies').where({id:scope.company_id}).forUpdate().first(),'Company is not initialized.',409);
  const req=await trx('approval_requests').where({...scope,id}).forUpdate().first();fail(req,'Review request not found in this scope.',404);
  reviewPermission(req.resource,body.decision,req);
  const prior=await trx('approval_decisions').where({...scope,request_id:id}).first();
  if(prior){fail(prior.request_hash===request_hash,'This request already has a different final decision.',409);return {request:req,replayed:true};}
  fail(req.status==='Pending','This request is already closed.',409);
  const record=await trx('records').where({...scope,id:req.document_id}).forUpdate().first();fail(record,'Source document is unavailable.',409);
  let result={record_id:record.id,record:{id:record.id,resource:record.resource,external_id:record.external_id,status:record.status}};
  if(body.decision==='Approved'){
   fail(eligible(record)&&await fingerprint(trx,scope,record)===req.fingerprint,'Source document changed after submission. Return or cancel this request, then submit a fresh review.',409);
   const action=REVIEWS[record.resource].action;
   result=await require('./workflow.js').command(trx,scope,record.id,action,record.resource==='merchandising'?checks:{},{approval_request_id:req.id});
  }
  const [saved]=await trx('approval_requests').where({...scope,id}).update({status:body.decision,decided_at:trx.fn.now()}).returning('*');
  await trx('approval_decisions').insert({id:randomUUID(),...scope,request_id:id,decision:body.decision,reason,request_hash,decided_by:currentUser()?.id||null,actor:actorLabel('local-review')});
  await trx('activity_log').insert({...scope,record_id:record.id,actor:actorLabel('local-review'),action:'REVIEW_'+body.decision.toUpperCase(),description:`${req.external_id}: ${body.decision}${reason?' — '+reason:'.'}`});
  return {...result,request:saved};
 });
}
function requestsQuery(db,scope,filters={},withStatus=true){
 fail(scope.dataset_id==='smarterp-demo','Approval Inbox is available for operational records only.');
 let q=db('approval_requests as a').join('records as r','r.id','a.document_id').leftJoin('approval_decisions as d','d.request_id','a.id').leftJoin('app_users as u','u.id','a.submitted_by').where({'a.company_id':scope.company_id,'a.dataset_id':scope.dataset_id});
 q=q.whereIn('a.resource',Object.keys(REVIEWS).filter(r=>readAllowed(r)));
 if(filters.resource){fail(Object.hasOwn(REVIEWS,filters.resource),'Unsupported approval document type.');q=q.where('a.resource',filters.resource);}
 if(withStatus&&filters.status){fail(['Pending','Approved','Returned','Cancelled'].includes(filters.status),'Unknown request status.');q=q.where('a.status',filters.status);}
 if(filters.search){fail(String(filters.search).length<=100,'Review search is too long.');const term=pattern(filters.search);q=q.where(w=>w.whereILike('a.external_id',term).orWhereILike('r.external_id',term).orWhereILike('r.name',term));}
 if(filters.from)q=q.where('a.created_at','>=',date(filters.from)+'T00:00:00+06:00');
 if(filters.to){const d=new Date(date(filters.to)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);q=q.where('a.created_at','<',d.toISOString().slice(0,10)+'T00:00:00+06:00');}
 if(filters.from&&filters.to)fail(filters.from<=filters.to,'Date range is reversed.');
 return q;
}
async function listRequests(db,scope,filters={}){
 const page=integer(filters.page||'1','Page',{min:1,max:100000}),q=requestsQuery(db,scope,filters),count=await q.clone().count('* as n').first();
 const data=await q.clone().select('a.*','r.external_id as document_no','r.name as document_name','r.status as document_status','d.reason','d.actor','u.email as submitter_email',db.raw("COALESCE(r.data->>'total_minor',r.data->>'net_minor') as amount_minor")).orderBy('a.created_at','desc').orderBy('a.id').limit(25).offset((page-1)*25);
 for(const r of data){const source=await db('records').where({...scope,id:r.document_id}).first();r.stale=r.status==='Pending'&&(!eligible(source)||await fingerprint(db,scope,source)!==r.fingerprint);delete r.client_key;delete r.request_hash;delete r.fingerprint;}
 const groups=await requestsQuery(db,scope,filters,false).select('a.status').count('* as count').groupBy('a.status');
 return {data,meta:{total:Number(count.n),page,pages:Math.max(1,Math.ceil(Number(count.n)/25))},summary:groups.map(g=>({...g,count:Number(g.count)})),mode:'Fixed accounts with role permissions. A different account must approve each submitted request.'};
}
async function candidates(db,scope,filters={}){
 fail(scope.dataset_id==='smarterp-demo','Review candidates belong to Operations only.');
 const resource=filters.resource||'purchases';fail(Object.hasOwn(REVIEWS,resource),'Unsupported review type.');
 reviewPermission(resource);
 let q=db('records as r').where({'r.company_id':scope.company_id,'r.dataset_id':scope.dataset_id,'r.resource':resource,'r.status':REVIEWS[resource].state}).whereNotExists(db('approval_requests as a').select(db.raw('1')).whereRaw('a.document_id=r.id').where('a.status','Pending'));
 if(filters.search){fail(String(filters.search).length<=100,'Search is too long.');const term=pattern(filters.search);q=q.where(w=>w.whereILike('r.name',term).orWhereILike('r.external_id',term));}
 const page=integer(filters.page||'1','Page',{min:1,max:100000}),n=await q.clone().count('* as n').first();
 return {data:await q.select('r.id','r.resource','r.external_id','r.name','r.status').orderBy('r.created_at','desc').orderBy('r.id').limit(25).offset((page-1)*25),meta:{total:Number(n.n),page,pages:Math.max(1,Math.ceil(Number(n.n)/25))}};
}
async function exportRequests(db,scope,filters={}){
 const rows=await requestsQuery(db,scope,filters).select('a.external_id','a.resource','a.status','a.submit_note','a.created_at','a.decided_at','r.external_id as document_no','d.reason').orderBy('a.created_at','desc').limit(10001);fail(rows.length<=10000,'Narrow the approval export to at most 10,000 requests.',413);
 return require('./imports.js').csv(rows.map(r=>({...r,created_at:new Date(r.created_at).toISOString(),decided_at:r.decided_at?new Date(r.decided_at).toISOString():''})),['external_id','document_no','resource','status','submit_note','reason','created_at','decided_at']);
}
module.exports={submit,decide,listRequests,candidates,exportRequests,fingerprint,eligible};
