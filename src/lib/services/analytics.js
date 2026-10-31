const {fail,date,today,calendar}=require('../core.js');
const {readAllowed}=require('../resource-access.js');
const finance=require('./finance.js');
const {inventorySnapshot}=require('./inventory.js');
const PIPELINE=['Draft','Quoted','Confirmed','Delivered','Cancelled'];
const number=value=>Number(value||0);
function dayDistance(a,b){return Math.floor((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);}
async function dashboard(db,scope,filters={}){
 fail(scope.dataset_id==='smarterp-demo','Operational analytics use Operations only.',400);
 const to=date(filters.to||today(),'To date'),from=filters.from?date(filters.from,'From date'):null;
 fail(!from||from<=to,'From must not follow To.');
 const state=String(filters.status||''),buyerCode=String(filters.buyer||'').trim();
 fail(!state||PIPELINE.includes(state),'Choose a supported sales stage.');fail(buyerCode.length<=80,'Buyer code is too long.');
 const buyer=buyerCode?await db('records').where({...scope,resource:'customers',external_id:buyerCode}).whereNot('status','Deleted').select('id','external_id','name').first():null;
 fail(!buyerCode||buyer,'Buyer does not exist in this namespace.',404);
 const sales=(ignoreFrom=false)=>{
  let q=db('records as s').where({'s.company_id':scope.company_id,'s.dataset_id':scope.dataset_id,'s.resource':'sales'}).whereNotIn('s.status',['Deleted','Archived']).where('s.business_date','<=',to);
  if(!state)q=q.whereNot('s.status','Cancelled');else q=q.where('s.status',state);
  if(from&&!ignoreFrom)q=q.where('s.business_date','>=',from);
  if(buyer)q=q.whereRaw("s.data->>'customer_id' = ?",[buyer.external_id]);
  return q;
 };
 const totals=await sales().select(db.raw("COUNT(*)::int AS documents, COUNT(DISTINCT s.data->>'customer_id')::int AS buyers, COUNT(*) FILTER(WHERE s.status IN ('Confirmed','Delivered'))::int AS orders, COUNT(*) FILTER(WHERE s.status='Delivered')::int AS delivered, COALESCE(SUM(CASE WHEN s.status IN ('Confirmed','Delivered') THEN (s.data->>'total_minor')::numeric ELSE 0 END),0)::text AS order_value_minor")).first();
 const pieces=await db('document_lines as l').where({'l.company_id':scope.company_id,'l.dataset_id':scope.dataset_id,'l.uom':'pieces'}).whereIn('l.document_id',sales().whereIn('s.status',['Confirmed','Delivered']).select('s.id')).sum({pieces:'l.quantity'}).first();
 const pipeline=await sales().select('s.status').count('* as count').groupBy('s.status');
 const monthly=await sales().whereIn('s.status',['Confirmed','Delivered']).select(db.raw("to_char(s.business_date,'YYYY-MM') AS month")).sum({value_minor:db.raw("(s.data->>'total_minor')::numeric")}).count('* as orders').groupByRaw("to_char(s.business_date,'YYYY-MM')").orderBy('month','desc').limit(24);
 const topBuyers=await sales().whereIn('s.status',['Confirmed','Delivered']).join('records as c',function(){this.on('c.company_id','=','s.company_id').andOn('c.dataset_id','=','s.dataset_id').andOnVal('c.resource','=','customers').andOn(db.raw("c.external_id=s.data->>'customer_id'"));}).select('c.external_id as buyer_code','c.name').sum({value_minor:db.raw("(s.data->>'total_minor')::numeric")}).count('* as orders').groupBy('c.id','c.external_id','c.name').orderBy('value_minor','desc').limit(8);
 const sourceCodes=()=>sales().select('s.external_id');
 const linked=resource=>db('records').where({...scope,resource}).whereNotIn('status',['Deleted','Archived','Cancelled']).whereIn(db.raw("data->>'source_sales_id'"),sourceCodes());
 const production=await linked('workorders').select('status').count('* as count').select(db.raw("COALESCE(SUM((data->>'quantity')::numeric),0)::text AS pieces")).groupBy('status');
 const merch=await linked('merchandising').select('status').count('* as count').groupBy('status');
 const tasks=await linked('tasks').select('status').count('* as count').groupBy('status');
 const overdue=await linked('tasks').whereNotIn('status',['Done','Cancelled']).whereRaw("data->>'due_date' < ?",[to]).count('* as count').first();
 const stock=await inventorySnapshot(db,scope,{to});
 const output={filters:{from,to,status:state,buyer:buyer?.external_id||''},buyer:buyer||null,
  totals:{documents:number(totals.documents),buyers:number(totals.buyers),orders:number(totals.orders),delivered:number(totals.delivered),pieces:String(pieces.pieces||'0'),order_value_minor:totals.order_value_minor,workorders:production.reduce((n,r)=>n+number(r.count),0),merchandising:merch.reduce((n,r)=>n+number(r.count),0),overdue_tasks:number(overdue.count)},
  sales_trend:monthly.reverse().map(r=>({...r,orders:number(r.orders)})),top_buyers:topBuyers.map(r=>({...r,orders:number(r.orders)})),
  pipeline:PIPELINE.map(status=>({status,count:number(pipeline.find(r=>r.status===status)?.count)})),production:production.map(r=>({...r,count:number(r.count)})),merchandising:merch.map(r=>({...r,count:number(r.count)})),tasks:tasks.map(r=>({...r,count:number(r.count)})),stock:stock.items,
  notes:{orders:'Sales document dates select the order cohort. Pipeline, production, merchandising and task states are current states; they are not reconstructed historical statuses.',inventory:'Warehouse balances are shared across buyers. Only To changes the closing stock; buyer and sales-stage filters do not allocate physical stock.',money:'Order value is confirmed/delivered order value, not invoiced sales or profit. Cash follows posting dates and includes reversal vouchers.'}};
 if(readAllowed('payments')){
  let receivables=finance.outstandingRows(db,scope,to).where('o.kind','AR');
  if(buyer||state)receivables=receivables.whereIn('o.source_id',sales(true).select('s.id'));
  const open=await receivables;fail(open.length<=10000,'Narrow the receivables scope.',413);
  const buckets=[['Current',0n],['1–30 days',0n],['31–60 days',0n],['61–90 days',0n],['90+ days',0n]];
  for(const row of open){const amount=BigInt(row.outstanding_minor);if(amount<=0n)continue;const days=dayDistance(to,calendar(row.due_date));const i=days<=0?0:days<=30?1:days<=60?2:days<=90?3:4;buckets[i][1]+=amount;}
  let cash=db.from(finance.cashMovements(db,scope).as('m')).where('m.business_date','<=',to);if(from)cash=cash.where('m.business_date','>=',from);
  if(buyer||state){
   const codes=()=>sales(true).select('s.external_id');
   const pos=db('records').where({...scope,resource:'purchases'}).whereIn(db.raw("data->>'source_sales_id'"),codes()).select('external_id');
   const selected=db('records as p').join('records as i',function(){this.on('p.company_id','=','i.company_id').andOn('p.dataset_id','=','i.dataset_id').andOnVal('i.resource','=','invoices').andOn(db.raw("i.external_id=p.data->>'target_id'"));}).where({'p.company_id':scope.company_id,'p.dataset_id':scope.dataset_id,'p.resource':'payments'}).where(q=>q.where(w=>w.whereRaw("p.data->>'kind'='CUSTOMER'").whereIn(db.raw("i.data->>'source_id'"),codes())).orWhere(w=>w.whereRaw("p.data->>'kind'='SUPPLIER'").whereIn(db.raw("i.data->>'source_id'"),pos))).select('p.id');
   cash=cash.whereIn('m.payment_id',selected);
  }
  const cashTotals=await cash.clone().select(db.raw("COALESCE(SUM(CASE WHEN m.direction='IN' THEN m.amount_minor ELSE 0 END),0)::text AS inflow_minor, COALESCE(SUM(CASE WHEN m.direction='OUT' THEN m.amount_minor ELSE 0 END),0)::text AS outflow_minor")).first();
  const movements=await cash.select(db.raw("to_char(m.business_date,'YYYY-MM') AS month, COALESCE(SUM(CASE WHEN m.direction='IN' THEN m.amount_minor ELSE 0 END),0)::text AS inflow_minor, COALESCE(SUM(CASE WHEN m.direction='OUT' THEN m.amount_minor ELSE 0 END),0)::text AS outflow_minor")).groupByRaw("to_char(m.business_date,'YYYY-MM')").orderBy('month','desc').limit(24);
  output.finance={aging:buckets.map(([label,n])=>({label,amount_minor:String(n)})),ar_minor:String(buckets.reduce((n,[,amount])=>n+amount,0n)),cash_in_minor:cashTotals.inflow_minor,cash_out_minor:cashTotals.outflow_minor,net_cash_minor:String(BigInt(cashTotals.inflow_minor)-BigInt(cashTotals.outflow_minor)),cash_trend:movements.reverse(),note:'AR is outstanding as of To, including earlier invoices. Cash uses From/To posting dates. Buyer/stage filters apply to linked customer and supplier payments; payroll is included only for All buyers / All stages. Trends show at most 24 occupied months.'};
 }
 return output;
}
function exportDashboard(data){
 const rows=[];
 const stockQuantity=(value,uom)=>{const n=BigInt(value||0);return uom==='kg'?`${n/1000n}.${String(n%1000n).padStart(3,'0')}`:String(n);};
 for(const [metric,value]of Object.entries(data.totals))rows.push({section:'Summary',label:metric,value,unit:metric.endsWith('_minor')?'paisa':metric==='pieces'?'pieces':'records'});
 for(const r of data.sales_trend)rows.push({section:'Order value by month',label:r.month,value:r.value_minor,unit:'paisa',count:r.orders});
 for(const r of data.top_buyers)rows.push({section:'Top buyers',label:r.name,code:r.buyer_code,value:r.value_minor,unit:'paisa',count:r.orders});
 for(const r of data.pipeline)rows.push({section:'Sales stages',label:r.status,value:r.count,unit:'records'});
 for(const r of data.production)rows.push({section:'Production stages',label:r.status,value:r.count,unit:'records',quantity:r.pieces});
 for(const r of data.merchandising)rows.push({section:'Merchandising stages',label:r.status,value:r.count,unit:'records'});
 for(const r of data.tasks)rows.push({section:'T&A stages',label:r.status,value:r.count,unit:'records'});
 for(const r of data.stock)rows.push({section:'Warehouse stock',label:r.name,code:r.external_id,unit:r.uom,physical_quantity:stockQuantity(r.physical,r.uom),reserved_quantity:stockQuantity(r.reserved,r.uom),held_quantity:stockQuantity(r.held,r.uom),available_quantity:stockQuantity(r.available,r.uom)});
 if(data.finance){for(const r of data.finance.aging)rows.push({section:'Receivables aging',label:r.label,value:r.amount_minor,unit:'paisa'});for(const r of data.finance.cash_trend)rows.push({section:'Cash movements',label:r.month,inflow_minor:r.inflow_minor,outflow_minor:r.outflow_minor,unit:'paisa'});}
 for(const [label,value]of Object.entries(data.filters))rows.push({section:'Filter',label,value:value||'All'});
 return require('./imports.js').csv(rows,['section','label','code','value','unit','count','quantity','inflow_minor','outflow_minor','physical_quantity','reserved_quantity','held_quantity','available_quantity']);
}
module.exports={dashboard,exportDashboard};
