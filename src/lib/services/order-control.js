const {fail,date,today,calendar,integer}=require('../core.js');
const {DEMO}=require('../registry.js');
const {assertRead,readAllowed}=require('../resource-access.js');
const {csv}=require('./imports.js');

const MAX_ORDERS=1000,MAX_LINKED=10000;
const STAGES=['sales','handover','materials','production','quality','dispatch','finance','complete'];
const STAGE_LABELS={sales:'Sales confirmation',handover:'Merchandising & review',materials:'Material readiness',production:'Production',quality:'Quality release',dispatch:'Dispatch',finance:'Finance handoff',complete:'Complete'};
const brief=r=>r?{id:r.id,resource:r.resource,external_id:r.external_id,name:r.name,status:r.status}:null;
const days=(a,b)=>Math.max(0,Math.floor((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000));
function group(rows,key){const map=new Map();for(const r of rows){const k=key(r);if(!map.has(k))map.set(k,[]);map.get(k).push(r);}return map;}
function settings(filters){
 const from=filters.from?date(filters.from,'From order date'):'',to=filters.to?date(filters.to,'To order date'):'';
 fail(!from||!to||from<=to,'From order date must not follow To order date.');
 const search=String(filters.search||'').trim(),buyer=String(filters.buyer||'').trim(),stage=String(filters.stage||''),owner=String(filters.owner||''),attention=String(filters.attention||'all');
 fail(search.length<=120&&buyer.length<=80,'Search or buyer code is too long.');
 fail(!stage||STAGES.includes(stage),'Choose a supported order stage.');fail(!owner||['operations','admin','finance'].includes(owner),'Choose a supported responsible role.');
 fail(['all','attention','review','late','shortage','quality'].includes(attention),'Choose a supported attention filter.');
 return {from,to,search,buyer,stage,owner,attention,page:integer(filters.page||1,'Page',{min:1,max:10000}),size:integer(filters.size||20,'Page size',{min:1,max:50})};
}

// These are explanations, not commands. Existing domain actions revalidate every write.
function explain(order,ctx){
 const {linked,bomsByItem,itemsByID,itemsByCode,balances,reservations,incoming,pending,billsByPO,receiptsByPO,deliveriesByWO,invoicesBySO,obligations,linesByDocument,buyerNames,financial,now}=ctx;
 const children=linked.get(order.external_id)||[],sheets=children.filter(r=>r.resource==='merchandising'),pos=children.filter(r=>r.resource==='purchases');
 const workorders=children.filter(r=>r.resource==='workorders');
 const priority=['Delivered','QCReleased','QCHold','Produced','MaterialsIssued','Reserved','Draft'];
 const wo=[...workorders].sort((a,b)=>priority.indexOf(a.status)-priority.indexOf(b.status))[0];
 const merch=sheets.find(r=>r.status==='Approved')||sheets[0];
 const target=sheets.find(r=>r.status==='Approved')?.data.delivery_date||null;
 const tasks=children.filter(r=>r.resource==='tasks'&&!['Done','Cancelled'].includes(r.status)&&r.data.due_date<now);
 const row={order:brief(order),buyer_code:order.data.customer_id,buyer_name:buyerNames.get(order.data.customer_id)||order.data.customer_id,order_date:calendar(order.business_date),order_value_minor:String(order.data.total_minor||0),target_date:target,delivery_overdue:Boolean(target&&target<now&&order.status!=='Delivered'),overdue_milestones:tasks.length,stage:'sales',owner:'operations',next_action:'Review source order',reason:'Open the current order and review its saved state.',target:brief(order),pending_review:false,attention:false,flags:[],material:null};
 const set=(stage,owner,next_action,reason,record=order,flag)=>{Object.assign(row,{stage,owner,next_action,reason,target:brief(record)});if(flag)row.flags.push(flag);return row;};
 const review=(record,stage,action,reason)=>{const request=pending.get(record.id);if(request){row.pending_review=true;row.review={id:request.id,external_id:request.external_id};if(record.resource==='purchases'){row.allowed_roles=['admin','finance'];row.owner_label='System Admin / Finance';}return set(stage,'admin','Review pending approval',`${record.external_id} has a pending request. A different permitted account must review the source in Approval Inbox.`,record,'review');}return set(stage,'operations',action,reason,record,'review_needed');};
 function moneyHandoff(){
  if(!financial)return set('finance','finance','Finance handoff','Delivery is complete. Finance reviews the linked customer invoice and receipts. Financial documents and balances are restricted to Finance / System Admin.');
  const invoices=invoicesBySO.get(order.external_id)||[],invoice=invoices.find(r=>['Posted','PartPaid','Paid'].includes(r.status))||invoices[0];
  if(!invoice)return set('finance','finance','Create customer invoice','Dispatch is complete; create the linked customer invoice before recording a receipt.');
  if(invoice.status==='Draft')return set('finance','finance','Post customer invoice','A saved invoice Draft is not a receivable until Finance posts it.',invoice);
  const obligation=obligations.get(invoice.id);
  if(!obligation)return set('finance','finance','Review invoice obligation','This invoice has no posted obligation. Inspect the source before recording any receipt.',invoice,'data_review');
  const remaining=BigInt(obligation.principal_minor)-BigInt(obligation.allocated_minor),due=calendar(obligation.due_date);
  row.collection={invoice:brief(invoice),outstanding_minor:String(remaining),due_date:due,days_overdue:remaining>0n?days(now,due):0};
  if(remaining>0n)return set('finance','finance','Record allocated customer receipt',`${invoice.external_id} has an outstanding balance. A saved payment Draft does not settle it; allocate and post the actual receipt.`,invoice,due<now?'collection_overdue':null);
  return set('complete','finance','Open completed invoice','Delivery and the posted customer invoice are fully settled. Supplier payments and payroll remain separate Finance flows.',invoice);
 }
 if(order.status==='Draft')return finish(set('sales','operations','Create quotation','This inquiry is still Draft. Quote it before confirming a sales order.'));
 if(order.status==='Quoted')return finish(set('sales','operations','Confirm sales order','The quotation is saved; confirm only after the buyer accepts it.'));
 if(order.status==='Delivered')return finish(moneyHandoff());
 if(order.status!=='Confirmed')return finish(set('sales','operations','Review order state','This source is outside the supported active order sequence.',order,'data_review'));
 const lines=linesByDocument.get(order.id)||[];
 if(lines.length!==1)return finish(set('handover','operations','Review order lines','The current full-quantity workflow requires exactly one finished style per order. Multi-line Drafts cannot be posted through this flow.',order,'data_review'));
 const item=itemsByID.get(lines[0].item_id),recipes=item?bomsByItem.get(item.external_id)||[]:[],approved=recipes.filter(r=>r.status==='Approved');
 if(approved.length!==1){
  if(approved.length>1)return finish(set('handover','admin','Review approved material recipes','Exactly one approved Bill of Materials is required for this finished style.',approved[0],'data_review'));
  const bom=recipes[0];return finish(bom?review(bom,'handover','Request material recipe review','The finished style needs an approved Bill of Materials before production planning.'):set('handover','operations','Prepare material recipe','No active Bill of Materials exists for this finished item.',order,'missing_recipe'));
 }
 if(!merch||merch.status!=='Approved')return finish(merch?review(merch,'handover','Request merchandising review','Review the style, material recipe and target delivery date before handover.'):set('handover','operations','Prepare merchandising sheet','The confirmed order has no approved merchandising handover.',order,'missing_handover'));
 if(merch.data.bom_id!==approved[0].external_id)return finish(set('handover','admin','Review handover recipe','The approved merchandising sheet does not match the active approved material recipe.',merch,'data_review'));
 const recipe=approved[0],component=itemsByCode.get(recipe.data.component_item_id);
 if(!component)return finish(set('materials','operations','Review component reference','The approved material recipe has no active component item in this namespace.',recipe,'data_review'));
 const balance=balances.get(component.id)||{},own=(reservations.get(order.id)||[]).reduce((n,r)=>n+BigInt(r.quantity),0n),required=BigInt(lines[0].quantity)*BigInt(recipe.data.grams_per_piece),physical=BigInt(balance.physical||0),held=BigInt(balance.held||0),reserved=BigInt(balance.reserved||0),available=physical-held-reserved+own;
 const consumed=workorders.some(r=>['MaterialsIssued','Produced','QCHold','QCReleased','Delivered'].includes(r.status)),remaining=consumed?0n:required;
 const shortage=remaining>available?remaining-available:0n,planned=(incoming.get(component.id)||[]),inbound=planned.reduce((n,r)=>n+BigInt(r.quantity),0n);
 row.material={component:component.external_id,unit:'g',required:String(required),physical:String(physical),held:String(held),reserved:String(reserved),own_reserved:String(own),available:String(available),shortage:String(shortage),incoming:String(inbound),uncovered:String(shortage>inbound?shortage-inbound:0n)};
 // Production states have already consumed fabric; a later warehouse shortage is not their blocker.
 if(wo&&['MaterialsIssued','Produced','QCHold','QCReleased','Delivered'].includes(wo.status)){
  if(wo.status==='MaterialsIssued')return finish(set('production','operations','Record full production','Reserved material was issued. Record the finished quantity; it enters quality hold.',wo));
  if(['Produced','QCHold'].includes(wo.status))return finish(set('quality','operations','Inspect and release quality hold','Finished goods remain unavailable for dispatch until quality is passed and stock is released.',wo,'quality'));
  if(wo.status==='QCReleased'){
   const delivery=(deliveriesByWO.get(wo.external_id)||[]).find(r=>r.status==='Draft');
   return finish(set('dispatch','operations',delivery?'Dispatch delivery':'Create delivery note',delivery?'A delivery Draft exists. Dispatch the full quality-released quantity.':'Quality is released. Create the linked delivery, then dispatch it.',delivery||wo));
  }
  return finish(set('dispatch','operations','Review delivery state','The work order is delivered but the sales source is not. Inspect the connected documents.',wo,'data_review'));
 }
 if(!order.data.material_plan)return finish(set('materials','operations','Recheck material requirement','Run the saved material check from the order. Availability shown here is shared current stock, not a reservation.',order,shortage>0n?'shortage':null));
 for(const po of pos){
  if(po.status==='Draft')return finish(review(po,'materials','Request purchase review','This linked purchase remains Draft. Resolve it before issuing material.'));
  if(po.status==='Approved'){
   const receipt=(receiptsByPO.get(po.external_id)||[]).find(r=>r.status==='Draft');
   return finish(set('materials','operations',receipt?'Accept goods receipt':'Create goods receipt','An approved purchase is incoming stock. Physical fabric increases only after goods receipt acceptance.',receipt||po,'incoming'));
  }
  if(po.status==='Received'){
   const bills=billsByPO.get(po.external_id)||[],matched=bills.find(r=>['Matched','Posted','PartPaid','Paid'].includes(r.status));
   if(!matched)return finish(set('materials','operations',bills[0]?'Match supplier bill':'Create supplier bill','The linked purchase is received, but its supplier bill must be matched before material issue. Supplier payment is not a production gate.',bills[0]||po,'bill_match'));
  }else return finish(set('materials','operations','Review linked purchase','The linked purchase is not in a supported received state.',po,'data_review'));
 }
 if(shortage>0n){const other=planned[0];return finish(set('materials','operations',shortage>inbound?'Create shortage purchase':'Receive incoming material',shortage>inbound?'Available material does not cover this order. Purchase only the uncovered shortage after checking approved incoming stock.':'Approved incoming stock covers the shortage on paper. Receive the goods before reserving production.',shortage>inbound?order:other?.record||order,'shortage'));}
 if(!wo)return finish(set('production','operations','Create and reserve work order','Current available fabric covers the requirement. Recheck and reserve it through the sales order; another order can still reserve it first.'));
 if(wo.status==='Draft')return finish(set('production','operations','Reserve work order material','A work order Draft exists. Reserve its approved fabric requirement before issuing it.',wo));
 if(wo.status==='Reserved'){
  if(own!==required||wo.data.bom_id!==recipe.external_id||BigInt(wo.data.quantity)!==BigInt(lines[0].quantity))return finish(set('materials','operations','Review material reservation','Work order quantity, recipe and its own active reservation must agree before issue.',wo,'data_review'));
  return finish(set('production','operations','Issue reserved fabric','Own reservation and received/matched purchasing documents are ready for material issue. The action rechecks these facts atomically.',wo));
 }
 return finish(set('production','operations','Review work order','Open the source work order to inspect its current state.',wo,'data_review'));
 function finish(result){if(result.delivery_overdue)result.flags.push('late');if(tasks.length)result.flags.push('milestone_overdue');result.attention=result.flags.length>0;result.stage_label=STAGE_LABELS[result.stage];result.owner_label=result.owner_label||{operations:'Operations',admin:'System Admin',finance:'Finance'}[result.owner];return result;}
}

async function orderControl(db,scope,filters={}){
 fail(scope.dataset_id===DEMO,'Order Control uses the Operations namespace only.',400);assertRead('sales');
 const f=settings(filters),financial=readAllowed('invoices','SALES')&&readAllowed('payments'),now=today();
 return db.transaction(async trx=>{
  // A single read-only snapshot keeps the related records and balances consistent.
  let q=trx('records').where({...scope,resource:'sales'}).whereNotIn('status',['Deleted','Archived','Cancelled']);
  if(f.from)q=q.where('business_date','>=',f.from);if(f.to)q=q.where('business_date','<=',f.to);
  if(f.buyer){const customer=await trx('records').where({...scope,resource:'customers',external_id:f.buyer}).first('id');fail(customer,'Buyer does not exist in this namespace.',404);q=q.whereRaw("data->>'customer_id' = ?",[f.buyer]);}
  if(f.search){const text='%'+f.search.replace(/[\\%_]/g,c=>'\\'+c)+'%';q=q.where(w=>w.whereILike('external_id',text).orWhereILike('name',text));}
  const orders=await q.orderBy('business_date','desc').orderBy('external_id').limit(MAX_ORDERS+1);
  fail(orders.length<=MAX_ORDERS,'More than 1,000 orders match. Narrow the order dates, buyer or search before opening Order Control.',413);
  const codes=orders.map(r=>r.external_id),ids=orders.map(r=>r.id);
  const load=async query=>{const rows=await query.limit(MAX_LINKED+1);fail(rows.length<=MAX_LINKED,'Too many linked records. Narrow the order dates or buyer.',413);return rows;};
  const records=resource=>trx('records').where(scope).whereNotIn('status',['Deleted','Archived','Cancelled']).whereIn('resource',Array.isArray(resource)?resource:[resource]);
  const children=codes.length?await load(records(['merchandising','purchases','workorders','tasks']).whereIn(trx.raw("data->>'source_sales_id'"),codes).orderBy('created_at').orderBy('id')):[];
  const poCodes=children.filter(r=>r.resource==='purchases').map(r=>r.external_id),woCodes=children.filter(r=>r.resource==='workorders').map(r=>r.external_id);
  const receipts=poCodes.length?await load(records('receipts').whereIn(trx.raw("data->>'purchase_id'"),poCodes)):[];
  const deliveries=woCodes.length?await load(records('deliveries').whereIn(trx.raw("data->>'workorder_id'"),woCodes)):[];
  const bills=poCodes.length?await load(records('invoices').whereRaw("data->>'kind'='PURCHASE'").whereIn(trx.raw("data->>'source_id'"),poCodes)):[];
  const invoices=financial&&codes.length?await load(records('invoices').whereRaw("data->>'kind'='SALES'").whereIn(trx.raw("data->>'source_id'"),codes)):[];
  const lines=ids.length?await load(trx('document_lines').where(scope).whereIn('document_id',ids)):[];
  const itemIDs=[...new Set(lines.map(r=>r.item_id))];
  const finished=itemIDs.length?await load(records('items').whereIn('id',itemIDs)):[];
  const recipes=finished.length?await load(records('bom').whereIn(trx.raw("data->>'finished_item_id'"),finished.map(r=>r.external_id))):[];
  const componentCodes=[...new Set(recipes.map(r=>r.data.component_item_id))],components=componentCodes.length?await load(records('items').whereIn('external_id',componentCodes)):[];
  const componentIDs=components.map(r=>r.id),stock=componentIDs.length?await load(trx('inventory_balances').where({...scope,warehouse:'HQ-STORE'}).whereIn('item_id',componentIDs)):[];
  const reservations=ids.length?await load(trx('inventory_reservations').where({...scope,status:'Active'}).whereIn('sales_id',ids)):[];
  const incomingLines=componentIDs.length?await load(trx('document_lines as l').join('records as p','p.id','l.document_id').where({'p.company_id':scope.company_id,'p.dataset_id':scope.dataset_id,'l.company_id':scope.company_id,'l.dataset_id':scope.dataset_id,'p.resource':'purchases','p.status':'Approved'}).whereIn('l.item_id',componentIDs).select('l.item_id','l.quantity','p.id','p.external_id','p.name','p.status','p.resource')):[];
  const reviewIDs=[...children,...recipes].map(r=>r.id),requests=reviewIDs.length?await load(trx('approval_requests').where({...scope,status:'Pending'}).whereIn('document_id',reviewIDs).select('id','external_id','document_id')):[];
  const buyers=codes.length?await load(records('customers').whereIn('external_id',[...new Set(orders.map(r=>r.data.customer_id))]).select('external_id','name')):[];
  const obligations=financial&&invoices.length?await load(trx('obligations').where({...scope,kind:'AR'}).whereIn('document_id',invoices.map(r=>r.id))):[];
  const context={linked:group(children,r=>r.data.source_sales_id),bomsByItem:group(recipes,r=>r.data.finished_item_id),itemsByID:new Map(finished.map(r=>[r.id,r])),itemsByCode:new Map(components.map(r=>[r.external_id,r])),balances:new Map(stock.map(r=>[r.item_id,r])),reservations:group(reservations,r=>r.sales_id),incoming:group(incomingLines.map(r=>({...r,record:brief(r)})),r=>r.item_id),pending:new Map(requests.map(r=>[r.document_id,r])),billsByPO:group(bills,r=>r.data.source_id),receiptsByPO:group(receipts,r=>r.data.purchase_id),deliveriesByWO:group(deliveries,r=>r.data.workorder_id),invoicesBySO:group(invoices,r=>r.data.source_id),obligations:new Map(obligations.map(r=>[r.document_id,r])),linesByDocument:group(lines,r=>r.document_id),buyerNames:new Map(buyers.map(r=>[r.external_id,r.name])),financial,now};
  const cohortRows=orders.map(order=>explain(order,context));
  let rows=[...cohortRows];
  if(f.stage)rows=rows.filter(r=>r.stage===f.stage);if(f.owner)rows=rows.filter(r=>(r.allowed_roles||[r.owner]).includes(f.owner));
  if(f.attention!=='all')rows=rows.filter(r=>f.attention==='attention'?r.attention:f.attention==='review'?r.pending_review:r.flags.includes(f.attention));
  rows.sort((a,b)=>Number(b.delivery_overdue)-Number(a.delivery_overdue)||Number(b.attention)-Number(a.attention)||(a.target_date||'9999').localeCompare(b.target_date||'9999')||a.order.external_id.localeCompare(b.order.external_id));
  const summary={orders:cohortRows.length,attention:cohortRows.filter(r=>r.attention).length,awaiting_review:cohortRows.filter(r=>r.pending_review).length,late_delivery:cohortRows.filter(r=>r.delivery_overdue).length,quality_held:cohortRows.filter(r=>r.flags.includes('quality')).length,complete:cohortRows.filter(r=>r.stage==='complete').length};
  return {filters:f,generated_at:new Date().toISOString(),current_date:now,financial_visible:financial,summary,stages:STAGES.map(stage=>({stage,label:STAGE_LABELS[stage],count:cohortRows.filter(r=>r.stage===stage).length})),rows:rows.slice((f.page-1)*f.size,f.page*f.size),meta:{total:rows.length,page:f.page,size:f.size,pages:Math.max(1,Math.ceil(rows.length/f.size))},export_rows:rows,notes:['Current document states and warehouse balances, not a historical replay. Dates filter the source order cohort.','Next steps are guidance. Open the saved document; its domain action rechecks permission, status, references and available stock.','Material availability is shared current stock, not promised to every order. Quantities are grams in the response; the interface displays kilograms.','Supplier bill matching gates material issue; supplier payment does not. Payroll is a separate flow.','Up to 1,000 matching orders and bounded linked records per snapshot. Narrow filters for larger datasets.']};
 },{isolationLevel:'repeatable read',readOnly:true});
}
function exportControl(data){return csv(data.export_rows.map(r=>({order_no:r.order.external_id,buyer_code:r.buyer_code,buyer:r.buyer_name,order_date:r.order_date,order_status:r.order.status,stage:r.stage_label,responsible_role:r.owner_label,next_action:r.next_action,reason:r.reason,target_document:r.target?.external_id||'',target_delivery:r.target_date||'',delivery_overdue:r.delivery_overdue,overdue_milestones:r.overdue_milestones,material_shortage_grams:r.material?.shortage||'',...(data.financial_visible?{receivable_outstanding_minor:r.collection?.outstanding_minor??'',receivable_due:r.collection?.due_date||''}:{})})),['order_no','buyer_code','buyer','order_date','order_status','stage','responsible_role','next_action','reason','target_document','target_delivery','delivery_overdue','overdue_milestones','material_shortage_grams',...(data.financial_visible?['receivable_outstanding_minor','receivable_due']:[])]);}
module.exports={orderControl,exportControl,settings,explain,STAGES,STAGE_LABELS,MAX_ORDERS};
