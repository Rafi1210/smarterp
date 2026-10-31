const {actorLabel,currentUser}=require('../actor.js');
const {randomUUID}=require('node:crypto');
const {fail,today,stableHash}=require('../core.js');
const {DEMO,normalize}=require('../registry.js');
const {insertRecord,canonical}=require('./records.js');
const {nextCode}=require('./naming.js');
const {move,stock,reserve,reservation}=require('./inventory.js');
async function activity(trx,scope,id,action,description){await trx('activity_log').insert({...scope,record_id:id,actor:actorLabel(),action,description});}
async function linked(trx,scope,from,to,relation){await trx('record_links').insert({...scope,from_id:from,to_id:to,relation}).onConflict(['from_id','to_id','relation']).ignore();}
async function change(trx,scope,r,status,patch,action,description){await trx('records').where({...scope,id:r.id}).update({status,data:JSON.stringify({...r.data,...patch})});await activity(trx,scope,r.id,action,description);}
async function find(trx,scope,resource,external_id){const r=await trx('records').where({...scope,resource,external_id}).first();fail(r,`${resource} '${external_id}' is absent from this company and dataset.`,404);fail(!['Deleted','Archived'].includes(r.status),`${resource} '${external_id}' is inactive. Restore the record before using it.`,409);return r;}
async function lines(trx,r){return trx('document_lines').where({company_id:r.company_id,dataset_id:r.dataset_id,document_id:r.id}).orderBy('external_line_id');}
async function oneLine(trx,r){const ls=await lines(trx,r);fail(ls.length===1,'This workflow posts one finished style per document. Multi-line drafts can be stored but cannot be posted.',409);return ls[0];}
async function create(trx,scope,resource,row){return (await insertRecord(trx,scope,resource,await normalize(trx,scope,resource,[row]))).record;}
async function approvedMerch(db,scope,so){
 const sheet=await db('records').where({...scope,resource:'merchandising',status:'Approved'}).whereRaw("data->>'source_sales_id' = ?",[so.external_id]).first();
 fail(sheet,'Approve the Merchandising order sheet before material planning, purchase approval or material reservation.',409);return sheet;
}
async function materialPlan(db,scope,sales,workorderID=null){
 const l=await oneLine(db,sales),item=await db('records').where({...scope,id:l.item_id}).first();
 fail(item?.data.kind==='finished','Sales production requires a finished-goods item.');
 const boms=await db('records').where({...scope,resource:'bom',status:'Approved'}).whereRaw("data->>'finished_item_id' = ?",[item.external_id]);
 fail(boms.length===1,'Approve exactly one BOM for this finished item.',409);
 const bom=boms[0],component=await find(db,scope,'items',bom.data.component_item_id);
 const b=await db('inventory_balances').where({...scope,item_id:component.id,warehouse:'HQ-STORE'}).first();
 let ownQuery=db('inventory_reservations').where({...scope,sales_id:sales.id,item_id:component.id,status:'Active'});if(workorderID)ownQuery=ownQuery.where('workorder_id',workorderID);const own=await ownQuery.sum({quantity:'quantity'}).first();
 const issued=await db('records').where({...scope,resource:'workorders'}).whereRaw("data->>'source_sales_id' = ?",[sales.external_id]).whereIn('status',['MaterialsIssued','Produced','QCHold','QCReleased','Delivered']).first();
 const physical=BigInt(b?.physical||0),held=BigInt(b?.held||0),reserved=BigInt(b?.reserved||0),ownReserved=BigInt(own?.quantity||0);
 const required=BigInt(l.quantity)*BigInt(bom.data.grams_per_piece),consumed=BigInt(issued?.data.consumed_grams||0),remaining=required>consumed?required-consumed:0n,free=physical-held-reserved,available=free+ownReserved;
 fail(required<=9000000000000n,'Material requirement exceeds the supported document quantity range.',409);
 const incomingRows=await db('document_lines as l').join('records as p','p.id','l.document_id').where({'p.company_id':scope.company_id,'p.dataset_id':scope.dataset_id,'p.resource':'purchases','p.status':'Approved','l.item_id':component.id}).sum({qty:'l.quantity'}).first();
 const incoming=BigInt(incomingRows.qty||0),shortage=remaining>available?remaining-available:0n;
 return {bom,component,item,quantity:l.quantity,required:String(required),remaining_required:String(remaining),consumed:String(consumed),free:String(free),physical:String(physical),held:String(held),reserved:String(reserved),own_reserved:String(ownReserved),available:String(available),incoming:String(incoming),shortage:String(shortage),to_purchase:String(shortage>incoming?shortage-incoming:0n),unit:'g'};
}
const planSummary=p=>({bom:p.bom.external_id,component:p.component.external_id,quantity:p.quantity,required:p.required,remaining_required:p.remaining_required,consumed:p.consumed,free:p.free,own_reserved:p.own_reserved,available:p.available,reserved:p.reserved,held:p.held,incoming:p.incoming,shortage:p.shortage,to_purchase:p.to_purchase,unit:'g'});
async function prepareDemo(db,scope){
 fail(scope.dataset_id===DEMO,'Prepare initial records only in the operational namespace.');
 return db.transaction(async trx=>{
  await trx('companies').where({id:scope.company_id}).forUpdate().first();const docs=[];
  for(const [resource,row] of [
   ['bom',{external_id:'BOM-DEMO-001',name:'Cotton T-shirt fabric BOM',finished_item_id:'TSHIRT-001',component_item_id:'FABRIC-001',kg_per_piece:'0.22'}],
   ['openings',{external_id:'OPEN-DEMO-001',item_id:'FABRIC-001',quantity:'1400',date:'2026-10-29'}],
   ['sales',{external_id:'SO-DEMO-001',line_id:'1',date:'2026-10-29',item_id:'TSHIRT-001',quantity:'10000',rate:'450',customer_id:'BUYER-001'}]
  ])docs.push(await create(trx,scope,resource,row));
  return {records:docs,message:'Initial workflow drafts prepared. Existing posted records are preserved.'};
 });
}
const ACTIONS=['post_opening','approve_bom','make_quote','confirm_order','create_merchandising','approve_merchandising','plan_materials','create_purchase','approve_purchase','create_receipt','accept_receipt','create_supplier_bill','match_supplier_bill','create_workorder','reserve_materials','cancel_workorder','issue_materials','produce','qc_hold','qc_release','create_delivery','dispatch'];
async function command(db,scope,id,action,body={},options={}){
 if(action==='create_ta_plan')return require('./planning.js').createPlan(db,scope,id,body);
 if(require('../workspace-config.js').TASK_ACTIONS.includes(action))return require('./planning.js').commandTask(db,scope,id,action,body);
 if(require('./finance.js').ACTIONS.includes(action))return require('./finance.js').commandFinance(db,scope,id,action,body,options);
 fail(scope.dataset_id===DEMO,'Historical datasets are read-only and cannot post operational events.',403);fail(ACTIONS.includes(action),'Unknown business command.');
 return db.transaction(async trx=>{
  // Single-company writes are serialized; stock rows are also locked.
  const company=await trx('companies').where({id:scope.company_id}).forUpdate().first();fail(company,'Company is not initialized.',409);
  const r=await trx('records').where({...scope,id}).forUpdate().first();fail(r,'Document not found in this scope.',404);
  const expect=(resource,status)=>fail(r.resource===resource&&[].concat(status).includes(r.status),`Action '${action}' is unavailable for ${r.resource} in ${r.status}.`,409);
  let source_event=`${id}:${action}`,livePlan=null;
  if(action==='plan_materials'){
   expect('sales','Confirmed');await approvedMerch(trx,scope,r);livePlan=await materialPlan(trx,scope,r);
   // A changed stock snapshot gets its own event. Unchanged rechecks replay.
   source_event+=':'+stableHash(planSummary(livePlan));
  }
  if(action==='create_workorder'){
   const cancelled=await trx('records').where({...scope,resource:'workorders',status:'Cancelled'}).whereRaw("data->>'source_sales_id' = ?",[r.external_id]).orderBy('created_at','desc').orderBy('id').first();
   if(cancelled)source_event+=':after:'+cancelled.id;
  }
  const request_hash=stableHash(canonical(body));
  const existing=await trx('posting_events').where({...scope,source_event,kind:action}).first();
  if(existing){fail(existing.result.request_hash===request_hash,'This source event was already executed with different inputs.',409);if(action==='plan_materials'&&stableHash(r.data.material_plan)!==stableHash(planSummary(livePlan)))await change(trx,scope,r,r.status,{material_plan:planSummary(livePlan)},action,'Material snapshot refreshed to the current stock state.');return {...existing.result,replayed:true};}
  await require('./review-gate.js').reviewGate(trx,scope,r,action,options);
  const eventID=randomUUID();await trx('posting_events').insert({id:eventID,...scope,source_event,kind:action,result:{request_hash}});
  let result={record_id:r.id};
  if(action==='post_opening'){
   expect('openings','Draft');const item=await find(trx,scope,'items',r.data.item_id);
   fail(!await trx('stock_movements').where({...scope,item_id:item.id}).first(),'Opening stock requires an unused item. Adjustments are outside this scope.',409);
   await move(trx,scope,r,item,eventID,'OPENING',BigInt(r.data.quantity_base));await change(trx,scope,r,'Posted',{},action,'Opening quantity posted to the stock ledger.');
  }
  if(action==='approve_bom'){
   expect('bom','Draft');const active=await trx('records').where({...scope,resource:'bom',status:'Approved'}).whereRaw("data->>'finished_item_id' = ?",[r.data.finished_item_id]).first();
   fail(!active,'Another approved BOM already exists for this finished item.',409);await change(trx,scope,r,'Approved',{},action,'One-level fabric BOM approved.');
  }
  if(action==='make_quote'){expect('sales','Draft');await oneLine(trx,r);await change(trx,scope,r,'Quoted',{},action,'Buyer inquiry priced as a quotation. No revenue posted.');}
  if(action==='confirm_order'){expect('sales','Quoted');await change(trx,scope,r,'Confirmed',{},action,'Buyer quotation confirmed as a Sales Order.');}
  if(action==='create_merchandising'){
   expect('sales','Confirmed');const p=await materialPlan(trx,scope,r);
   const sheet=await create(trx,scope,'merchandising',{external_id:await nextCode(trx,scope,'MER'),source_sales_id:r.external_id,bom_id:p.bom.external_id,style_code:String(body.style_code||''),style_name:String(body.style_name||''),fabric_spec:String(body.fabric_spec||''),delivery_date:String(body.delivery_date||''),buyer_reference:String(body.buyer_reference||''),notes:String(body.notes||'')});
   await change(trx,scope,r,r.status,{merchandising_id:sheet.id},action,'Merchandising order sheet created for explicit style, BOM and delivery review.');result.record_id=sheet.id;
  }
  if(action==='approve_merchandising'){
   expect('merchandising','Draft');fail(body.specs_confirmed===true&&body.bom_confirmed===true&&body.date_confirmed===true,'Confirm style/specification, BOM requirement and target delivery date before approving.',409);
   const so=await find(trx,scope,'sales',r.data.source_sales_id);fail(so.status==='Confirmed','Review requires a confirmed, undelivered Sales Order.',409);
   const p=await materialPlan(trx,scope,so);fail(p.bom.external_id===r.data.bom_id,'Order sheet must use the active approved BOM.',409);
   const prior=await trx('records').where({...scope,resource:'merchandising',status:'Approved'}).whereRaw("data->>'source_sales_id' = ?",[so.external_id]).first();fail(!prior,'An approved Merchandising sheet already exists for this order.',409);
   await change(trx,scope,r,'Approved',{bom_snapshot:{bom:p.bom.external_id,component:p.component.external_id,grams_per_piece:p.bom.data.grams_per_piece,quantity:p.quantity,required:p.required},reviewed_at:new Date().toISOString()},action,'Style/specification, one-level fabric BOM and delivery date reviewed for production handover.');
   await change(trx,scope,so,so.status,{merchandising_id:r.id},action,'Approved Merchandising order sheet linked. Material planning is now available.');result.record_id=so.id;
  }
  if(action==='plan_materials'){
   const summary=planSummary(livePlan);await change(trx,scope,r,'Confirmed',{material_plan:summary},action,`Current stock check: ${summary.required} g required; ${summary.shortage} g physical shortage; ${summary.to_purchase} g to purchase.`);result.plan=summary;
  }
  if(action==='create_purchase'){
   expect('sales','Confirmed');await approvedMerch(trx,scope,r);fail(r.data.material_plan,'Run the BOM/material check first.',409);fail(!await trx('records').where({...scope,resource:'workorders'}).whereRaw("data->>'source_sales_id' = ?",[r.external_id]).whereNotIn('status',['Draft','Cancelled','Deleted','Archived']).first(),'Material is already committed to a Work Order. Continue or cancel the unissued Work Order before purchasing.',409);const p=await materialPlan(trx,scope,r);
   fail(BigInt(p.to_purchase)>0n,'No uncovered shortage remains. Receive approved inbound stock or refresh the material check.',409);
   const supplier=await find(trx,scope,'suppliers',String(body.supplier_id||'')),qty=BigInt(p.to_purchase);
   const po=await create(trx,scope,'purchases',{external_id:await nextCode(trx,scope,'PO'),line_id:'1',date:today(),item_id:p.component.external_id,quantity:`${qty/1000n}.${String(qty%1000n).padStart(3,'0')}`,rate:String(body.rate||''),supplier_id:supplier.external_id,source_sales_id:r.external_id});
   await change(trx,scope,r,r.status,{purchase_id:po.id},action,'Uncovered fabric shortage converted to a linked purchase Draft.');result.record_id=po.id;
  }
  if(action==='approve_purchase'){
   expect('purchases','Draft');const so=await find(trx,scope,'sales',r.data.source_sales_id);fail(so.status==='Confirmed','Purchase approval requires a confirmed Sales Order.',409);await approvedMerch(trx,scope,so);fail(!await trx('records').where({...scope,resource:'workorders'}).whereRaw("data->>'source_sales_id' = ?",[so.external_id]).whereNotIn('status',['Draft','Cancelled','Deleted','Archived']).first(),'Material is already committed to a Work Order; additional purchase approval is blocked.',409);
   const p=await materialPlan(trx,scope,so),l=await oneLine(trx,r);fail(l.item_id===p.component.id&&BigInt(l.quantity)<=BigInt(p.to_purchase),'PO material/quantity exceeds the uncovered BOM shortage after approved inbound stock.',409);
   await change(trx,scope,r,'Approved',{},action,'Purchase approved. Inbound quantity is visible; physical stock is unchanged.');
  }
  if(action==='create_receipt'){
   expect('purchases','Approved');const receipt=await create(trx,scope,'receipts',{external_id:await nextCode(trx,scope,'GRN'),purchase_id:r.external_id,date:today()});result.record_id=receipt.id;await activity(trx,scope,r.id,action,'Full goods receipt Draft created; acceptance posts stock.');
  }
  if(action==='accept_receipt'){
   expect('receipts','Draft');const po=await find(trx,scope,'purchases',r.data.purchase_id);fail(po.status==='Approved','Receipt requires an approved, unreceived purchase order.',409);
   const l=await oneLine(trx,po),item=await trx('records').where({...scope,id:l.item_id}).first();await move(trx,scope,r,item,eventID,'GOODS_RECEIPT',BigInt(l.quantity));
   await change(trx,scope,r,'Accepted',{quantity_base:l.quantity,item_id:item.external_id,purchase_total_minor:po.data.total_minor},action,'Full accepted receipt posted once. Partial/rejected receipt quantities are outside this scope.');await change(trx,scope,po,'Received',{receipt_id:r.id},action,'Accepted goods receipt increased physical stock.');
  }
  if(action==='create_supplier_bill'){
   expect('purchases','Received');const amount=BigInt(r.data.total_minor);
   const bill=await create(trx,scope,'invoices',{external_id:await nextCode(trx,scope,'BILL'),kind:'PURCHASE',source_id:r.external_id,date:today(),due_date:today(),amount:`${amount/100n}.${String(amount%100n).padStart(2,'0')}`});result.record_id=bill.id;await activity(trx,scope,r.id,action,'Supplier bill Draft created for PO/GRN matching.');
  }
  if(action==='match_supplier_bill'){
   expect('invoices','Draft');fail(r.data.kind==='PURCHASE','This command matches supplier bills only.');const po=await find(trx,scope,'purchases',r.data.source_id);
   const receipt=po.data.receipt_id?await trx('records').where({...scope,id:po.data.receipt_id,resource:'receipts',status:'Accepted'}).first():null;
   fail(po.status==='Received'&&receipt,'Bill match requires an accepted goods receipt.',409);
   fail(r.data.declared_amount_minor&&BigInt(r.data.declared_amount_minor)===BigInt(po.data.total_minor),'Declare a supplier bill total equal to the fully received PO amount before matching.',409);
   fail(!await trx('records').where({...scope,resource:'invoices'}).whereIn('status',['Matched','Posted','PartPaid','Paid']).whereRaw("data->>'source_id' = ? AND data->>'kind' = 'PURCHASE'",[po.external_id]).first(),'A matched bill already exists for this PO.',409);
   await linked(trx,scope,r.id,receipt.id,'receipt');await change(trx,scope,r,'Matched',{amount_minor:po.data.total_minor,receipt_id:receipt.id},action,'Full-PO bill matched to received quantity, rate and accepted GRN. Matching does not change stock.');
  }
  if(action==='create_workorder'){
   expect('sales','Confirmed');const merch=await approvedMerch(trx,scope,r);fail(r.data.material_plan,'Run material planning first.',409);const p=await materialPlan(trx,scope,r);
   const previous=await trx('records').where({...scope,resource:'workorders'}).whereRaw("data->>'source_sales_id' = ?",[r.external_id]).whereNotIn('status',['Cancelled','Deleted','Archived']).first();fail(!previous,'A Work Order already exists. Open it from the order journey.',409);
   const wo=await create(trx,scope,'workorders',{external_id:await nextCode(trx,scope,'WO'),source_sales_id:r.external_id,bom_id:p.bom.external_id,quantity:p.quantity,date:today()});
   await reserve(trx,scope,wo,r,p,eventID);await linked(trx,scope,wo.id,merch.id,'merchandising');await change(trx,scope,wo,'Reserved',{reserved_grams:p.required},action,'Fabric reserved for this Work Order. Physical stock is unchanged.');
   await change(trx,scope,r,r.status,{work_order_id:wo.id},action,'Linked Work Order created and material reserved atomically.');result.record_id=wo.id;
  }
  if(action==='reserve_materials'){
   expect('workorders','Draft');const so=await find(trx,scope,'sales',r.data.source_sales_id);fail(so.status==='Confirmed','Material reservation requires a confirmed Sales Order.',409);const merch=await approvedMerch(trx,scope,so),p=await materialPlan(trx,scope,so);
   fail(p.bom.external_id===r.data.bom_id&&BigInt(p.quantity)===BigInt(r.data.quantity),'Work Order must match the Sales Order quantity and approved BOM.',409);
   await reserve(trx,scope,r,so,p,eventID);await linked(trx,scope,r.id,merch.id,'merchandising');await change(trx,scope,r,'Reserved',{reserved_grams:p.required},action,'Imported/manual Work Order material reserved from available stock.');
  }
  if(action==='cancel_workorder'){
   expect('workorders',['Draft','Reserved']);const held=await reservation(trx,scope,r);
   if(held){const item=await trx('records').where({...scope,id:held.item_id}).first();await move(trx,scope,r,item,eventID,'RESERVATION_RELEASE',0n,0n,-BigInt(held.quantity));await trx('inventory_reservations').where({...scope,id:held.id}).update({status:'Released'});}
   await change(trx,scope,r,'Cancelled',{},action,'Unissued Work Order cancelled; reserved material returned to available stock.');
  }
  if(action==='issue_materials'){
   expect('workorders','Reserved');const so=await find(trx,scope,'sales',r.data.source_sales_id);fail(so.status==='Confirmed','Production requires a confirmed Sales Order.',409);await approvedMerch(trx,scope,so);
   const p=await materialPlan(trx,scope,so,r.id),allocation=await reservation(trx,scope,r);
   fail(p.bom.external_id===r.data.bom_id&&BigInt(p.quantity)===BigInt(r.data.quantity)&&allocation&&BigInt(allocation.quantity)===BigInt(p.required),'Work Order quantity, approved BOM and active reservation must match.',409);
   const pos=await trx('records').where({...scope,resource:'purchases'}).whereNotIn('status',['Deleted','Archived','Cancelled']).whereRaw("data->>'source_sales_id' = ?",[so.external_id]);
   for(const po of pos){fail(po.status==='Received','Receive all linked purchase orders first.',409);const bill=await trx('records').where({...scope,resource:'invoices'}).whereIn('status',['Matched','Posted','PartPaid','Paid']).whereRaw("data->>'kind' = 'PURCHASE' AND data->>'source_id' = ?",[po.external_id]).first();fail(bill,'Match the linked supplier bill before material issue.',409);}
   await move(trx,scope,r,p.component,eventID,'MATERIAL_ISSUE',-BigInt(p.required),0n,-BigInt(p.required));await trx('inventory_reservations').where({...scope,id:allocation.id}).update({status:'Consumed'});
   await change(trx,scope,r,'MaterialsIssued',{consumed_grams:p.required,finished_item_id:p.item.external_id},action,'Reserved fabric issued atomically; physical and reserved balances reduced together.');
  }
  if(action==='produce'){expect('workorders','MaterialsIssued');const item=await find(trx,scope,'items',r.data.finished_item_id);await move(trx,scope,r,item,eventID,'PRODUCTION_RECEIPT',BigInt(r.data.quantity),BigInt(r.data.quantity));await change(trx,scope,r,'Produced',{},action,'Full finished quantity received under QC hold.');}
  if(action==='qc_hold'){expect('workorders','Produced');await change(trx,scope,r,'QCHold',{},action,'QC requires review. Produced goods remain held and unavailable for delivery.');}
  if(action==='qc_release'){expect('workorders',['Produced','QCHold']);const item=await find(trx,scope,'items',r.data.finished_item_id);await move(trx,scope,r,item,eventID,'QC_RELEASE',0n,-BigInt(r.data.quantity));await change(trx,scope,r,'QCReleased',{},action,'QC passed; held finished quantity released for dispatch.');}
  if(action==='create_delivery'){
   expect('workorders','QCReleased');const delivery=await create(trx,scope,'deliveries',{external_id:await nextCode(trx,scope,'DN'),workorder_id:r.external_id,date:today()});const so=await find(trx,scope,'sales',r.data.source_sales_id);await linked(trx,scope,delivery.id,so.id,'sales');await activity(trx,scope,r.id,action,'Delivery Draft created from QC-released Work Order.');result.record_id=delivery.id;
  }
  if(action==='dispatch'){
   expect('deliveries','Draft');const wo=await find(trx,scope,'workorders',r.data.workorder_id);fail(wo.status==='QCReleased','Dispatch requires QC-released production.',409);const so=await find(trx,scope,'sales',wo.data.source_sales_id);fail(so.status==='Confirmed','Sales Order was already delivered or is unavailable.',409);
   const item=await find(trx,scope,'items',wo.data.finished_item_id);await move(trx,scope,r,item,eventID,'DISPATCH',-BigInt(wo.data.quantity));
   await change(trx,scope,r,'Dispatched',{source_sales_id:so.external_id,quantity:wo.data.quantity,item_id:item.external_id},action,'Full finished quantity dispatched once. Invoice and cash are separate linked actions.');await change(trx,scope,wo,'Delivered',{},action,'QC-released finished goods dispatched.');await change(trx,scope,so,'Delivered',{delivery_id:r.id},action,'Sales Order fully delivered.');
  }
  const target=await trx('records').where({...scope,id:result.record_id}).select('id','resource','external_id','status').first();
  result={...result,record:target,request_hash};await trx('posting_events').where({id:eventID}).update({result:JSON.stringify(result)});return result;
 });
}
async function overview(db,scope,filters={}){
 const counts=await require('../resource-access.js').restrictRecords(db('records').where(scope).whereNotIn('status',['Deleted','Archived'])).select('resource').count('* as count').groupBy('resource');
 const stockRows=scope.dataset_id===DEMO?await db('inventory_balances as b').join('records as i','i.id','b.item_id').where({'b.company_id':scope.company_id,'b.dataset_id':scope.dataset_id}).select('i.id','i.external_id','i.name','i.data','b.physical','b.held','b.reserved'):[];
 const stages=scope.dataset_id===DEMO?await db('records').where(scope).whereNotIn('status',['Deleted','Archived']).whereIn('resource',['sales','merchandising','purchases','workorders','deliveries']).select('resource','status').count('* as count').groupBy('resource','status'):[];
 return {counts:counts.map(r=>({...r,count:Number(r.count)})),stages:stages.map(r=>({...r,count:Number(r.count)})),stock:stockRows,scope:scope.dataset_id,finance_available:scope.dataset_id===DEMO&&require('../resource-access.js').readAllowed('payments'),finance:scope.dataset_id===DEMO&&require('../resource-access.js').readAllowed('payments')?await require('./finance.js').snapshot(db,scope,filters):null};
}
module.exports={command,prepareDemo,materialPlan,overview,activity,linked,change,find,create,approvedMerch};
