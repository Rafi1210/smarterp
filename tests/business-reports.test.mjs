import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
const require=createRequire(import.meta.url),run=promisify(execFile),knex=require('knex');
Object.assign(process.env,{APP_ENV:'test',SMARTERP_SKIP_ENV_FILE:'1',AI_ENABLED:'false'});
const {COMPANY,DEMO,NW}=require('../src/lib/registry.js'),{withActor}=require('../src/lib/actor.js'),{assertAction}=require('../src/lib/resource-access.js'),{today}=require('../src/lib/core.js');
const imports=require('../src/lib/services/imports.js'),records=require('../src/lib/services/records.js'),workflow=require('../src/lib/services/workflow.js'),reviews=require('../src/lib/services/approvals.js'),finance=require('../src/lib/services/finance.js'),business=require('../src/lib/services/business-reports.js');
const scope={company_id:COMPANY,dataset_id:DEMO},manifest=JSON.parse(fs.readFileSync('data/business-pack/manifest.json')),pack=manifest.focus;
let engine,wire,db,env,actors,so,po,wo,invoice,bill,customerPayment,payroll;
const role=(name,fn)=>withActor(actors[name],fn),get=(resource,external_id)=>db('records').where({...scope,resource,external_id}).first();
const action=(name,r,command,payload={})=>role(name,()=>{assertAction(command,r);return workflow.command(db,scope,r.id,command,payload);});
async function approve(name,r,checks={}){const {request}=await role(name,()=>reviews.submit(db,scope,r.id,{request_key:randomUUID()}));await role(name,()=>assert.rejects(reviews.decide(db,scope,request.id,{decision:'Approved',checks}),e=>[403,409].includes(e.status)));return role('admin',()=>reviews.decide(db,scope,request.id,{decision:'Approved',checks}));}
async function upload(file,name){const entry=manifest.files.find(f=>f.file===file),buffer=fs.readFileSync('data/business-pack/'+file);return role(name,async()=>{const preview=await imports.preview(db,scope,{resource:entry.resource,filename:file,buffer});assert.equal(preview.error_count,0,JSON.stringify(preview.documents.map(d=>d.issues)));let result;do{result=await imports.commit(db,scope,preview.id);}while(result.status==='COMMITTING');assert.equal(result.status,'COMPLETED',JSON.stringify(result));return result;});}
async function create(name,resource,row){return role(name,async()=>(await records.createDraft(db,scope,resource,[row],randomUUID())).record);}
before(async()=>{
 engine=await PGlite.create();wire=new PGLiteSocketServer({db:engine,host:'127.0.0.1',port:25458});await wire.start();const url='postgresql://postgres:postgres@127.0.0.1:25458/postgres';
 env={...process.env,DATABASE_URL:url,DATABASE_DIRECT_URL:url,SMARTERP_ADMIN_PASSWORD:'BusinessFixtureAdmin2026',SMARTERP_OPERATIONS_PASSWORD:'BusinessFixtureOps2026',SMARTERP_FINANCE_PASSWORD:'BusinessFixtureFinance2026'};
 for(const script of ['migrate.cjs','seed-demo.cjs','setup-auth.cjs'])await run(process.execPath,['scripts/'+script],{env});
 db=knex({client:'pg',connection:url,pool:{min:0,max:1}});actors=Object.fromEntries((await db('app_users').select('id','email','role')).map(a=>[a.role,a]));
});
after(async()=>{await db?.destroy();await wire?.stop();await new Promise(r=>setTimeout(r,100));await engine?.close();});
test('all eleven source CSVs have original byte hashes and import guards preserve Drafts and role separation',async()=>{
 const verified=require('../scripts/verify-business-pack.cjs').verifyBusinessPack();assert.equal(verified.verifiedFiles,11);assert.equal(verified.rows,66);
 for(const file of ['01-buyers.csv','02-suppliers.csv','03-items.csv','05-bom.csv','06-opening-stock.csv','07-focus-sales.csv'])await upload(file,'operations');
 await assert.rejects(upload('04-employees.csv','operations'),e=>e.status===403);await upload('04-employees.csv','finance');
 assert.equal((await get('sales',pack.sales)).status,'Draft');assert.equal((await get('bom',pack.bom)).status,'Draft');assert.equal((await get('openings','OPEN-BA26-001')).status,'Draft');
 assert.equal((await db('stock_movements')).length,0);assert.equal((await db('cash_entries')).length,0);assert.equal((await db('obligations')).length,0);
 const replay=await upload('07-focus-sales.csv','operations');assert.equal(replay.skipped,1);
});
test('Operations submits BOM and Merchandising; a different Admin approves the scoped source records',async()=>{
 await approve('operations',await get('bom',pack.bom));so=await get('sales',pack.sales);
 await action('operations',so,'make_quote');await action('operations',await get('sales',pack.sales),'confirm_order');await upload('08-merchandising.csv','operations');
 await approve('operations',await get('merchandising','MER-BA26-001'),{specs_confirmed:true,bom_confirmed:true,date_confirmed:true});
 await action('operations',await get('openings','OPEN-BA26-001'),'post_opening');const result=await action('operations',await get('sales',pack.sales),'plan_materials');assert.equal(result.plan.required,'2200000');assert.equal(result.plan.shortage,'800000');
});
test('the uploaded focus order completes purchasing, stock reservation, production, QC and delivery through domain actions',async()=>{
 let result=await action('operations',await get('sales',pack.sales),'create_purchase',{supplier_id:'SUP-BA26-001',rate:'500'});po=await db('records').where({id:result.record_id}).first();await approve('operations',po);
 result=await action('operations',await get('purchases',po.external_id),'create_receipt');await action('operations',await db('records').where({id:result.record_id}).first(),'accept_receipt');
 result=await action('operations',await get('purchases',po.external_id),'create_supplier_bill');bill=await db('records').where({id:result.record_id}).first();await action('operations',bill,'match_supplier_bill');
 await role('operations',()=>assert.rejects(Promise.resolve().then(()=>assertAction('post_supplier_bill',bill)),e=>e.status===403));await action('finance',await get('invoices',bill.external_id),'post_supplier_bill');
 result=await action('operations',await get('sales',pack.sales),'create_workorder');wo=await db('records').where({id:result.record_id}).first();assert.equal(wo.status,'Reserved');
 await action('operations',wo,'issue_materials');await action('operations',await get('workorders',wo.external_id),'produce');
 let stock=await db('inventory_balances as b').join('records as i','i.id','b.item_id').where({'i.external_id':pack.finished_item}).first('b.physical','b.held');assert.equal(stock.physical,'10000');assert.equal(stock.held,'10000');
 await action('operations',await get('workorders',wo.external_id),'qc_release');result=await action('operations',await get('workorders',wo.external_id),'create_delivery');await action('operations',await db('records').where({id:result.record_id}).first(),'dispatch');
 const balances=await db('inventory_balances as b').join('records as i','i.id','b.item_id').whereIn('i.external_id',[pack.fabric_item,pack.finished_item]).select('b.*');assert.ok(balances.every(b=>b.physical==='0'&&b.held==='0'&&b.reserved==='0'));
 assert.equal((await get('sales',pack.sales)).status,'Delivered');result=await action('finance',await get('sales',pack.sales),'create_invoice');invoice=await db('records').where({id:result.record_id}).first();await action('finance',invoice,'post_invoice');
 assert.equal((await db('obligations').where({document_id:invoice.id}).first()).principal_minor,'450000000');
});
test('Finance imports attendance/payroll, Admin approves, and three allocated payments reconcile the complete uploaded flow',async()=>{
 customerPayment=await create('finance','payments',{external_id:'RCT-BA26-001',kind:'CUSTOMER',target_id:invoice.external_id,date:today(),amount:'2000000',reference:'BA26-CUSTOMER-RECEIPT-001'});await action('finance',customerPayment,'post_payment');
 const supplier=await create('finance','payments',{external_id:'PAY-BA26-SUP-001',kind:'SUPPLIER',target_id:bill.external_id,date:today(),amount:'400000',reference:'BA26-SUPPLIER-PAYMENT-001'});await action('finance',supplier,'post_payment');
 await upload('09-attendance.csv','finance');await upload('10-payroll.csv','finance');await action('finance',await get('attendance','ATT-BA26-001'),'review_attendance');payroll=await get('payroll','PAY-BA26-001');await action('finance',payroll,'review_payroll');await approve('finance',await get('payroll',payroll.external_id));
 const obligation=await db('obligations').where({document_id:payroll.id}).first(),salary=await create('finance','payments',{external_id:'PAY-BA26-SAL-001',kind:'SALARY',target_id:payroll.external_id,date:finance.calendar(obligation.business_date),amount:'29000',reference:'BA26-SALARY-PAYMENT-001'});const paid=await action('finance',salary,'post_payment');
 assert.equal((await db('records').where({id:paid.payslip_id}).first()).status,'Paid');const snapshot=await role('finance',()=>finance.snapshot(db,scope));assert.equal(snapshot.ar_minor,'250000000');assert.equal(snapshot.ap_minor,'0');assert.equal(snapshot.payroll_pending_minor,'0');assert.equal(snapshot.net_cash_minor,'157100000');
 assert.equal((await db('cash_entries')).length,3);assert.equal((await db('records').where({resource:'journals'})).length,6);
});
test('forty-eight optional inquiries stay Draft and do not manufacture committed orders, revenue, stock or receivables',async()=>{
 const stockBefore=await db('stock_movements').count('* as n').first(),cashBefore=await db('cash_entries').count('* as n').first();await upload('11-sales-pattern-inquiries.csv','operations');
 const result=await role('operations',()=>business.report(db,scope,'sales',{from:'2026-10-01',to:'2026-10-31'}));assert.equal(result.summary.orders,1);assert.equal(result.summary.order_value_minor,'450000000');assert.equal(result.summary.unconfirmed_documents,4);assert.equal(result.previous_summary.orders,0);assert.equal(result.summary.value_change_basis_points,null);
 assert.deepEqual(await db('stock_movements').count('* as n').first(),stockBefore);assert.deepEqual(await db('cash_entries').count('* as n').first(),cashBefore);
 assert.equal((await upload('11-sales-pattern-inquiries.csv','operations')).skipped,48);
});
test('sales analysis joins actual buyer orders, equal-length periods, repeated buyers and histogram evidence with exact totals',async()=>{
 for(const external of manifest.quick_analysis.confirm_patterns){const order=await get('sales',external);await action('operations',order,'make_quote');await action('operations',await get('sales',external),'confirm_order');}
 const data=await role('operations',()=>business.report(db,scope,'sales',{from:'2026-10-01',to:'2026-10-31',size:2}));
 assert.equal(data.summary.orders,5);assert.equal(data.summary.order_value_minor,'764250000');assert.equal(data.previous_summary.orders,4);assert.equal(data.previous_summary.order_value_minor,'392000000');assert.equal(data.previous.from,'2026-08-31');assert.equal(data.previous.to,'2026-09-30');
 assert.equal(data.summary.repeat_buyers,1);assert.equal(data.summary.buyers,3);assert.equal(data.summary.inactive_buyers,2);assert.equal(data.summary.average_order_minor,'152850000');assert.equal(data.summary.median_order_minor,'57000000');assert.equal(data.summary.p90_order_minor,'450000000');
 assert.equal(data.histogram.reduce((n,r)=>n+r.count,0),5);assert.equal(data.pareto.at(-1).cumulative_basis_points,10000);assert.equal(data.buyer_rows.length,2);assert.equal(data.buyer_meta.total,5);
 assert.equal(data.buyer_rows[0].buyer_code,'CUS-BA26-001');assert.equal(data.export_buyers.find(r=>r.buyer_code==='CUS-BA26-002').state,'Declining');
 const narrowed=await business.report(db,scope,'sales',{from:'2026-10-01',to:'2026-10-31',state:'Inactive'});assert.equal(narrowed.buyer_rows.length,2);assert.equal(narrowed.summary.orders,5);
 const band=await business.report(db,scope,'sales',{from:'2026-10-01',to:'2026-10-31',band:6});assert.equal(band.order_meta.total,1);assert.equal(band.order_rows[0].external_id,pack.sales);
 const csv=business.exportReport(data);assert.ok(csv.includes('Buyer follow-up')&&csv.includes('Buyer month pattern'));assert.ok(csv.includes('764250000'));assert.ok(!csv.includes('Training Operator')&&!csv.includes('net_minor'));
});
test('buyer/date/search filters and invalid inputs preserve namespace boundaries and honest empty metrics',async()=>{
 const single=await business.report(db,scope,'sales',{from:'2026-10-01',to:'2026-10-31',buyer:'CUS-BA26-002'});assert.equal(single.summary.orders,1);assert.equal(single.summary.order_value_minor,'40000000');assert.equal(single.buyer_rows.length,1);
 const empty=await business.report(db,scope,'sales',{from:'2020-01-01',to:'2020-01-31'});assert.equal(empty.summary.orders,0);assert.equal(empty.summary.median_order_minor,null);assert.equal(empty.summary.repeat_buyer_basis_points,null);assert.equal(empty.histogram.every(r=>r.count===0),true);
 await assert.rejects(business.report(db,scope,'sales',{from:'2025-01-01',to:'2026-10-31'}),e=>e.status===413);await assert.rejects(business.report(db,scope,'sales',{from:'2026-11-01',to:'2026-10-31'}),e=>e.status===400);
 await assert.rejects(business.report(db,{...scope,dataset_id:NW},'sales',{}),e=>e.status===400);await assert.rejects(business.report(db,scope,'sales',{buyer:'CUS-NOT-IN-SCOPE'}),e=>e.status===404);
 const wrongScope=await business.report(db,{...scope,company_id:randomUUID()},'sales',{from:'2026-10-01',to:'2026-10-31'});assert.equal(wrongScope.summary.orders,0);
});
test('collection priority uses actual remaining balances, correct due-day boundaries, role denial and evidence pagination',async()=>{
 await role('operations',()=>assert.rejects(business.report(db,scope,'collections',{}),e=>e.status===403));
 const row=await db('obligations').where({document_id:invoice.id}).first(),due=finance.calendar(row.due_date);
 const now=await role('finance',()=>business.report(db,scope,'collections',{to:today(),buyer:'CUS-BA26-001',size:1}));assert.equal(now.summary.outstanding_minor,'250000000');assert.equal(now.summary.overdue_minor,'0');assert.equal(now.queue[0].paid_minor,'200000000');assert.equal(now.queue[0].external_id,invoice.external_id);
 const onDue=await business.report(db,scope,'collections',{to:due,segment:'due_soon'});assert.equal(onDue.summary.overdue_minor,'0');assert.equal(onDue.summary.due_soon_minor,'250000000');assert.equal(onDue.queue[0].days_to_due,0);
 const late=await business.report(db,scope,'collections',{to:business.addDays(due,31),segment:'overdue'});assert.equal(late.summary.overdue_minor,'250000000');assert.equal(late.aging[2].amount_minor,'250000000');assert.equal(late.scatter[0].days_overdue,31);
 const before=await business.report(db,scope,'collections',{to:business.addDays(finance.calendar(row.business_date),-1)});assert.equal(before.summary.invoices,0);
 const search=await business.report(db,scope,'collections',{search:'no-such-buyer-or-invoice'});assert.equal(search.meta.total,0);assert.equal(search.summary.outstanding_minor,'0');assert.ok(business.exportReport(late).includes('2500000.00'));
 const otherBuyer=await business.report(db,scope,'collections',{buyer:'CUS-BA26-002'});assert.equal(otherBuyer.summary.invoices,0);
});
test('reports are read-only and immutable reversal allocations reopen the correct customer balance',async()=>{
 const before=JSON.stringify(await db('posting_events').select('id','result').orderBy('id'));
 await business.report(db,scope,'sales',{from:'2026-10-01',to:'2026-10-31'});await role('finance',()=>business.report(db,scope,'collections',{}));
 assert.equal(JSON.stringify(await db('posting_events').select('id','result').orderBy('id')),before);
 await role('finance',()=>finance.reversePayment(db,scope,customerPayment.id,{date:today(),reason:'Synthetic correction to verify collection balances'}));
 const reopened=await business.report(db,scope,'collections',{buyer:'CUS-BA26-001'});assert.equal(reopened.summary.outstanding_minor,'450000000');assert.equal(reopened.queue[0].paid_minor,'0');
 const correction=await create('finance','payments',{external_id:'RCT-BA26-CORRECTED',kind:'CUSTOMER',target_id:invoice.external_id,date:today(),amount:'2000000',reference:'BA26-CUSTOMER-CORRECTED'});await action('finance',correction,'post_payment');
 assert.equal((await business.report(db,scope,'collections',{buyer:'CUS-BA26-001'})).summary.outstanding_minor,'250000000');
});
test('distribution boundaries, zero order value and spreadsheet-safe CSV remain mathematically honest',async()=>{
 await create('operations','customers',{external_id:'CUS-BA-BOUNDARY',name:'=Unsafe buyer export',country:'BD'});
 for(const [index,rate]of ['0','50000','100000'].entries()){
  const r=await create('operations','sales',{external_id:'SO-BA-BOUNDARY-'+index,line_id:'1',date:'2026-02-0'+(index+1),item_id:pack.finished_item,quantity:'1',rate,customer_id:'CUS-BA-BOUNDARY'});
  await action('operations',r,'make_quote');await action('operations',await get('sales',r.external_id),'confirm_order');
 }
 const data=await business.report(db,scope,'sales',{from:'2026-02-01',to:'2026-02-28',buyer:'CUS-BA-BOUNDARY'});assert.deepEqual(data.histogram.slice(0,3).map(r=>r.count),[1,1,1]);assert.equal(data.summary.median_order_minor,'5000000');assert.equal(data.summary.p90_order_minor,'10000000');
 const zero=await business.report(db,scope,'sales',{from:'2026-02-01',to:'2026-02-01',buyer:'CUS-BA-BOUNDARY'});assert.equal(zero.summary.orders,1);assert.equal(zero.summary.average_order_minor,'0');assert.equal(zero.buyer_rows[0].share_basis_points,null);assert.ok(zero.findings.some(r=>r.title==='Confirmed value is zero'));
 const csv=business.exportReport(data),parsed=require('papaparse').parse(csv,{header:true});assert.ok(parsed.data.find(r=>r.section==='Buyer follow-up').name.startsWith("'="));
});
test('CSV source integrity and saved business postings reconcile after the complete uploaded role workflow',async()=>{
 for(const entry of manifest.files){const bytes=fs.readFileSync('data/business-pack/'+entry.file);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);}
 await db.destroy();try{const {stdout}=await run(process.execPath,['scripts/check-integrity.cjs'],{env});const result=JSON.parse(stdout.trim());assert.equal(result.reconciled,true);}finally{db=knex({client:'pg',connection:env.DATABASE_URL,pool:{min:0,max:1}});}
});
