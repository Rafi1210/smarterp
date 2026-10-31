const {actorLabel,currentUser}=require('../actor.js');
const {randomUUID}=require('node:crypto');
const {fail,exact,date,today,stableHash}=require('../core.js');
const {DEMO,normalize}=require('../registry.js');
const {insertRecord,canonical}=require('./records.js');
const {activity,linked,change,find,create}=require('./workflow.js');

const {nextCode}=require('./naming.js');

const ACTIONS=['create_invoice','post_invoice','post_supplier_bill','post_payment','review_attendance','create_payroll','review_payroll','approve_payroll'];
const calendar=value=>typeof value==='string'?value.slice(0,10):`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
const decimal=value=>{const n=BigInt(value);return `${n<0n?'-':''}${(n<0n?-n:n)/100n}.${((n<0n?-n:n)%100n).toString().padStart(2,'0')}`;};
function afterDays(value,days){const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
async function journal(trx,scope,eventID,source,kind,amount,debit,credit,business_date){
 fail(amount>0n&&debit!==credit,'A selected-event journal needs equal positive debit and credit amounts.');
 const row=(await insertRecord(trx,scope,'journals',{external_id:await nextCode(trx,scope,'JRN',business_date),name:`${kind} · ${source.external_id}`,status:'Posted',business_date,data:{kind,source_id:source.external_id,currency:'BDT',debit_minor:String(amount),credit_minor:String(amount),scope_note:'Selected events only; not a complete statutory general ledger or profit statement.'},lines:[],refs:[{id:source.id,relation:'source'}]})).record;
 await trx('finance_journal_lines').insert([{...scope,journal_id:row.id,line_no:1,account:debit,debit_minor:String(amount),credit_minor:'0'},{...scope,journal_id:row.id,line_no:2,account:credit,debit_minor:'0',credit_minor:String(amount)}]);
 return row;
}
async function addObligation(trx,scope,{document,kind,counterparty,source,source_key,amount,business_date,due_date}){
 fail(amount>0n,'Posted amount must be positive.');
 const previous=await trx('obligations').where({...scope,kind,source_key}).first();
 fail(!previous,'This source has already been posted. A second invoice or approved payroll would duplicate the obligation.',409);
 await trx('obligations').insert({...scope,document_id:document.id,kind,counterparty_id:counterparty.id,source_id:source.id,source_key,principal_minor:String(amount),allocated_minor:'0',business_date,due_date});
 await linked(trx,scope,document.id,counterparty.id,'counterparty');
}
async function attendanceFor(trx,scope,payroll,externalID){
 const id=externalID||payroll.data.attendance_id;
 fail(id,'Link a reviewed attendance summary before reviewing payroll.',409);
 const a=await find(trx,scope,'attendance',id);
 fail(a.status==='Reviewed'&&a.data.employee_id===payroll.data.employee_id&&a.data.period===payroll.data.period,'Payroll must use reviewed attendance for the same employee and period.',409);
 fail(Number(payroll.data.attendance_days)===Number(a.data.present_days)+Number(a.data.paid_leave_days),'Payroll attendance days must equal reviewed present plus paid-leave days. Fixed salary components are reviewed separately.',409);
 return a;
}
async function preparePeople(db,scope){
 fail(scope.dataset_id===DEMO,'People demo records belong only to the operational namespace.');
 return db.transaction(async trx=>{
  const company=await trx('companies').where({id:scope.company_id}).forUpdate().first();fail(company,'Initialize demo master records first.',409);
  const attendance=await create(trx,scope,'attendance',{external_id:'ATT-DEMO-001',employee_id:'EMP-001',period:'2026-10',scheduled_days:'26',present_days:'26',paid_leave_days:'0'});
  const payroll=await create(trx,scope,'payroll',{external_id:'PAYROLL-DEMO-001',employee_id:'EMP-001',period:'2026-10',basic:'25000',allowance:'4000',extra:'1000',deduction:'1000',attendance_days:'26',attendance_id:attendance.external_id});
  return {attendance_id:attendance.id,payroll_id:payroll.id,message:'Attendance and payroll drafts prepared. Net pay BDT 29,000; no salary approval or cash posting.'};
 });
}
async function commandFinance(db,scope,id,action,body={},options={}){
 fail(scope.dataset_id===DEMO,'Historical datasets cannot post finance or payroll events.',403);
 fail(ACTIONS.includes(action),'Unknown finance command.');
 return db.transaction(async trx=>{
  const company=await trx('companies').where({id:scope.company_id}).forUpdate().first();fail(company,'Company is not initialized.',409);
  const r=await trx('records').where({...scope,id}).forUpdate().first();fail(r,'Document not found in this scope.',404);
  const request_hash=stableHash(canonical(body)),source_event=`${id}:${action}`;
  const prior=await trx('posting_events').where({...scope,source_event,kind:action}).first();
  if(prior){fail(prior.result.request_hash===request_hash,'This source event already used different inputs.',409);return {...prior.result,replayed:true};}
  await require('./review-gate.js').reviewGate(trx,scope,r,action,options);
  const eventID=randomUUID();await trx('posting_events').insert({id:eventID,...scope,source_event,kind:action,result:{request_hash}});
  const expect=(resource,states)=>fail(r.resource===resource&&[].concat(states).includes(r.status),`Action '${action}' is unavailable for ${r.resource} in ${r.status}.`,409);
  let result={record_id:r.id};
  if(action==='create_invoice'){
   fail((r.resource==='sales'&&r.status==='Delivered')||(r.resource==='deliveries'&&r.status==='Dispatched'),'Create an invoice only from a fully dispatched Sales Order or delivery.',409);
   const so=r.resource==='sales'?r:await find(trx,scope,'sales',r.data.source_sales_id);
   fail(so.data.delivery_id&&so.status==='Delivered','Sales Order requires a posted delivery.',409);
   const delivery=await trx('records').where({...scope,id:so.data.delivery_id,resource:'deliveries',status:'Dispatched'}).first();fail(delivery,'Delivered source is not available in this scope.',409);
   const existing=await trx('records').where({...scope,resource:'invoices'}).whereRaw("data->>'kind'='SALES' AND data->>'source_id'=?",[so.external_id]).orderBy('created_at').first();
   const bill=existing||await create(trx,scope,'invoices',{external_id:await nextCode(trx,scope,'INV'),kind:'SALES',source_id:so.external_id,date:today(),due_date:afterDays(today(),30)});
   await linked(trx,scope,bill.id,delivery.id,'delivery');await change(trx,scope,so,so.status,{invoice_id:bill.id},action,'Customer invoice Draft created from full delivery; no receivable or cash yet.');result.record_id=bill.id;
  }
  if(action==='post_invoice'){
   expect('invoices','Draft');fail(r.data.kind==='SALES','This command posts customer invoices.');
   const so=await find(trx,scope,'sales',r.data.source_id);
   fail(so.status==='Delivered'&&so.data.delivery_id,'Invoice posting requires a dispatched Sales Order.',409);
   const delivery=await trx('records').where({...scope,id:so.data.delivery_id,resource:'deliveries',status:'Dispatched'}).first();fail(delivery,'A valid posted delivery is required.',409);
   const business_date=calendar(r.business_date);fail(business_date>=calendar(delivery.business_date),'Invoice cannot predate the delivery.',409);
   const customer=await find(trx,scope,'customers',so.data.customer_id),amount=BigInt(so.data.total_minor);
   if(r.data.declared_amount_minor)fail(BigInt(r.data.declared_amount_minor)===amount,'Declared invoice total must match the delivered order.',409);
   await addObligation(trx,scope,{document:r,kind:'AR',counterparty:customer,source:so,source_key:so.id,amount,business_date,due_date:r.data.due_date});
   await linked(trx,scope,r.id,delivery.id,'delivery');await journal(trx,scope,eventID,r,'SALES_INVOICE',amount,'AR','InvoicedSales',business_date);
   await change(trx,scope,r,'Posted',{amount_minor:String(amount),customer_id:customer.external_id,currency:'BDT'},action,'Customer invoice posted to receivables; cash remains unchanged.');
  }
  if(action==='post_supplier_bill'){
   expect('invoices','Matched');fail(r.data.kind==='PURCHASE','This command posts matched supplier bills.');
   const po=await find(trx,scope,'purchases',r.data.source_id);
   const receipt=po.data.receipt_id?await trx('records').where({...scope,id:po.data.receipt_id,resource:'receipts',status:'Accepted'}).first():null;
   fail(po.status==='Received'&&receipt,'Matched bill requires its accepted goods receipt.',409);
   const amount=BigInt(po.data.total_minor);fail(BigInt(r.data.amount_minor||0)===amount&&BigInt(r.data.declared_amount_minor||0)===amount,'Supplier bill amount no longer matches the received PO.',409);
   const business_date=calendar(r.business_date);fail(business_date>=calendar(receipt.business_date),'Supplier bill cannot predate its accepted receipt.',409);
   const supplier=await find(trx,scope,'suppliers',po.data.supplier_id);
   await addObligation(trx,scope,{document:r,kind:'AP',counterparty:supplier,source:po,source_key:po.id,amount,business_date,due_date:r.data.due_date});
   await journal(trx,scope,eventID,r,'SUPPLIER_BILL',amount,'SupplierPurchases','AP',business_date);
   await change(trx,scope,r,'Posted',{supplier_id:supplier.external_id,currency:'BDT'},action,'Matched supplier bill posted to payables; no cash paid.');
  }
  if(action==='review_attendance'){
   expect('attendance','Draft');const employee=await find(trx,scope,'employees',r.data.employee_id);fail(employee.status==='Active','Attendance requires an active employee.',409);
   await change(trx,scope,r,'Reviewed',{reviewed_at:new Date().toISOString()},action,'Scheduled, present, paid-leave and absent days reviewed.');
  }
  if(action==='create_payroll'){
   expect('attendance','Reviewed');
   const payroll=await create(trx,scope,'payroll',{external_id:await nextCode(trx,scope,'PAY'),employee_id:r.data.employee_id,period:r.data.period,basic:String(body.basic||''),allowance:String(body.allowance||'0'),extra:String(body.extra||'0'),deduction:String(body.deduction||'0'),attendance_days:String(Number(r.data.present_days)+Number(r.data.paid_leave_days)),attendance_id:r.external_id});
   await activity(trx,scope,r.id,action,'Fixed-component payroll Draft created from reviewed attendance.');result.record_id=payroll.id;
  }
  if(action==='review_payroll'){
   expect('payroll','Draft');const a=await attendanceFor(trx,scope,r,body.attendance_id);fail(BigInt(r.data.net_minor)>0n,'Net pay must be positive before review.',409);
   await linked(trx,scope,r.id,a.id,'attendance');
   await change(trx,scope,r,'Reviewed',{attendance_id:a.external_id,reviewed_at:new Date().toISOString(),component_note:'Fixed, reviewed salary components; no statutory tax or automatic overtime calculation.'},action,'Attendance link and fixed basic/allowance/extra/deduction components reviewed.');
  }
  if(action==='approve_payroll'){
   expect('payroll','Reviewed');await attendanceFor(trx,scope,r);
   const employee=await find(trx,scope,'employees',r.data.employee_id);fail(employee.status==='Active','Payroll requires an active employee.',409);
   const amount=BigInt(r.data.net_minor),business_date=today();
   await addObligation(trx,scope,{document:r,kind:'PAYROLL',counterparty:employee,source:r,source_key:`${employee.id}:${r.data.period}`,amount,business_date,due_date:business_date});
   await journal(trx,scope,eventID,r,'PAYROLL_APPROVAL',amount,'PayrollExpense','PayrollPayable',business_date);
   await change(trx,scope,r,'Approved',{approved_date:business_date},action,'Reviewed payroll approved once per employee/period. No salary cash payment yet.');
  }
  if(action==='post_payment'){
   expect('payments','Draft');const target=await find(trx,scope,r.data.kind==='SALARY'?'payroll':'invoices',r.data.target_id);
   const obligation=await trx('obligations').where({...scope,document_id:target.id}).forUpdate().first();
   fail(obligation,'Post the invoice/bill or approve payroll before paying.',409);
   const expectedKind={CUSTOMER:'AR',SUPPLIER:'AP',SALARY:'PAYROLL'}[r.data.kind];fail(obligation.kind===expectedKind,'Payment type does not match the obligation.',409);
   const amount=BigInt(r.data.amount_minor),remaining=BigInt(obligation.principal_minor)-BigInt(obligation.allocated_minor);
   fail(amount>0n&&amount<=remaining,'Payment exceeds the unpaid balance or the target is already paid.',409);
   if(r.data.kind==='SALARY')fail(amount===remaining&&remaining===BigInt(obligation.principal_minor),'Salary payment must settle the full approved net pay once.',409);
   const business_date=calendar(r.business_date);fail(business_date>=calendar(obligation.business_date),'Payment cannot predate the posted obligation.',409);
   const reference=r.data.reference||null;
   if(reference)fail(!await trx('cash_entries').where({...scope,kind:r.data.kind,reference}).first(),'This cash/bank reference has already been posted for this payment type.',409);
   const direction=r.data.kind==='CUSTOMER'?'IN':'OUT';
   const entry=(await insertRecord(trx,scope,'cashbook',{external_id:await nextCode(trx,scope,'CSH',business_date),name:`${r.data.kind} · ${r.external_id}`,status:'Posted',business_date,data:{kind:r.data.kind,direction,amount_minor:String(amount),payment_id:r.external_id,target_id:target.external_id,reference,currency:'BDT'},lines:[],refs:[{id:r.id,relation:'payment'},{id:target.id,relation:'allocation'},{id:obligation.counterparty_id,relation:'counterparty'}]})).record;
   await trx('cash_entries').insert({id:entry.id,...scope,payment_id:r.id,event_id:eventID,kind:r.data.kind,direction,reference,amount_minor:String(amount),business_date});
   await trx('payment_allocations').insert({...scope,payment_id:r.id,target_id:target.id,cash_id:entry.id,amount_minor:String(amount)});
   const allocated=BigInt(obligation.allocated_minor)+amount;
   await trx('obligations').where({...scope,document_id:target.id}).update({allocated_minor:String(allocated)});
   await journal(trx,scope,eventID,r,`${r.data.kind}_PAYMENT`,amount,r.data.kind==='CUSTOMER'?'Cash':r.data.kind==='SUPPLIER'?'AP':'PayrollPayable',r.data.kind==='CUSTOMER'?'AR':'Cash',business_date);
   await change(trx,scope,r,'Posted',{cash_entry_id:entry.id,allocated_to:target.external_id},action,'Payment posted and fully allocated to one target document.');
   await change(trx,scope,target,allocated===BigInt(obligation.principal_minor)?'Paid':'PartPaid',{},action,`Allocated payment ${r.external_id}; remaining BDT ${decimal(BigInt(obligation.principal_minor)-allocated)}.`);
   if(r.data.kind==='SALARY'){
    const employee=await trx('records').where({...scope,id:obligation.counterparty_id}).first();
    const slip=(await insertRecord(trx,scope,'payslips',{external_id:await nextCode(trx,scope,'PSL',business_date),name:`${target.data.period} · ${employee.name}`,status:'Paid',business_date,data:{employee_id:employee.external_id,employee_name:employee.name,department:employee.data.department,period:target.data.period,attendance_days:target.data.attendance_days,basic_minor:target.data.basic_minor,allowance_minor:target.data.allowance_minor,extra_minor:target.data.extra_minor,deduction_minor:target.data.deduction_minor,net_minor:target.data.net_minor,payment_id:r.external_id,paid_date:business_date,currency:'BDT',note:'Fixed-component payslip; not statutory payroll.'},lines:[],refs:[{id:target.id,relation:'payroll'},{id:r.id,relation:'payment'},{id:employee.id,relation:'employee'}]})).record;
    await activity(trx,scope,target.id,'PAID_PAYSLIP',`Paid payslip ${slip.external_id} generated.`);result.payslip_id=slip.id;
   }
   result.cash_entry_id=entry.id;
  }
  const target=await trx('records').where({...scope,id:result.record_id}).select('id','resource','external_id','status').first();
  result={...result,record:target,request_hash};await trx('posting_events').where({id:eventID}).update({result:JSON.stringify(result)});return result;
 });
}
async function reversePayment(db,scope,id,body={}){
 fail(scope.dataset_id===DEMO,'Historical datasets cannot reverse payments.',403);
 return db.transaction(async trx=>{
  const company=await trx('companies').where({id:scope.company_id}).forUpdate().first();fail(company,'Company is not initialized.',409);
  const payment=await trx('records').where({...scope,id,resource:'payments'}).forUpdate().first();fail(payment,'Payment not found in this scope.',404);
  require('../resource-access.js').assertRead('payments');require('../resource-access.js').assertAction('reverse_payment',payment);
  const reason=String(body.reason||'').trim();fail(reason.length>=6&&reason.length<=500,'Give a reason using 6–500 characters.');
  const business_date=date(body.date||today(),'Reversal date'),source_event=id+':reverse_payment',request_hash=stableHash({reason,date:body.date||null});
  fail(business_date<=today(),'Reversal date cannot be in the future.',409);
  const prior=await trx('posting_events').where({...scope,source_event,kind:'reverse_payment'}).first();
  if(prior){fail(prior.result.request_hash===request_hash,'This payment was already reversed with different inputs.',409);return {...prior.result,replayed:true};}
  fail(payment.status==='Posted','Only a posted, unreversed payment can be reversed.',409);
  const original=await trx('cash_entries').where({...scope,payment_id:id}).first();fail(original,'Original posted cash entry is missing.',409);
  fail(business_date>=calendar(original.business_date),'Reversal cannot predate the original payment.',409);
  const target=await trx('records').where({...scope,external_id:payment.data.target_id,resource:payment.data.kind==='SALARY'?'payroll':'invoices'}).forUpdate().first();fail(target,'Allocated target is missing.',409);
  const obligation=await trx('obligations').where({...scope,document_id:target.id}).forUpdate().first();
  const allocation=await trx('payment_allocations').where({...scope,payment_id:id,target_id:target.id}).first();
  fail(obligation&&allocation&&BigInt(allocation.amount_minor)===BigInt(original.amount_minor),'Original allocation does not reconcile.',409);
  const amount=BigInt(original.amount_minor),allocated=BigInt(obligation.allocated_minor)-amount;fail(allocated>=0n,'Reversal would make the allocated balance negative.',409);
  const eventID=randomUUID();await trx('posting_events').insert({id:eventID,...scope,source_event,kind:'reverse_payment',result:{request_hash}});
  const direction=original.direction==='IN'?'OUT':'IN';
  const voucher=(await insertRecord(trx,scope,'cashbook',{external_id:await nextCode(trx,scope,'REV',business_date),name:'Reversal · '+payment.external_id,status:'Posted',business_date,data:{kind:payment.data.kind,direction,amount_minor:String(amount),payment_id:payment.external_id,target_id:target.external_id,reverses_payment_id:payment.id,reverses_payment_code:payment.external_id,reversal:true,reason,currency:'BDT'},lines:[],refs:[{id:payment.id,relation:'reversal'},{id:target.id,relation:'allocation'},{id:obligation.counterparty_id,relation:'counterparty'}]})).record;
  const debit=payment.data.kind==='CUSTOMER'?'AR':'Cash',credit=payment.data.kind==='CUSTOMER'?'Cash':payment.data.kind==='SUPPLIER'?'AP':'PayrollPayable';
  const reversedJournal=await journal(trx,scope,eventID,payment,payment.data.kind+'_PAYMENT_REVERSAL',amount,debit,credit,business_date);
  await linked(trx,scope,voucher.id,reversedJournal.id,'journal');
  await trx('payment_reversals').insert({id:randomUUID(),...scope,payment_id:id,target_id:target.id,original_cash_id:original.id,cash_record_id:voucher.id,journal_id:reversedJournal.id,event_id:eventID,amount_minor:String(amount),business_date,reason});
  await trx('obligations').where({...scope,document_id:target.id}).update({allocated_minor:String(allocated)});
  const status=allocated===0n?(payment.data.kind==='SALARY'?'Approved':'Posted'):'PartPaid';
  await change(trx,scope,target,status,{},'PAYMENT_REVERSED','Payment '+payment.external_id+' reversed by '+voucher.external_id+'. '+reason);
  await change(trx,scope,payment,'Reversed',{reversal_voucher_id:voucher.id,reversal_voucher:voucher.external_id,reversal_date:business_date,reversal_reason:reason},'PAYMENT_REVERSED',reason+' Original cash, allocations and journal remain immutable.');
  if(payment.data.kind==='SALARY'){
   const slips=await trx('records').where({...scope,resource:'payslips',status:'Paid'}).whereRaw("data->>'payment_id' = ?",[payment.external_id]);
   for(const slip of slips)await change(trx,scope,slip,'Reversed',{reversal_voucher:voucher.external_id,reversal_date:business_date,reversal_reason:reason},'PAYMENT_REVERSED','Paid payslip reversed with its salary payment. '+reason);
  }
  const result={record_id:id,voucher_id:voucher.id,voucher_code:voucher.external_id,journal_id:reversedJournal.id,business_date,request_hash};
  await trx('posting_events').where({id:eventID}).update({result:JSON.stringify(result)});return result;
 });
}
function cashMovements(db,scope){
 const original=db('cash_entries').where(scope).select('id','payment_id','kind','direction','reference','amount_minor','business_date','created_at',db.raw('false as reversal'));
 const reversed=db('payment_reversals as r').join('cash_entries as c','c.id','r.original_cash_id').where({'r.company_id':scope.company_id,'r.dataset_id':scope.dataset_id}).select('r.cash_record_id as id','r.payment_id','c.kind',db.raw("CASE WHEN c.direction='IN' THEN 'OUT' ELSE 'IN' END as direction"),db.raw('NULL::text as reference'),'r.amount_minor','r.business_date','r.created_at',db.raw('true as reversal'));
 return db.unionAll([original,reversed],true);
}
function range(filters={}){const to=date(filters.to||today(),'As-of date');const from=filters.from?date(filters.from,'From date'):null;fail(!from||from<=to,'Date range is reversed.');return {from,to};}
function outstandingRows(db,scope,to){
 const original=db('payment_allocations as a').join('cash_entries as c','c.id','a.cash_id').where({'a.company_id':scope.company_id,'a.dataset_id':scope.dataset_id}).where('c.business_date','<=',to).select('a.target_id','a.amount_minor');
 const reversed=db('payment_reversals').where(scope).where('business_date','<=',to).select('target_id',db.raw('-amount_minor as amount_minor'));
 const paid=db.from(db.unionAll([original,reversed],true).as('settlements')).select('target_id').sum({paid:'amount_minor'}).groupBy('target_id');
 return db('obligations as o').join('records as d','d.id','o.document_id').join('records as p','p.id','o.counterparty_id').leftJoin(paid.as('settled'),'settled.target_id','o.document_id').where({'o.company_id':scope.company_id,'o.dataset_id':scope.dataset_id}).where('o.business_date','<=',to).select('o.*','d.external_id','d.resource','p.name as counterparty',db.raw('(o.principal_minor-COALESCE(settled.paid,0))::text AS outstanding_minor')).orderBy('o.due_date').limit(10001);
}
async function snapshot(db,scope,filters={}){
 fail(scope.dataset_id===DEMO,'Operational Finance reports use the synthetic namespace only.');const {from,to}=range(filters);
 const rows=await outstandingRows(db,scope,to);fail(rows.length<=10000,'Narrow the report; at most 10,000 obligations can be summarized synchronously.',413);
 const totals={ar_minor:0n,ap_minor:0n,payroll_pending_minor:0n,overdue_ar_minor:0n,invoiced_sales_minor:0n};
 const obligations=rows.map(r=>{const outstanding=BigInt(r.outstanding_minor),principal=BigInt(r.principal_minor);const due=calendar(r.due_date),issued=calendar(r.business_date);totals[{AR:'ar_minor',AP:'ap_minor',PAYROLL:'payroll_pending_minor'}[r.kind]]+=outstanding;if(r.kind==='AR'&&due<to)totals.overdue_ar_minor+=outstanding;if(r.kind==='AR'&&(!from||issued>=from))totals.invoiced_sales_minor+=principal;return {id:r.document_id,external_id:r.external_id,resource:r.resource,kind:r.kind,counterparty:r.counterparty,principal_minor:String(principal),paid_minor:String(principal-outstanding),outstanding_minor:String(outstanding),business_date:issued,due_date:due,status:outstanding===0n?'Paid':outstanding===principal?'Open':'PartPaid'};});
 let cash=db.from(cashMovements(db,scope).as('cash')).where('business_date','<=',to);if(from)cash=cash.where('business_date','>=',from);
 const sums=await cash.clone().select(db.raw("COALESCE(SUM(CASE WHEN direction='IN' THEN amount_minor ELSE 0 END),0)::text AS inflow"),db.raw("COALESCE(SUM(CASE WHEN direction='OUT' THEN amount_minor ELSE 0 END),0)::text AS outflow"),db.raw("COALESCE(SUM(CASE WHEN kind='CUSTOMER' THEN CASE WHEN direction='IN' THEN amount_minor ELSE -amount_minor END ELSE 0 END),0)::text AS collections"),db.raw("COALESCE(SUM(CASE WHEN kind IN ('SUPPLIER','SALARY') THEN CASE WHEN direction='OUT' THEN amount_minor ELSE -amount_minor END ELSE 0 END),0)::text AS payments")).first();
 const trend=await cash.clone().select('business_date').select(db.raw("SUM(CASE WHEN direction='IN' THEN amount_minor ELSE 0 END)::text AS inflow"),db.raw("SUM(CASE WHEN direction='OUT' THEN amount_minor ELSE 0 END)::text AS outflow")).groupBy('business_date').orderBy('business_date');
 const recent=await cash.clone().orderBy('business_date','desc').orderBy('created_at','desc').limit(10);const hc=await db('records').where({...scope,resource:'employees',status:'Active'}).count('* as n').first();
 return {from,to,currency:'BDT',balance_note:'AR/AP/payroll outstanding as of To; From filters issued sales and cash movements. Net cash movement is not profit or a bank balance.',...Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,String(v)])),collections_minor:sums.collections,payments_minor:sums.payments,cash_in_minor:sums.inflow,cash_out_minor:sums.outflow,net_cash_minor:String(BigInt(sums.inflow)-BigInt(sums.outflow)),active_headcount:Number(hc.n),obligations,cash_trend:trend.map(r=>({date:calendar(r.business_date),inflow_minor:r.inflow,outflow_minor:r.outflow})),recent_cash:recent.map(r=>({...r,business_date:calendar(r.business_date)}))};
}
async function reportCSV(db,scope,filters){const {csv}=require('./imports.js');const report=await snapshot(db,scope,filters);const rows=report.obligations.map(r=>({section:'Obligation as of '+report.to,document:r.external_id,kind:r.kind,principal_bdt:decimal(r.principal_minor),paid_bdt:decimal(r.paid_minor),outstanding_bdt:decimal(r.outstanding_minor),date:r.business_date,due_date:r.due_date,status:r.status}));for(const key of ['invoiced_sales_minor','collections_minor','payments_minor','net_cash_minor'])rows.push({section:'Selected-period total',document:key.replace('_minor',''),kind:'BDT',value_bdt:decimal(report[key]),date:report.to});return csv(rows,['section','document','kind','date','due_date','status','principal_bdt','paid_bdt','outstanding_bdt','value_bdt']);}
module.exports={ACTIONS,commandFinance,preparePeople,snapshot,reportCSV,calendar,decimal,reversePayment,cashMovements,outstandingRows};
