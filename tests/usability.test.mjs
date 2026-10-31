import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
const require=createRequire(import.meta.url),run=promisify(execFile),knex=require('knex');
Object.assign(process.env,{APP_ENV:'test',SMARTERP_SKIP_ENV_FILE:'1',AI_ENABLED:'false'});
const {COMPANY,DEMO,NW,normalize}=require('../src/lib/registry.js'),records=require('../src/lib/services/records.js'),workflow=require('../src/lib/services/workflow.js'),reviews=require('../src/lib/services/approvals.js'),finance=require('../src/lib/services/finance.js'),lifecycle=require('../src/lib/services/lifecycle.js'),buyers=require('../src/lib/services/buyers.js'),imports=require('../src/lib/services/imports.js'),{withActor}=require('../src/lib/actor.js'),{today}=require('../src/lib/core.js');
const scope={company_id:COMPANY,dataset_id:DEMO},actor=role=>({id:randomUUID(),email:role+'@fixture.local',role});
let engine,wire,db,order,invoice,bill,payroll;
const get=(resource,external_id)=>db('records').where({...scope,resource,external_id}).first();
const row=(resource,data)=>db.transaction(async trx=>(await records.insertRecord(trx,scope,resource,await normalize(trx,scope,resource,[data]))).record);
const cmd=(record,action,payload={})=>workflow.command(db,scope,record.id,action,payload);
const approve=async(record,checks={})=>{const request=(await reviews.submit(db,scope,record.id,{request_key:randomUUID()})).request;return reviews.decide(db,scope,request.id,{decision:'Approved',checks});};
const changeDay=(value,days)=>{const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const realToday=today(),yesterday=changeDay(realToday,-1);
before(async()=>{
 engine=await PGlite.create();wire=new PGLiteSocketServer({db:engine,host:'127.0.0.1',port:25456});await wire.start();
 const url='postgresql://postgres:postgres@127.0.0.1:25456/postgres',env={...process.env,DATABASE_URL:url,DATABASE_DIRECT_URL:url};
 for(const file of ['migrate.cjs','seed-demo.cjs'])await run(process.execPath,['scripts/'+file],{env});
 db=knex({client:'pg',connection:url,pool:{min:0,max:1}});
 // Exercise as-of reporting across a real date boundary without changing any
 // live DB clock, application configuration or source dataset dates.
 const RealDate=globalThis.Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[yesterday+'T12:00:00+06:00']));}static now(){return new RealDate(yesterday+'T12:00:00+06:00').getTime();}};
 try{
  await workflow.prepareDemo(db,scope);order=await get('sales','SO-DEMO-001');await approve(await get('bom','BOM-DEMO-001'));
  await cmd(order,'make_quote');await cmd(order,'confirm_order');
  const merch=await cmd(order,'create_merchandising',{style_code:'TEST-STYLE',style_name:'T-shirt',fabric_spec:'Cotton',delivery_date:'2026-12-30'});
  await approve(await db('records').where({id:merch.record_id}).first(),{specs_confirmed:true,bom_confirmed:true,date_confirmed:true});
  await cmd(await get('openings','OPEN-DEMO-001'),'post_opening');await cmd(order,'plan_materials');
  let result=await cmd(order,'create_purchase',{supplier_id:'SUP-001',rate:'500'}),po=await db('records').where({id:result.record_id}).first();await approve(po);
  result=await cmd(po,'create_receipt');await cmd(await db('records').where({id:result.record_id}).first(),'accept_receipt');
  result=await cmd(po,'create_supplier_bill');bill=await db('records').where({id:result.record_id}).first();await cmd(bill,'match_supplier_bill');await cmd(bill,'post_supplier_bill');
  result=await cmd(order,'create_workorder');const wo=await db('records').where({id:result.record_id}).first();await cmd(wo,'issue_materials');await cmd(wo,'produce');await cmd(wo,'qc_release');
  result=await cmd(wo,'create_delivery');await cmd(await db('records').where({id:result.record_id}).first(),'dispatch');
  result=await cmd(order,'create_invoice');invoice=await db('records').where({id:result.record_id}).first();await cmd(invoice,'post_invoice');
 }finally{globalThis.Date=RealDate;}
});
after(async()=>{await db?.destroy();await wire?.stop();await new Promise(r=>setTimeout(r,100));await engine?.close();});

test('buyer numbers are automatic; duplicate identity requires explicit reviewed confirmation',async()=>{
 const original=(await records.createDraft(db,scope,'customers',[{external_id:'',name:'Acme Buying House',email:'acme@fixture.local',country:'BD',phone:'+880 1700 123456'}],randomUUID())).record;
 assert.match(original.external_id,/^CUS-\d{4}-\d{5}$/);
 const data={external_id:'',name:' ACME   Buying House ',email:'acme@fixture.local',country:'BD'},candidates=await buyers.matches(db,scope,data);
 assert.ok(candidates.matches.some(r=>r.id===original.id));
 const before=Number((await db('records').where({...scope,resource:'customers'}).count('* as n').first()).n);
 await assert.rejects(records.createDraft(db,scope,'customers',[data],randomUUID()),e=>e.status===409&&e.details.code==='POSSIBLE_DUPLICATE_BUYER');
 assert.equal(Number((await db('records').where({...scope,resource:'customers'}).count('* as n').first()).n),before);
 await assert.rejects(records.createDraft(db,scope,'customers',[data],randomUUID(),{duplicate_ack:{fingerprint:'stale',reason:'Separate legal buyer'}}),e=>e.status===409);
 const accepted=await records.createDraft(db,scope,'customers',[data],randomUUID(),{duplicate_ack:{fingerprint:candidates.fingerprint,reason:'Separate legal buyer with shared purchasing contact'}});
 assert.notEqual(accepted.record.id,original.id);assert.equal((await db('activity_log').where({record_id:accepted.record.id,action:'DUPLICATE_REVIEWED'})).length,1);
 const b=await imports.preview(db,scope,{resource:'customers',filename:'buyer-warning.csv',buffer:Buffer.from('external_id,name,email,country\nBUYER-POSSIBLE-DUP,Acme Buying House,acme@fixture.local,BD')});
 assert.equal(b.error_count,0);assert.ok(b.warning_count>=1);
});
test('unused drafts leave active lists with tombstones, history and idempotent retry',async()=>{
 const draft=await row('sales',{external_id:'SO-DELETE-ME',line_id:'1',date:realToday,item_id:'TSHIRT-001',quantity:'10',rate:'450',customer_id:'BUYER-001'});
 const payload={action:'delete_draft',reason:'Entered the wrong order',request_key:randomUUID()};
 const result=await lifecycle.command(db,scope,'sales',draft.id,payload);assert.equal(result.status,'Deleted');assert.equal((await lifecycle.command(db,scope,'sales',draft.id,payload)).replayed,true);
 assert.equal((await records.listRecords(db,scope,'sales',{search:draft.external_id})).meta.total,0);
 assert.equal((await records.listRecords(db,scope,'sales',{search:draft.external_id,lifecycle:'deleted'})).meta.total,1);
 assert.ok(await db('activity_log').where({record_id:draft.id,action:'DELETE_DRAFT'}).first());
 await lifecycle.command(db,scope,'sales',draft.id,{action:'restore',reason:'Restore the original draft',request_key:randomUUID()});assert.equal((await get('sales',draft.external_id)).status,'Draft');
 await lifecycle.command(db,scope,'sales',draft.id,{...payload,request_key:randomUUID()});
 await assert.rejects(lifecycle.command(db,{...scope,dataset_id:NW},'sales',draft.id,payload),e=>e.status===403);
 await assert.rejects(lifecycle.command(db,scope,'sales',order.id,{...payload,request_key:randomUUID()}),e=>e.status===409);
});
test('archive blocks new use, protects linked records, and restore keeps the same buyer code',async()=>{
 const buyer=await row('customers',{external_id:'BUYER-ARCHIVE',name:'Archive Fixture',country:'BD'});
 const payload={action:'archive',reason:'Buyer account is dormant',request_key:randomUUID()};
 await lifecycle.command(db,scope,'customers',buyer.id,payload);
 await assert.rejects(row('sales',{external_id:'SO-INACTIVE-BUYER',line_id:'1',date:realToday,item_id:'TSHIRT-001',quantity:'1',rate:'450',customer_id:buyer.external_id}),/inactive/);
 assert.equal((await records.listRecords(db,scope,'customers',{lifecycle:'archived',search:buyer.external_id})).meta.total,1);
 await lifecycle.command(db,scope,'customers',buyer.id,{action:'restore',reason:'Buyer resumed purchasing',request_key:randomUUID()});assert.equal((await get('customers',buyer.external_id)).status,'Active');
 const linked=await row('sales',{external_id:'SO-LINKED-BUYER',line_id:'1',date:realToday,item_id:'TSHIRT-001',quantity:'1',rate:'450',customer_id:buyer.external_id});
 await assert.rejects(lifecycle.command(db,scope,'customers',buyer.id,{...payload,request_key:randomUUID()}),e=>e.status===409&&e.details.code==='LINKED_DOCUMENTS');
 await withActor(actor('finance'),()=>assert.rejects(lifecycle.command(db,scope,'sales',linked.id,{action:'delete_draft',reason:'Unauthorized deletion',request_key:randomUUID()}),e=>e.status===403));
});
test('pending reviews block deletion and domain postings remain immutable',async()=>{
 const bom=await row('bom',{external_id:'BOM-PENDING-DELETE',name:'Pending fixture',finished_item_id:'TSHIRT-001',component_item_id:'FABRIC-001',kg_per_piece:'0.23'});
 await reviews.submit(db,scope,bom.id,{request_key:randomUUID()});
 await assert.rejects(lifecycle.command(db,scope,'bom',bom.id,{action:'delete_draft',reason:'Remove pending record',request_key:randomUUID()}),/pending approval/);
 await assert.rejects(lifecycle.command(db,scope,'invoices',invoice.id,{action:'delete_draft',reason:'Remove posted invoice',request_key:randomUUID()}),e=>e.status===409);
 const sheet=await db('records').where({...scope,resource:'merchandising',status:'Approved'}).whereRaw("data->>'source_sales_id' = ?",[order.external_id]).first();
 await assert.rejects(lifecycle.command(db,scope,'merchandising',sheet.id,{action:'cancel_document',reason:'Cannot undo delivered production',request_key:randomUUID()}),e=>e.status===409&&e.details.code==='LINKED_DOCUMENTS');
});
test('customer and supplier payment reversals restore balances and preserve original-date reports',async()=>{
 for(const [kind,target,amount] of [['CUSTOMER',invoice,'2000000'],['SUPPLIER',bill,'400000']]){
  const payment=await row('payments',{external_id:'PAY-REV-'+kind,kind,target_id:target.external_id,amount,date:yesterday,reference:'REF-REV-'+kind});await cmd(payment,'post_payment');
  const original=await finance.snapshot(db,scope,{to:yesterday});const originalCash=await db('cash_entries').where({payment_id:payment.id}).first();
  const payload={reason:'Bank transaction entered against the wrong document',date:realToday};
  await withActor(actor('operations'),()=>assert.rejects(finance.reversePayment(db,scope,payment.id,payload),e=>e.status===403));
  await assert.rejects(finance.reversePayment(db,scope,payment.id,{...payload,date:changeDay(yesterday,-1)}),/predate/);
  await assert.rejects(finance.reversePayment(db,scope,payment.id,{...payload,date:changeDay(realToday,1)}),/future/);
  const result=await withActor(actor('finance'),()=>finance.reversePayment(db,scope,payment.id,payload));assert.ok(result.voucher_id);
  assert.equal((await finance.reversePayment(db,scope,payment.id,payload)).replayed,true);
  await assert.rejects(finance.reversePayment(db,scope,payment.id,{...payload,reason:'Different reversal note'}),/different inputs/);
  assert.equal((await db('payment_reversals').where({payment_id:payment.id})).length,1);
  assert.equal((await db('cash_entries').where({payment_id:payment.id}).first()).id,originalCash.id);
  assert.equal((await db('payment_allocations').where({payment_id:payment.id})).length,1);
  assert.equal((await db('obligations').where({document_id:target.id}).first()).allocated_minor,'0');
  assert.equal((await get('payments',payment.external_id)).status,'Reversed');
  const old=await finance.snapshot(db,scope,{to:yesterday});assert.equal(old.net_cash_minor,original.net_cash_minor);assert.equal(old.ar_minor,original.ar_minor);assert.equal(old.ap_minor,original.ap_minor);
 }
 const report=await finance.snapshot(db,scope,{to:realToday});assert.equal(report.ar_minor,'450000000');assert.equal(report.ap_minor,'40000000');assert.equal(report.net_cash_minor,'0');
 const lines=await db('finance_journal_lines').select('journal_id').sum({debit:'debit_minor',credit:'credit_minor'}).groupBy('journal_id');assert.ok(lines.every(l=>l.debit===l.credit));
});
test('salary reversal voids the old payslip and permits a new full settlement',async()=>{
 await finance.preparePeople(db,scope);payroll=await get('payroll','PAYROLL-DEMO-001');await cmd(await get('attendance','ATT-DEMO-001'),'review_attendance');await cmd(payroll,'review_payroll');await approve(await get('payroll',payroll.external_id));
 const first=await row('payments',{external_id:'SAL-ORIGINAL',kind:'SALARY',target_id:payroll.external_id,amount:'29000',date:realToday});const paid=await cmd(first,'post_payment');
 await finance.reversePayment(db,scope,first.id,{reason:'Wrong salary bank entry needs correction',date:realToday});
 assert.equal((await db('records').where({id:paid.payslip_id}).first()).status,'Reversed');assert.equal((await get('payroll',payroll.external_id)).status,'Approved');
 const second=await row('payments',{external_id:'SAL-CORRECTED',kind:'SALARY',target_id:payroll.external_id,amount:'29000',date:realToday});await cmd(second,'post_payment');assert.equal((await get('payroll',payroll.external_id)).status,'Paid');
 const slips=await db('records').where({...scope,resource:'payslips'});assert.equal(slips.filter(s=>s.status==='Paid').length,1);assert.equal(slips.filter(s=>s.status==='Reversed').length,1);
 const report=await finance.snapshot(db,scope);assert.equal(report.payroll_pending_minor,'0');assert.equal(report.net_cash_minor,'-2900000');
});
test('dashboard aggregates real order links and distinguishes records, pieces and order value',async()=>{
 const {dashboard,exportDashboard}=require('../src/lib/services/analytics.js');
 const data=await dashboard(db,scope,{to:realToday});
 assert.equal(data.totals.orders,1);assert.equal(data.totals.pieces,'10000');assert.equal(data.totals.order_value_minor,'450000000');assert.equal(data.totals.workorders,1);assert.equal(data.totals.merchandising,1);
 assert.equal(data.top_buyers[0].buyer_code,'BUYER-001');assert.equal(data.production[0].status,'Delivered');assert.equal(data.stock.length,2);
 const filtered=await dashboard(db,scope,{buyer:'BUYER-ARCHIVE',to:realToday});assert.equal(filtered.totals.documents,1);assert.equal(filtered.totals.orders,0);assert.equal(filtered.totals.workorders,0);assert.equal(filtered.finance.ar_minor,'0');assert.equal(filtered.finance.cash_trend.length,0);
 const selected=await dashboard(db,scope,{buyer:'BUYER-001',status:'Delivered',to:realToday});assert.equal(selected.totals.documents,1);assert.equal(selected.finance.ar_minor,'450000000');
 const linked=await records.listRecords(db,scope,'workorders',{buyer:'BUYER-001',from:'2026-10-29',to:'2026-10-29',date_basis:'order'});assert.equal(linked.meta.total,1);
 assert.equal((await records.listRecords(db,scope,'workorders',{buyer:'BUYER-ARCHIVE',date_basis:'order'})).meta.total,0);
 assert.equal((await records.listRecords(db,scope,'invoices',{buyer:'BUYER-001'})).meta.total,2);
 assert.equal((await records.listRecords(db,scope,'sales',{status:'ConfirmedOrDelivered'})).meta.total,1);
 assert.equal(exportDashboard(selected).includes('Top buyers'),true);assert.equal(exportDashboard(selected).includes('Salary'),false);assert.equal(exportDashboard(selected).includes('Warehouse stock'),true);assert.equal(exportDashboard(selected).includes('Merchandising stages'),true);
 const ops=await withActor(actor('operations'),()=>dashboard(db,scope,{to:realToday}));assert.equal(ops.finance,undefined);assert.equal(ops.totals.orders,1);
 await assert.rejects(dashboard(db,{...scope,dataset_id:NW},{}),/Operations/);await assert.rejects(dashboard(db,scope,{from:'2026-12-31',to:'2026-01-01'}),/From/);await assert.rejects(dashboard(db,scope,{buyer:'MISSING'}),e=>e.status===404);
 const report=await finance.snapshot(db,scope);assert.equal(report.collections_minor,'0');assert.equal(report.payments_minor,'2900000');
});
test('removed child drafts do not block replacement purchasing, reservation, issue or planning',async()=>{
 const so=await row('sales',{external_id:'SO-RECOVERY',line_id:'1',date:realToday,item_id:'TSHIRT-001',quantity:'10',rate:'450',customer_id:'BUYER-001'});
 await cmd(so,'make_quote');await cmd(so,'confirm_order');
 const created=await cmd(so,'create_merchandising',{style_code:'RECOVERY',style_name:'Recovery T-shirt',fabric_spec:'Cotton',delivery_date:changeDay(realToday,30)});
 await approve(await db('records').where({id:created.record_id}).first(),{specs_confirmed:true,bom_confirmed:true,date_confirmed:true});await cmd(so,'plan_materials');
 const deadWO=await row('workorders',{external_id:'WO-DELETED-RECOVERY',source_sales_id:so.external_id,bom_id:'BOM-DEMO-001',quantity:'10',date:realToday});
 await assert.rejects(lifecycle.command(db,scope,'workorders',deadWO.id,{action:'delete_draft',reason:'Unused imported Work Order',request_key:randomUUID()}),e=>e.status===409);
 await cmd(deadWO,'cancel_workorder');
 const deadPO=await row('purchases',{external_id:'PO-DELETED-RECOVERY',line_id:'1',date:realToday,item_id:'FABRIC-001',quantity:'2.2',rate:'500',supplier_id:'SUP-001',source_sales_id:so.external_id});
 await lifecycle.command(db,scope,'purchases',deadPO.id,{action:'delete_draft',reason:'Duplicate unposted purchase',request_key:randomUUID()});
 const madePO=await cmd(so,'create_purchase',{supplier_id:'SUP-001',rate:'500'}),po=await db('records').where({id:madePO.record_id}).first();await approve(po);
 const receipt=await cmd(po,'create_receipt'),grn=await db('records').where({id:receipt.record_id}).first();
 await lifecycle.command(db,scope,'receipts',grn.id,{action:'delete_draft',reason:'Receipt entered before review',request_key:randomUUID()});
 assert.equal((await cmd(po,'create_receipt')).record_id,grn.id);
 await lifecycle.command(db,scope,'receipts',grn.id,{action:'restore',reason:'Restore the original receipt',request_key:randomUUID()});await cmd(grn,'accept_receipt');
 const madeBill=await cmd(po,'create_supplier_bill'),supplierBill=await db('records').where({id:madeBill.record_id}).first();await cmd(supplierBill,'match_supplier_bill');
 const madeWO=await cmd(so,'create_workorder'),wo=await db('records').where({id:madeWO.record_id}).first();assert.equal(wo.status,'Reserved');
 await assert.rejects(lifecycle.command(db,scope,'workorders',deadWO.id,{action:'restore',reason:'Restore superseded Work Order',request_key:randomUUID()}),e=>e.status===409);
 await cmd(wo,'issue_materials');assert.equal((await get('workorders',wo.external_id)).status,'MaterialsIssued');
 const plan=await workflow.command(db,scope,so.id,'create_ta_plan',{planned_start:realToday,target_date:changeDay(realToday,30)});
 const last=await db('records').where({id:plan.tasks.at(-1).id}).first(),previous=await db('records').where({id:plan.tasks.at(-2).id}).first();
 await lifecycle.command(db,scope,'tasks',last.id,{action:'delete_draft',reason:'Shipment milestone no longer needed',request_key:randomUUID()});
 await workflow.command(db,scope,previous.id,'cancel_task',{expected_version:0,reason:'QC schedule superseded'});
 assert.equal((await get('tasks',previous.external_id)).status,'Cancelled');
});
test('integrity check reconciles allocations net of immutable reversals',async()=>{
 await db.destroy();try{const {stdout}=await run(process.execPath,['scripts/check-integrity.cjs'],{env:{...process.env,DATABASE_URL:'postgresql://postgres:postgres@127.0.0.1:25456/postgres'}});assert.equal(JSON.parse(stdout.trim()).reconciled,true);}finally{db=knex({client:'pg',connection:'postgresql://postgres:postgres@127.0.0.1:25456/postgres',pool:{min:0,max:1}});}
});
