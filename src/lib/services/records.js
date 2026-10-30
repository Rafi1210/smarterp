const {actorLabel}=require('../actor.js');const {assertRead,assertCreate,restrictRecords,readAllowed}=require('../resource-access.js');
const { randomUUID } = require('node:crypto');
const { fail, stableHash, integer, date, today } = require('../core.js');
const { getResource, normalize } = require('../registry.js');
function hashInput(values,lines,refs){return {...values,lines,refs:refs.map(r=>({...r})).sort((a,b)=>a.id.localeCompare(b.id))};}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
function recordHash(values,lines,refs){return stableHash(canonical(hashInput(values,lines,refs)));}
function matchesHash(hash,values,lines,refs){return hash===recordHash(values,lines,refs)||hash===stableHash(hashInput(values,lines,refs));} // Legacy foundation seeds remain replayable.

async function insertRecord(trx, scope, resource, normalized, actor = actorLabel()) {
  const { lines = [], refs = [], warnings, ...values } = normalized;
  const content_hash = recordHash(values,lines,refs);
  const id = randomUUID();
  const inserted = await trx('records').insert({ id, ...scope, resource, ...values, content_hash }).onConflict(['company_id','dataset_id','resource','external_id']).ignore().returning('*');
  if (!inserted.length) {
    const existing = await trx('records').where({ ...scope, resource, external_id: values.external_id }).first();
    fail(matchesHash(existing.content_hash,values,lines,refs), `External ID '${values.external_id}' already exists with different content. Create-only import never overwrites saved records.`,409);
    return { record: existing, skipped: true };
  }
  for (const line of lines) await trx('document_lines').insert({ id: randomUUID(), ...scope, document_id: id, ...line });
  for (const linked of new Map(refs.map(x => [`${x.id}:${x.relation}`,x])).values()) await trx('record_links').insert({ ...scope, from_id: id, to_id: linked.id, relation: linked.relation });
  if(resource==='tasks'){const prerequisite=refs.find(r=>r.relation==='tasks');if(prerequisite)await trx('planning_task_dependencies').insert({...scope,task_id:id,prerequisite_id:prerequisite.id});}
  await trx('activity_log').insert({ ...scope, record_id: id, actor, action: 'CREATED', description: ['movements','cashbook','journals','payslips'].includes(resource) ? 'Immutable record created from an explicit posting action.' : `${values.status} ${resource} record created. No stock or financial posting.` });
  return { record: inserted[0], skipped: false };
}
function filtered(db, scope, resource, filters = {}) {
  getResource(resource,scope.dataset_id);
  let q = restrictRecords(db('records').where({ ...scope, resource }),resource);
  if (filters.search) {
    fail(String(filters.search).length <= 120,'Search is too long.');
    const pattern = `%${String(filters.search).replace(/[\\%_]/g, c => `\\${c}`)}%`;
    q = q.where(w => w.whereILike('name',pattern).orWhereILike('external_id',pattern));
  }
  if(filters.group){fail(String(filters.group).length<=200,'Chart group is too long.');let expr='status';if(['customers','suppliers'].includes(resource))expr="COALESCE(NULLIF(data->>'country',''),'Unspecified')";else if(resource==='employees')expr="COALESCE(NULLIF(data->>'department',''),'Unspecified')";else if(resource==='items')expr="COALESCE(data->>'uom','source unit')";else if(['invoices','movements','journals'].includes(resource))expr="data->>'kind'";if(resource==='payslips')expr="data->>'period'";q=q.whereRaw(`${expr} = ?`,[String(filters.group)]);}
  if(filters.overdue){fail(resource==='tasks'&&filters.overdue==='1','Overdue filtering is for planning tasks.');q=q.whereNotIn('status',['Done','Cancelled']).where('business_date','<',today());}
  if(filters.order){fail(resource==='tasks'&&String(filters.order).length<=80,'Order filtering is available for planning tasks only.');q=q.whereRaw("data->>'source_sales_id' = ?",[String(filters.order)]);}
  if(filters.kind) { fail(['SALES','PURCHASE'].includes(filters.kind),'Unknown invoice kind.'); q=q.whereRaw("data->>'kind' = ?",[filters.kind]); }
  if (filters.status && filters.status !== 'all') q = q.where('status',String(filters.status));
  if (filters.from) q = q.where('business_date','>=',date(filters.from));
  if (filters.to) q = q.where('business_date','<=',date(filters.to));
  if (filters.from && filters.to) fail(filters.from <= filters.to,'Date range is reversed.');
  return q;
}
async function listRecords(db,scope,resource,filters) {
  const page = integer(filters.page || '1','Page',{min:1,max:100000});
  const size = integer(filters.size || '25','Page size',{min:1,max:100}); fail([25,50,100].includes(size),'Page size must be 25, 50 or 100.');
  const sort = filters.sort || 'created_at'; fail(['created_at','external_id','name','business_date','status'].includes(sort),'Unsupported sort column.');
  const direction = filters.direction === 'asc' ? 'asc' : 'desc';
  const q = filtered(db,scope,resource,filters);
  const count = await q.clone().count('* as n').first();
  const data = await q.clone().select('id','external_id','name','status','business_date','data','created_at').orderBy(sort,direction).orderBy('id','asc').limit(size).offset((page-1)*size);
  if (resource === 'items' && scope.dataset_id === 'smarterp-demo') {
    const ids = data.map(r=>r.id); const balances = ids.length ? await db('inventory_balances').where(scope).whereIn('item_id',ids) : [];
    for (const row of data) row.balance = balances.find(b=>b.item_id===row.id) || { physical:'0',held:'0',reserved:'0' };
  }
  if(['invoices','payroll'].includes(resource)&&scope.dataset_id==='smarterp-demo'){
    const ids=data.map(r=>r.id);const balances=ids.length?await db('obligations').where(scope).whereIn('document_id',ids):[];
    for(const row of data){const b=balances.find(b=>b.document_id===row.id);if(b)row.finance_balance={principal_minor:b.principal_minor,paid_minor:b.allocated_minor,outstanding_minor:String(BigInt(b.principal_minor)-BigInt(b.allocated_minor))};}
  }
  return { data, meta: { total:Number(count.n), page, size, pages:Math.max(1,Math.ceil(Number(count.n)/size)) } };
}
async function detail(db,scope,resource,id) {
  getResource(resource,scope.dataset_id);
  const record = await db('records').where({...scope,resource,id}).first(); fail(record,'Record not found in this scope.',404); assertRead(resource,record.data.kind);
  const lines = await db('document_lines as l').join('records as i','i.id','l.item_id').where({'l.company_id':scope.company_id,'l.dataset_id':scope.dataset_id,'l.document_id':id}).select('l.*','i.name as item_name','i.external_id as item_external_id').orderBy('external_line_id');
  const edges = await db('record_links').where(scope).where(w=>w.where('from_id',id).orWhere('to_id',id));
  const relatedIds = [...new Set(edges.map(e=>e.from_id===id?e.to_id:e.from_id))];
  let related = relatedIds.length ? await db('records').where(scope).whereIn('id',relatedIds).select('id','resource','external_id','name','status',db.raw("data->>'kind' as kind")) : [];
  related=related.filter(r=>readAllowed(r.resource,r.kind));
  const activity = await db('activity_log').where({...scope,record_id:id}).orderBy('created_at','desc').limit(100);
  const balance = resource === 'items' ? await db('inventory_balances').where({...scope,item_id:id}).first() : null;
  let movements=[]; if(resource==='items')movements=await db('stock_movements').where({...scope,item_id:id}).orderBy('created_at','desc').limit(100);
  const finance_balance=scope.dataset_id==='smarterp-demo'?await db('obligations').where({...scope,document_id:id}).first():null;
  if(finance_balance)finance_balance.outstanding_minor=String(BigInt(finance_balance.principal_minor)-BigInt(finance_balance.allocated_minor));
  const finance_lines=resource==='journals'?await db('finance_journal_lines').where({...scope,journal_id:id}).orderBy('line_no'):[];
  const reservation=resource==='workorders'?await db('inventory_reservations').where({...scope,workorder_id:id}).first():null;
  const journey=scope.dataset_id==='smarterp-demo'?await require('./journey.js').orderJourney(db,scope,record):null;
  let material=null,material_error=null;
  if(resource==='sales'&&record.status==='Confirmed')try{const p=await require('./workflow.js').materialPlan(db,scope,record);material={required:p.required,remaining_required:p.remaining_required,consumed:p.consumed,free:p.free,own_reserved:p.own_reserved,available:p.available,reserved:p.reserved,held:p.held,incoming:p.incoming,shortage:p.shortage,to_purchase:p.to_purchase,unit:'g'};}catch(e){if(e.status)material_error=e.message;else throw e;}
  const reviews=scope.dataset_id==='smarterp-demo'?await db('approval_requests as a').leftJoin('approval_decisions as d','d.request_id','a.id').where({'a.company_id':scope.company_id,'a.dataset_id':scope.dataset_id,'a.document_id':id}).select('a.id','a.external_id','a.status','a.submit_note','a.created_at','a.decided_at','a.submitted_by','d.reason').orderBy('a.created_at','desc').limit(25):[];
  const planning=scope.dataset_id==='smarterp-demo'&&['tasks','sales'].includes(resource)?await require('./planning.js').detailPlanning(db,scope,record):null;
  const result={ ...record, reviews, planning, lines, related, activity, balance, movements,finance_balance,finance_lines,reservation,journey,material,material_error };
  result.presentation=scope.dataset_id==='smarterp-demo'?await require('./documents.js').presentDocument(db,scope,result):null;
  return result;
}
async function createDraft(db,scope,resource,rows,requestKey) {
  assertCreate(resource,rows?.[0]?.kind);
  fail(scope.dataset_id === 'smarterp-demo','Historical records are added through source-specific imports, not operational forms.');
  return db.transaction(async trx=>{
    await trx('companies').where({id:scope.company_id}).forUpdate().first();
    fail(Array.isArray(rows)&&rows.length>0&&rows.length<=100,'Provide 1–100 rows.');
    const automatic=rows.every(r=>!String(r.external_id||'').trim());
    let event=null;
    if(automatic){
      fail(/^[0-9a-f-]{36}$/i.test(requestKey||''),'A request key is required for automatic numbering.');
      const source_event='create:'+requestKey,request_hash=stableHash(canonical({resource,rows}));
      const prior=await trx('posting_events').where({...scope,kind:'CREATE_DRAFT',source_event}).first();
      if(prior){fail(prior.result.request_hash===request_hash,'Request key already used for different inputs.',409);return {record:await trx('records').where({...scope,id:prior.result.record_id}).first(),skipped:true};}
      event={id:randomUUID(),...scope,kind:'CREATE_DRAFT',source_event,result:{request_hash}};
      await trx('posting_events').insert(event);
      const {nextCode,prefixFor}=require('./naming.js');
      const external_id=await nextCode(trx,scope,prefixFor(resource,rows[0]),rows[0].date||undefined);rows=rows.map(r=>({...r,external_id}));
    }
    const normalized=await normalize(trx,scope,resource,rows);assertCreate(resource,normalized.data?.kind);
    const result=await insertRecord(trx,scope,resource,normalized);
    if(event)await trx('posting_events').where({id:event.id}).update({result:JSON.stringify({...event.result,record_id:result.record.id})});
    return result;
  });
}
async function chart(db,scope,resource,filters) {
  const cfg = getResource(resource,scope.dataset_id);
  const q = filtered(db,scope,resource,filters);
  const total = await q.clone().count('* as n').first();
  if(resource==='cashbook'){
    const rows=await q.clone().select('business_date as label').select(db.raw("SUM(CASE WHEN data->>'direction'='IN' THEN (data->>'amount_minor')::numeric ELSE 0 END)::text AS inflow"),db.raw("SUM(CASE WHEN data->>'direction'='OUT' THEN (data->>'amount_minor')::numeric ELSE 0 END)::text AS outflow")).groupBy('business_date').orderBy('business_date');
    return {title:cfg.chart,unit:'BDT',total:Number(total.n),data:rows.map(r=>({label:typeof r.label==='string'?r.label:new Date(r.label).toISOString().slice(0,10),inflow:Number(r.inflow)/100,outflow:Number(r.outflow)/100}))};
  }
  if (resource === 'productivity') {
    const data = await q.clone().select('business_date as label').avg({actual:db.raw("(data->>'actual_productivity')::numeric"),target:db.raw("(data->>'targeted_productivity')::numeric")}).count('* as count').groupBy('business_date').orderBy('business_date');
    return { title:cfg.chart, unit:'ratio · unweighted mean',total:Number(total.n),data:data.map(r=>({...r,label:new Date(r.label).toISOString().slice(0,10),actual:Number(r.actual),target:Number(r.target),count:Number(r.count)})) };
  }
  let expr = 'status';
  if (['customers','suppliers'].includes(resource)) expr = "COALESCE(NULLIF(data->>'country',''),'Unspecified')";
  else if (resource === 'employees') expr = "COALESCE(NULLIF(data->>'department',''),'Unspecified')";
  else if (resource === 'items') expr = "COALESCE(data->>'uom','source unit')";
  else if (resource === 'journals') expr = "data->>'kind'";
  else if (resource === 'payslips') expr = "data->>'period'";
  else if (resource === 'movements') expr = "data->>'kind'";
  else if (resource === 'invoices') expr = "data->>'kind'";
  const rows = await q.clone().select(db.raw(`${expr} AS label`)).count('* as value').groupByRaw(expr).orderBy('value','desc').limit(50);
  return { title:cfg.chart, unit:'records',total:Number(total.n), data:rows.map(r=>({...r,value:Number(r.value)})) };
}
module.exports = { canonical, recordHash, matchesHash, insertRecord, filtered, listRecords, detail, createDraft, chart };
