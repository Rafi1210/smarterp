require('./env.cjs');
const {database,assertContext}=require('../src/lib/db.js');
(async()=>{
 const db=database();try{
  await assertContext(db);const balances=await db('inventory_balances');
  for(const b of balances){
   const key={company_id:b.company_id,dataset_id:b.dataset_id,item_id:b.item_id,warehouse:b.warehouse};
   const sums=await db('stock_movements').where(key).sum({physical:'quantity_delta',held:'held_delta',reserved:'reserved_delta'}).first();
   for(const field of ['physical','held','reserved'])if(BigInt(sums[field]||0)!==BigInt(b[field]))throw Error(`Stock ${field} ledger does not reconcile for ${b.item_id}.`);
   const active=await db('inventory_reservations').where({...key,status:'Active'}).sum({quantity:'quantity'}).first();
   if(BigInt(active.quantity||0)!==BigInt(b.reserved))throw Error('Active reservations do not reconcile for '+b.item_id);
   if(BigInt(b.physical)-BigInt(b.held)-BigInt(b.reserved)<0n)throw Error('Negative available stock for '+b.item_id);
  }
  const history=await db('stock_movements').whereNot('dataset_id','smarterp-demo').count('* as n').first();if(Number(history.n))throw Error('Historical dataset contains operational stock movements.');
  const historicalReservations=await db('inventory_reservations').whereNot('dataset_id','smarterp-demo').count('* as n').first();if(Number(historicalReservations.n))throw Error('Historical dataset contains reservations.');
  const obligations=await db('obligations');for(const o of obligations){const key={company_id:o.company_id,dataset_id:o.dataset_id,target_id:o.document_id},a=await db('payment_allocations').where(key).sum({paid:'amount_minor'}).first(),r=await db('payment_reversals').where(key).sum({reversed:'amount_minor'}).first();if(BigInt(a.paid||0)-BigInt(r.reversed||0)!==BigInt(o.allocated_minor))throw Error('Allocation balance mismatch.');}
  const reversals=await db('payment_reversals');for(const r of reversals){const key={company_id:r.company_id,dataset_id:r.dataset_id},cash=await db('cash_entries').where({...key,id:r.original_cash_id,payment_id:r.payment_id}).first(),allocation=await db('payment_allocations').where({...key,payment_id:r.payment_id,target_id:r.target_id}).first(),payment=await db('records').where({...key,id:r.payment_id}).first(),voucher=await db('records').where({...key,id:r.cash_record_id,resource:'cashbook'}).first();if(!cash||!allocation||payment?.status!=='Reversed'||!voucher?.data.reversal||BigInt(cash.amount_minor)!==BigInt(r.amount_minor)||BigInt(allocation.amount_minor)!==BigInt(r.amount_minor))throw Error('Payment reversal does not reconcile.');}
  const journals=await db('finance_journal_lines').select('journal_id').sum({debit:'debit_minor',credit:'credit_minor'}).groupBy('journal_id');for(const j of journals)if(BigInt(j.debit)!==BigInt(j.credit))throw Error('Unbalanced selected-event journal.');
  const reviews=await db('approval_requests');for(const req of reviews){const decision=await db('approval_decisions').where({company_id:req.company_id,dataset_id:req.dataset_id,request_id:req.id}).first();if(req.status==='Pending'?Boolean(decision):decision?.decision!==req.status)throw Error('Approval request/decision mismatch for '+req.external_id);}
  const dependencies=await db('planning_task_dependencies');for(const d of dependencies){const key={company_id:d.company_id,dataset_id:d.dataset_id},child=await db('records').where({...key,id:d.task_id}).first(),parent=await db('records').where({...key,id:d.prerequisite_id}).first();if(child?.resource!=='tasks'||parent?.resource!=='tasks'||child.data.source_sales_id!==parent.data.source_sales_id)throw Error('Planning prerequisite scope mismatch.');if(!['Cancelled','Deleted'].includes(child.status)&&(['Cancelled','Deleted'].includes(parent.status)||child.data.planned_start<parent.data.due_date))throw Error('Planning prerequisite date/state mismatch.');}
  const allowance=await db('ai_allowance').where({id:1}).first(),calls=await db('ai_calls');
  const settled=calls.filter(c=>c.status!=='Reserved').reduce((sum,c)=>sum+BigInt(c.charged_micro_usd),0n),held=calls.filter(c=>c.status==='Reserved').reduce((sum,c)=>sum+BigInt(c.reservation_micro_usd),0n);
  if(!allowance||settled!==BigInt(allowance.spent_micro_usd)||held!==BigInt(allowance.reserved_micro_usd)||settled+held>BigInt(allowance.limit_micro_usd))throw Error('AI allowance ledger does not reconcile.');
  const ownApprovals=await db('approval_requests as r').join('approval_decisions as d','d.request_id','r.id').where('d.decision','Approved').whereNotNull('r.submitted_by').whereRaw('r.submitted_by=d.decided_by').count('* as n').first();if(Number(ownApprovals.n))throw Error('A reviewer approved their own submitted request.');
  console.log(JSON.stringify({paymentReversalsChecked:reversals.length,aiCallsChecked:calls.length,aiAllowanceReconciled:true,independentReviewsChecked:true,reviewsChecked:reviews.length,planningDependenciesChecked:dependencies.length,obligationsChecked:obligations.length,journalsChecked:journals.length,balancesChecked:balances.length,reservationsReconciled:true,reconciled:true,historicalPostings:0}));
 }finally{await db.destroy()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
