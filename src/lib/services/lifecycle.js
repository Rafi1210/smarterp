const {randomUUID} = require('node:crypto');
const {fail,stableHash,today} = require('../core.js');
const {actorLabel,currentUser} = require('../actor.js');
const {assertRead,assertCreate,readAllowed} = require('../resource-access.js');
const {lifecycleActions} = require('../lifecycle-config.js');
const CLOSED = ['Deleted','Cancelled','Archived','Reversed','Paid','Delivered','Historical'];
const LEDGERS = ['movements','cashbook','journals','payslips'];
async function dependencies(db,scope,record,action) {
  // Archive may retain completed history; deletion/cancellation must also
  // protect completed operational dependents, which cannot be undone here.
  const masters=['customers','suppliers','items','employees','bom'];
  const closed=action==='archive'||(!action&&masters.includes(record.resource))?CLOSED:['Deleted','Cancelled','Archived'];
  const rows = await db('record_links as l').join('records as d','d.id','l.from_id')
    .where({'l.company_id':scope.company_id,'l.dataset_id':scope.dataset_id,'l.to_id':record.id,'d.company_id':scope.company_id,'d.dataset_id':scope.dataset_id})
    .whereNotIn('d.status',closed).whereNotIn('d.resource',LEDGERS).select('d.id','d.resource','d.external_id','d.name','d.status',db.raw("d.data->>'kind' as kind")).orderBy('d.created_at').limit(26);
  const pending = await db('approval_requests').where({...scope,document_id:record.id,status:'Pending'}).select('id','external_id').first();
  return {records:rows.slice(0,25),more:rows.length>25,pending};
}
async function describe(db,scope,record) {
  if (scope.dataset_id !== 'smarterp-demo') return null;
  const actions = lifecycleActions(record,currentUser()?.role);
  if (!actions.length) return {actions:[],note:record.resource==='workorders'?'Use Cancel Work Order before material issue. It releases reserved material and preserves the order history.':['Deleted','Archived','Reversed'].includes(record.status)?'This record is retained for its audit history.':'Posted documents are retained. Customer receipts and supplier/salary payments support a separate reversal voucher; stock and invoice reversals are outside this update.'};
  const linked = await dependencies(db,scope,record);
  return {actions,dependencies:linked.records.filter(r=>readAllowed(r.resource,r.kind)),blocked_documents:linked.records.length,more:linked.more,pending_review:linked.pending||null,note:'Delete removes an unused Draft from active lists and retains a tombstone and history. Archive preserves references and prevents new use.'};
}
async function command(db,scope,resource,id,body={}) {
  fail(scope.dataset_id === 'smarterp-demo','Historical namespaces are read-only.',403);
  fail(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(id||'')),'A valid record ID is required.');
  fail(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(String(body.request_key||'')),'A request key is required.');
  const reason = String(body.reason||'').trim();fail(reason.length>=6 && reason.length<=500,'Give a reason using 6–500 characters.');
  if (body.action === 'reverse_payment') {fail(resource==='payments','Only payment records support this reversal action.');return require('./finance.js').reversePayment(db,scope,id,{...body,reason});}
  return db.transaction(async trx => {
    const company = await trx('companies').where({id:scope.company_id}).forUpdate().first();fail(company,'Company is not initialized.',409);
    const record = await trx('records').where({...scope,id,resource}).forUpdate().first();fail(record,'Record not found in this scope.',404);
    assertRead(resource,record.data.kind);assertCreate(resource,record.data.kind);
    const source_event='lifecycle:'+body.request_key, request_hash=stableHash({id,resource,action:body.action,reason});
    const prior = await trx('posting_events').where({...scope,source_event,kind:'LIFECYCLE'}).first();
    if (prior) { fail(prior.result.request_hash===request_hash,'Request key already used for different inputs.',409);return {...prior.result,replayed:true}; }
    fail(lifecycleActions(record,currentUser()?.role).some(a=>a.action===body.action),'This action is unavailable in the current state.',409);
    const linked = await dependencies(trx,scope,record,body.action);
    fail(!linked.pending,'Cancel or return the pending approval request first.',409);
    if (body.action !== 'restore') fail(!linked.records.length,'Linked documents protect this record. Review their statuses before removing the source.',409,{code:'LINKED_DOCUMENTS',records:linked.records.filter(r=>readAllowed(r.resource,r.kind)),more:linked.more});
    if (record.resource === 'items' && body.action === 'archive') {
      const balances = await trx('inventory_balances').where({...scope,item_id:id});
      fail(balances.every(b=>BigInt(b.physical)===0n&&BigInt(b.held)===0n&&BigInt(b.reserved||0)===0n),'An item with physical, reserved or QC-held stock cannot be archived.',409);
    }
    let status;
    if (body.action === 'restore') {
      status = record.data.lifecycle?.previous_status || (record.resource==='bom'?'Draft':'Active');
      if (record.resource==='bom' && status==='Approved') fail(!await trx('records').where({...scope,resource:'bom',status:'Approved'}).whereNot('id',id).whereRaw("data->>'finished_item_id' = ?",[record.data.finished_item_id]).first(),'Another BOM is already approved for this item.',409);
      const refs = await trx('record_links as l').join('records as r','r.id','l.to_id').where({'l.company_id':scope.company_id,'l.dataset_id':scope.dataset_id,'l.from_id':id}).whereIn('r.status',['Deleted','Archived','Cancelled','Reversed']).first();
      fail(!refs,'A source/master record is inactive. Restore an archived/deleted source or use a new active source.',409);
      if(record.resource==='workorders')fail(!await trx('records').where({...scope,resource:'workorders'}).whereNot('id',id).whereNotIn('status',['Deleted','Archived','Cancelled']).whereRaw("data->>'source_sales_id' = ?",[record.data.source_sales_id]).first(),'A replacement Work Order already exists for this Sales Order.',409);
      if(record.resource==='tasks')fail(!await trx('records').where({...scope,resource:'tasks'}).whereNot('id',id).whereNotIn('status',['Deleted','Cancelled']).whereRaw("data->>'source_sales_id' = ? AND data->>'milestone' = ?",[record.data.source_sales_id,record.data.milestone]).first(),'A replacement milestone of this type already exists. Continue the replacement plan.',409);
    } else status = {delete_draft:'Deleted',archive:'Archived',cancel_document:'Cancelled'}[body.action];
    // Real postings are never removed through this route, even if a record was
    // externally given an incorrect Draft state.
    if (body.action==='delete_draft'||body.action==='cancel_document') {
      const stock=await trx('stock_movements').where({...scope,source_id:id}).first(),cash=await trx('cash_entries').where({...scope,payment_id:id}).first(),reserved=await trx('inventory_reservations').where({...scope,workorder_id:id,status:'Active'}).first();
      fail(!stock&&!cash&&!reserved,'This document has postings or a reservation. Use its domain cancellation or payment reversal.',409);
      fail(!await trx('obligations').where({...scope,document_id:id}).first(),'A posted obligation cannot be deleted or cancelled.',409);
    }
    const eventID=randomUUID(),result={record_id:id,status,request_hash};
    await trx('posting_events').insert({id:eventID,...scope,source_event,kind:'LIFECYCLE',result:JSON.stringify(result)});
    const lifecycle={previous_status:body.action==='restore'?status:record.status,action:body.action,reason,date:today(),actor:actorLabel()};
    await trx('records').where({...scope,id}).update({status,data:JSON.stringify({...record.data,lifecycle})});
    await trx('activity_log').insert({...scope,record_id:id,actor:actorLabel(),action:body.action.toUpperCase(),description:reason+' Original document, number, links and prior activity are retained.'});
    return result;
  });
}
module.exports={command,describe,dependencies};
