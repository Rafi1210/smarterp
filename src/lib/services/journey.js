const {readAllowed}=require('../resource-access.js');
const brief=r=>r?{id:r.id,resource:r.resource,external_id:r.external_id,name:r.name,status:r.status,kind:r.data.kind}:null;
async function orderJourney(db,scope,record){
  let root=record;
  const byCode=(resource,external_id)=>db('records').where({...scope,resource,external_id}).first();
  for(let hop=0;hop<5&&root&&root.resource!=='sales';hop++){
    if(['merchandising','purchases','workorders'].includes(root.resource))root=await byCode('sales',root.data.source_sales_id);
    else if(root.resource==='receipts')root=await byCode('purchases',root.data.purchase_id);
    else if(root.resource==='deliveries')root=root.data.source_sales_id?await byCode('sales',root.data.source_sales_id):await byCode('workorders',root.data.workorder_id);
    else if(root.resource==='invoices')root=await byCode(root.data.kind==='SALES'?'sales':'purchases',root.data.source_id);
    else if(root.resource==='payments'&&root.data.kind!=='SALARY')root=await byCode('invoices',root.data.target_id);
    else return null;
  }
  if(!root||root.resource!=='sales')return null;
  const forOrder=resource=>db('records').where({...scope,resource}).whereNotIn('status',['Deleted','Archived']).whereRaw("data->>'source_sales_id' = ?",[root.external_id]).orderBy('created_at').limit(100);
  const sheets=await forOrder('merchandising'),purchases=await forOrder('purchases'),workorders=await forOrder('workorders');
  const sheet=sheets.find(r=>r.status==='Approved')||sheets[0],wo=workorders.find(r=>r.status!=='Cancelled');
  const poCodes=purchases.map(p=>p.external_id),woCodes=workorders.map(w=>w.external_id);
  const receipts=poCodes.length?await db('records').where({...scope,resource:'receipts'}).whereNotIn('status',['Deleted','Archived']).whereIn(db.raw("data->>'purchase_id'"),poCodes).orderBy('created_at').limit(100):[];
  const deliveries=woCodes.length?await db('records').where({...scope,resource:'deliveries'}).whereNotIn('status',['Deleted','Archived']).whereIn(db.raw("data->>'workorder_id'"),woCodes).orderBy('created_at').limit(100):[];
  const invoices=readAllowed('invoices','SALES')?await db('records').where({...scope,resource:'invoices'}).whereNotIn('status',['Deleted','Archived']).whereRaw("data->>'kind'='SALES' AND data->>'source_id'=?",[root.external_id]).orderBy('created_at').limit(100):[];
  const bills=poCodes.length?await db('records').where({...scope,resource:'invoices'}).whereNotIn('status',['Deleted','Archived']).whereRaw("data->>'kind'='PURCHASE'").whereIn(db.raw("data->>'source_id'"),poCodes).orderBy('created_at').limit(100):[];
  const invoice=invoices.find(r=>['Posted','PartPaid','Paid'].includes(r.status))||invoices[0];
  const obligation=invoice?await db('obligations').where({...scope,document_id:invoice.id}).first():null;
  const collection=obligation?{principal_minor:obligation.principal_minor,allocated_minor:obligation.allocated_minor,outstanding_minor:String(BigInt(obligation.principal_minor)-BigInt(obligation.allocated_minor))}:null;
  const step=(label,r,done,note)=>({label,record:brief(r),done:Boolean(done),note:note||(!r?'Pending':r.external_id)});
  const delivery=deliveries.find(d=>d.status==='Dispatched')||deliveries[0];
  const steps=[
    step('Sales order',root,['Confirmed','Delivered'].includes(root.status)),
    step('Merchandising',sheet,sheet?.status==='Approved',!sheet&&root.status==='Delivered'?'No order sheet on this older order':null),
    step('Materials / purchase',purchases[0],purchases.length?purchases.every(p=>p.status==='Received'):Boolean(wo),!purchases.length?(wo?'Existing stock used':'Check material requirement'):null),
    step('Production',wo,['Produced','QCHold','QCReleased','Delivered'].includes(wo?.status)),
    step('Quality release',wo,['QCReleased','Delivered'].includes(wo?.status)),
    step('Delivery',delivery,delivery?.status==='Dispatched'),
    step('Customer invoice',invoice,['Posted','PartPaid','Paid'].includes(invoice?.status)),
    step('Customer receipt',invoice,invoice?.status==='Paid',invoice?.status==='PartPaid'?'Partly collected':invoice?.status==='Paid'?'Fully collected':'Awaiting allocation')
  ];
  return {sales:brief(root),steps,collection,documents:[...sheets,...purchases,...receipts,...bills,...workorders,...deliveries,...invoices].filter(r=>readAllowed(r.resource,r.data.kind)).map(brief)};
}
module.exports={orderJourney};
