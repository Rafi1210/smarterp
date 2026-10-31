import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
const require=createRequire(import.meta.url),run=promisify(execFile),knex=require('knex');
Object.assign(process.env,{APP_ENV:'test',SMARTERP_SKIP_ENV_FILE:'1',AI_ENABLED:'false'});
const {COMPANY,DEMO,NW}=require('../src/lib/registry.js'),{withActor}=require('../src/lib/actor.js'),{today}=require('../src/lib/core.js'),{assertAction}=require('../src/lib/resource-access.js');
const records=require('../src/lib/services/records.js'),workflow=require('../src/lib/services/workflow.js'),reviews=require('../src/lib/services/approvals.js'),finance=require('../src/lib/services/finance.js'),imports=require('../src/lib/services/imports.js'),control=require('../src/lib/services/order-control.js');
const scope={company_id:COMPANY,dataset_id:DEMO};let engine,wire,db,env,actors,order,recipe,sheet,po,wo,delivery,invoice,receipt;
const offset=n=>new Date(Date.parse(today()+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const as=(role,fn)=>withActor(actors[role],fn),get=(resource,external_id)=>db('records').where({...scope,resource,external_id}).first();
async function create(role,resource,row){return as(role,async()=>(await records.createDraft(db,scope,resource,[row],randomUUID())).record);}
async function action(role,r,command,payload={}){return as(role,()=>{assertAction(command,r);return workflow.command(db,scope,r.id,command,payload);});}
async function source(result){return db('records').where({...scope,id:result.record_id}).first();}
async function approve(r,checks={}){const {request}=await as('operations',()=>reviews.submit(db,scope,r.id,{request_key:randomUUID()}));await as('admin',()=>reviews.decide(db,scope,request.id,{decision:'Approved',checks}));}
const report=(role='operations',extra={})=>as(role,()=>control.orderControl(db,scope,{search:'SO-CONTROL-ONE',...extra}));
const one=async(role,extra)=>(await report(role,extra)).rows[0];
before(async()=>{
 engine=await PGlite.create();wire=new PGLiteSocketServer({db:engine,host:'127.0.0.1',port:25460});await wire.start();const url='postgresql://postgres:postgres@127.0.0.1:25460/postgres';
 env={...process.env,DATABASE_URL:url,DATABASE_DIRECT_URL:url,SMARTERP_ADMIN_PASSWORD:'ControlAdminFixture2026',SMARTERP_OPERATIONS_PASSWORD:'ControlOpsFixture2026',SMARTERP_FINANCE_PASSWORD:'ControlFinanceFixture2026'};
 for(const script of ['migrate.cjs','seed-demo.cjs','setup-auth.cjs'])await run(process.execPath,['scripts/'+script],{env});
 db=knex({client:'pg',connection:url,pool:{min:0,max:1}});actors=Object.fromEntries((await db('app_users').select('id','email','role')).map(a=>[a.role,a]));
 order=await create('operations','sales',{external_id:'SO-CONTROL-ONE',line_id:'1',date:offset(-40),item_id:'TSHIRT-001',quantity:'10000',rate:'450',customer_id:'BUYER-001'});
 await create('operations','sales',{external_id:'SO-CONTROL-TWO',line_id:'1',date:offset(-39),item_id:'TSHIRT-001',quantity:'10',rate:'450',customer_id:'BUYER-001'});
 recipe=await create('operations','bom',{external_id:'BOM-CONTROL',name:'Control material recipe',finished_item_id:'TSHIRT-001',component_item_id:'FABRIC-001',kg_per_piece:'0.22'});
});
after(async()=>{await db?.destroy();await wire?.stop();await new Promise(r=>setTimeout(r,100));await engine?.close();});
test('read-only snapshot, namespace and permission boundaries, strict filters and deterministic pagination',async()=>{
 const before=await db('activity_log').count('* as n').first(),data=await report();assert.equal(data.rows[0].next_action,'Create quotation');assert.equal(data.rows[0].owner,'operations');assert.equal(data.financial_visible,false);assert.ok(!JSON.stringify(data).includes('outstanding_minor'));
 assert.equal((await db('activity_log').count('* as n').first()).n,before.n);
 const page=await as('operations',()=>control.orderControl(db,scope,{size:1}));assert.equal(page.meta.total,2);assert.equal(page.meta.pages,2);assert.equal(page.rows.length,1);
 const emptyStage=await as('operations',()=>control.orderControl(db,scope,{stage:'quality'}));assert.equal(emptyStage.meta.total,0);assert.equal(emptyStage.summary.orders,2);assert.equal(emptyStage.stages.find(r=>r.stage==='sales').count,2);
 assert.equal((await report('operations',{search:'%'})).meta.total,0);
 assert.notEqual(page.rows[0].order.id,(await as('operations',()=>control.orderControl(db,scope,{size:1,page:2}))).rows[0].order.id);
 await assert.rejects(control.orderControl(db,{...scope,dataset_id:NW},{}),e=>e.status===400);
 await assert.rejects(report('operations',{size:51}),e=>e.status===400);await assert.rejects(report('operations',{from:offset(1),to:today()}),e=>e.status===400);
 await assert.rejects(report('operations',{buyer:'OTHER-BUYER'}),e=>e.status===404);await assert.rejects(report('operations',{attention:'made-up'}),e=>e.status===400);
 assert.equal((await control.orderControl(db,{...scope,company_id:randomUUID()},{})).meta.total,0);
 await withActor({role:'unknown'},()=>assert.rejects(control.orderControl(db,scope,{}),e=>e.status===403));
});
test('pending independent BOM and merchandising reviews point to the real source and reviewer',async()=>{
 await action('operations',order,'make_quote');assert.equal((await one()).next_action,'Confirm sales order');await action('operations',await get('sales',order.external_id),'confirm_order');
 let row=await one();assert.equal(row.stage,'handover');assert.equal(row.target.id,recipe.id);
 const {request}=await as('operations',()=>reviews.submit(db,scope,recipe.id,{request_key:randomUUID()}));row=await one();assert.equal(row.pending_review,true);assert.equal(row.owner,'admin');assert.equal(row.review.id,request.id);
 await as('admin',()=>reviews.decide(db,scope,request.id,{decision:'Approved'}));assert.equal((await one()).next_action,'Prepare merchandising sheet');
 sheet=await source(await action('operations',await get('sales',order.external_id),'create_merchandising',{style_code:'CONTROL-STYLE',style_name:'Cotton T-shirt',fabric_spec:'180gsm cotton',delivery_date:offset(-1)}));
 await approve(sheet,{specs_confirmed:true,bom_confirmed:true,date_confirmed:true});row=await one();assert.equal(row.delivery_overdue,true);assert.equal(row.stage,'materials');assert.equal(row.material.required,'2200000');
 const late=await report('operations',{attention:'late'});assert.equal(late.meta.total,1);assert.equal(late.summary.orders,1);
});
test('material quantities use current balances and matched bills gate issue while supplier payment does not',async()=>{
 const opening=await create('operations','openings',{external_id:'OPEN-CONTROL',item_id:'FABRIC-001',quantity:'1400',date:today()});await action('operations',opening,'post_opening');await action('operations',await get('sales',order.external_id),'plan_materials');
 let row=await one();assert.equal(row.material.physical,'1400000');assert.equal(row.material.shortage,'800000');assert.equal(row.material.uncovered,'800000');assert.equal(row.next_action,'Create shortage purchase');
 po=await source(await action('operations',await get('sales',order.external_id),'create_purchase',{supplier_id:'SUP-001',rate:'500'}));const pendingPurchase=await as('operations',()=>reviews.submit(db,scope,po.id,{request_key:randomUUID()}));const financeReview=await one('finance',{owner:'finance'});assert.equal(financeReview.target.id,po.id);assert.deepEqual(financeReview.allowed_roles,['admin','finance']);await as('admin',()=>reviews.decide(db,scope,pendingPurchase.request.id,{decision:'Approved'}));row=await one();assert.equal(row.next_action,'Create goods receipt');assert.equal(row.material.incoming,'800000');
 const grn=await source(await action('operations',await get('purchases',po.external_id),'create_receipt'));row=await one();assert.equal(row.target.id,grn.id);assert.equal(row.next_action,'Accept goods receipt');
 await action('operations',grn,'accept_receipt');row=await one();assert.equal(row.next_action,'Create supplier bill');assert.equal(row.material.shortage,'0');
 const bill=await source(await action('operations',await get('purchases',po.external_id),'create_supplier_bill'));assert.equal((await one()).next_action,'Match supplier bill');await action('operations',bill,'match_supplier_bill');
 assert.equal((await one()).next_action,'Create and reserve work order');assert.equal((await db('cash_entries')).length,0);
 wo=await source(await action('operations',await get('sales',order.external_id),'create_workorder'));row=await one();assert.equal(row.target.id,wo.id);assert.equal(row.material.own_reserved,'2200000');assert.equal(row.material.available,'2200000');assert.equal(row.next_action,'Issue reserved fabric');
 await action('operations',wo,'issue_materials');row=await one();assert.equal(row.stage,'production');assert.equal(row.material.physical,'0');assert.equal(row.next_action,'Record full production');assert.equal((await db('cash_entries')).length,0);
});
test('produced goods stay quality held and an existing delivery Draft is reused in the next-action link',async()=>{
 await action('operations',await get('workorders',wo.external_id),'produce');let row=await one();assert.equal(row.stage,'quality');assert.ok(row.flags.includes('quality'));
 await action('operations',await get('workorders',wo.external_id),'qc_hold');assert.equal((await report('operations',{attention:'quality'})).meta.total,1);
 await action('operations',await get('workorders',wo.external_id),'qc_release');assert.equal((await one()).next_action,'Create delivery note');
 delivery=await source(await action('operations',await get('workorders',wo.external_id),'create_delivery'));row=await one();assert.equal(row.next_action,'Dispatch delivery');assert.equal(row.target.id,delivery.id);
 await action('operations',delivery,'dispatch');row=await one();assert.equal(row.stage,'finance');assert.equal(row.delivery_overdue,false);assert.equal(row.target.id,order.id);assert.equal(row.collection,undefined);
 assert.equal((await one('finance')).next_action,'Create customer invoice');
});
test('invoice, allocated receipt, reversal and settlement are reported exactly without leaking Finance to Operations',async()=>{
 invoice=await source(await action('finance',await get('sales',order.external_id),'create_invoice'));
 assert.equal((await one('finance')).next_action,'Post customer invoice');await action('finance',invoice,'post_invoice');assert.equal((await one('finance')).collection.outstanding_minor,'450000000');
 receipt=await create('finance','payments',{external_id:'RCT-CONTROL',kind:'CUSTOMER',target_id:invoice.external_id,amount:'2000000',date:today(),reference:'CONTROL-RECEIPT'});await action('finance',receipt,'post_payment');
 assert.equal((await one('finance')).collection.outstanding_minor,'250000000');const ops=await report();assert.equal(ops.rows[0].collection,undefined);assert.ok(!JSON.stringify(ops).includes(invoice.external_id));assert.ok(!control.exportControl(ops).includes('receivable_outstanding_minor'));
 await as('finance',()=>finance.reversePayment(db,scope,receipt.id,{date:today(),reason:'Control fixture allocation reversal'}));assert.equal((await one('finance')).collection.outstanding_minor,'450000000');
 const replacement=await create('finance','payments',{external_id:'RCT-CONTROL-CORRECTED',kind:'CUSTOMER',target_id:invoice.external_id,amount:'4500000',date:today(),reference:'CONTROL-CORRECTED'});await action('finance',replacement,'post_payment');
 assert.equal((await one('finance')).stage,'complete');assert.equal((await one('finance')).collection.outstanding_minor,'0');assert.equal((await one()).stage,'finance');
});
test('filtered export is spreadsheet-safe and the order cohort limit fails explicitly instead of silently truncating',async()=>{
 const original=await db('records').where({id:order.id}).first();await db('records').where({...scope,resource:'customers',external_id:'BUYER-001'}).update({name:'=Unsafe sheet name'});
 const csv=control.exportControl(await report('finance'));assert.ok(csv.includes("'=Unsafe sheet name"));assert.ok(csv.includes('receivable_outstanding_minor'));
 const rows=Array.from({length:1001},(_,i)=>({...original,id:randomUUID(),external_id:'SO-LIMIT-'+i,name:'Limit fixture '+i,status:'Draft',data:JSON.stringify(original.data)}));
 for(let i=0;i<rows.length;i+=100)await db('records').insert(rows.slice(i,i+100));
 await assert.rejects(report('operations',{search:'SO-LIMIT-'}),e=>e.status===413);assert.equal((await report('operations',{search:'SO-LIMIT-1000'})).meta.total,1);
});
test('import mapping rejects non-object input and issue filters inspect the entire saved batch',async()=>{
 const cfg=require('../src/lib/registry.js').getResource('customers',DEMO);
 for(const bad of [[],['external_id'],{name:42},'not-a-map'])assert.throws(()=>imports.mappingFor(cfg,['external_id','name'],bad),e=>e.status===400);
 const lines=['external_id,name,country',...Array.from({length:60},(_,i)=>`CUS-ISSUE-${i},${i===59?'':'Safe Buyer '+i},BD`)];
 const batch=await as('operations',()=>imports.preview(db,scope,{resource:'customers',buffer:Buffer.from(lines.join('\n')),filename:'issues.csv'}));assert.equal(batch.error_count,1);assert.equal(batch.documents.length,50);
 const issues=await as('operations',()=>imports.getBatch(db,scope,batch.id,1,'error'));assert.equal(issues.matching_documents,1);assert.equal(issues.documents[0].external_id,'CUS-ISSUE-59');assert.equal(issues.documents[0].rows[0].__row,61);
 await as('operations',()=>assert.rejects(imports.commit(db,scope,batch.id),e=>e.status===409));assert.equal(Number((await db('records').where({...scope,resource:'customers'}).whereLike('external_id','CUS-ISSUE-%').count('* as n').first()).n),0);
 assert.equal((await as('operations',()=>imports.history(db,scope,1,'items'))).total,0);assert.equal((await as('operations',()=>imports.history(db,scope,1,'customers'))).total,1);
 await as('operations',()=>assert.rejects(imports.history(db,scope,1,'employees'),e=>e.status===403));
 await assert.rejects(imports.getBatch(db,scope,batch.id,1,'unsupported'),e=>e.status===400);
});
