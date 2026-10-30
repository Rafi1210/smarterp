const {restrictRecords,restrictBatches,readAllowed}=require('../resource-access.js');
const {fail,integer,today}=require('../core.js');const {registry,getResource}=require('../registry.js');const {REVIEWS}=require('../workspace-config.js');
const pattern=value=>'%'+String(value).replace(/[\\%_]/g,c=>'\\'+c)+'%';
async function globalSearch(db,scope,filters={}){
 const allowed=Object.keys(registry).filter(resource=>{try{getResource(resource,scope.dataset_id);return readAllowed(resource)}catch{return false}});
 fail(allowed.length,'Unknown dataset namespace.');const search=String(filters.search||'').trim();fail(search.length<=100,'Search is limited to 100 characters.');
 const page=integer(filters.page||'1','Page',{min:1,max:100000});if(search.length<2)return {data:[],meta:{total:0,page:1,pages:1},hint:'Enter at least two characters. Search stays inside the selected dataset.'};
 let resources=allowed.filter(r=>!['movements','journals','cashbook'].includes(r));if(filters.resource){fail(allowed.includes(filters.resource),'Resource is unavailable in this namespace.');resources=[filters.resource];}
 let q=restrictRecords(db('records').where(scope).whereIn('resource',resources));const term=pattern(search);
 q=q.where(w=>w.whereILike('external_id',term).orWhereILike('name',term).orWhereRaw("data->>'style_code' ILIKE ? ESCAPE '\\'",[term]).orWhereRaw("data->>'buyer_reference' ILIKE ? ESCAPE '\\'",[term]).orWhereRaw("data->>'source_sales_id' ILIKE ? ESCAPE '\\'",[term]));
 const n=Number((await q.clone().count('* as n').first()).n),data=await q.select('id','resource','dataset_id','external_id','name','status','business_date',db.raw("data->>'kind' as kind")).orderByRaw('CASE WHEN external_id = ? THEN 0 ELSE 1 END',[search]).orderBy('created_at','desc').orderBy('id').limit(25).offset((page-1)*25);
 return {data,meta:{total:n,page,pages:Math.max(1,Math.ceil(n/25))},hint:'Searches codes, names, style/buyer references and linked Sales Order numbers in this dataset. Ledgers are searchable through their type filter.'};
}
async function home(db,scope){
 fail(scope.dataset_id==='smarterp-demo','Apps Home is available in the operational namespace.');
 const rows=await restrictRecords(db('records').where(scope)).select('resource','status').count('* as n').groupBy('resource','status'),byResource={},byStatus={};
 for(const r of rows){byResource[r.resource]=(byResource[r.resource]||0)+Number(r.n);byStatus[r.resource]||={};byStatus[r.resource][r.status]=Number(r.n);}
 const pending=await db('approval_requests').where({...scope,status:'Pending'}).whereIn('resource',Object.keys(REVIEWS).filter(r=>readAllowed(r))).count('* as n').first(),review_candidates=rows.filter(r=>REVIEWS[r.resource]?.state===r.status).reduce((n,r)=>n+Number(r.n),0);
 const overdue=await db('records').where({...scope,resource:'tasks'}).whereNotIn('status',['Done','Cancelled']).whereRaw("data->>'due_date' < ?",[today()]).count('* as n').first();
 const batches=await restrictBatches(db('import_batches').where(scope)).whereIn('status',['PREVIEWED','COMMITTING']).count('* as n').first();
 return {counts:byResource,states:byStatus,pending_reviews:Number(pending.n),review_candidates,overdue_tasks:Number(overdue.n),active_imports:Number(batches.n),today:today(),note:'Counts come from saved records in Operations. Role permissions are checked on the server.'};
}
async function moduleSummary(db,scope,filters={}){const {filtered}=require('./records.js');const q=filtered(db,scope,filters.resource,{search:filters.search,from:filters.from,to:filters.to,kind:filters.kind});const states=await q.clone().select('status').count('* as count').groupBy('status');return {total:states.reduce((n,r)=>n+Number(r.count),0),states:states.map(r=>({...r,count:Number(r.count)}))};}
module.exports={globalSearch,home,moduleSummary};
