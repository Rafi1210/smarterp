const {randomUUID}=require('node:crypto');
const {fail,today,date,calendar}=require('../core.js');
const {insertRecord}=require('./records.js');
const {nextCode}=require('./naming.js');
const available=b=>BigInt(b?.physical||0)-BigInt(b?.held||0)-BigInt(b?.reserved||0);
async function stock(trx,scope,item_id){
  await trx('inventory_balances').insert({...scope,item_id,physical:'0',held:'0',reserved:'0'}).onConflict(['company_id','dataset_id','item_id','warehouse']).ignore();
  return trx('inventory_balances').where({...scope,item_id,warehouse:'HQ-STORE'}).forUpdate().first();
}
async function move(trx,scope,source,item,eventID,kind,quantity,held=0n,reserved=0n){
  const b=await stock(trx,scope,item.id),p=BigInt(b.physical)+quantity,h=BigInt(b.held)+held,r=BigInt(b.reserved)+reserved;
  fail(p>=0n&&h>=0n&&r>=0n&&h+r<=p,'Insufficient available stock: QC-held and reserved quantities cannot be consumed by another order.',409);
  const sourceDate=calendar(source.business_date||today());
  const business_date=date(['OPENING','GOODS_RECEIPT','DISPATCH'].includes(kind)?sourceDate:today());
  const latest=await trx('stock_movements').where({...scope,item_id:item.id,warehouse:'HQ-STORE'}).max('business_date as date').first();
  fail(!latest.date||business_date>=calendar(latest.date),'Stock posting cannot predate this item’s latest movement. Create a current-date draft; the original record is preserved.',409);
  await trx('inventory_balances').where({...scope,item_id:item.id,warehouse:'HQ-STORE'}).update({physical:String(p),held:String(h),reserved:String(r)});
  const record=(await insertRecord(trx,scope,'movements',{
    external_id:await nextCode(trx,scope,'STK',business_date),name:`${kind.replaceAll('_',' ')} · ${item.name}`,status:'Posted',business_date,
    data:{kind,item_id:item.external_id,item_name:item.name,source_id:source.external_id,warehouse:'HQ-STORE',quantity_delta:String(quantity),held_delta:String(held),reserved_delta:String(reserved),physical_after:String(p),held_after:String(h),reserved_after:String(r),base_uom:item.data.base_uom,unit:item.data.uom},
    lines:[],refs:[{id:item.id,relation:'item'},{id:source.id,relation:'source'}]
  })).record;
  await trx('stock_movements').insert({id:record.id,...scope,item_id:item.id,source_id:source.id,event_id:eventID,kind,quantity_delta:String(quantity),held_delta:String(held),reserved_delta:String(reserved),physical_after:String(p),held_after:String(h),reserved_after:String(r),business_date});
  return record;
}
async function reserve(trx,scope,wo,so,plan,eventID){
  const other=await trx('records').where({...scope,resource:'workorders'}).whereNot('id',wo.id).whereRaw("data->>'source_sales_id' = ?",[so.external_id]).whereNotIn('status',['Draft','Cancelled']).first();
  fail(!other,'Another Work Order already reserves or has consumed this Sales Order.',409);
  fail(BigInt(plan.shortage)===0n,'Receive the material shortage before reserving production stock.',409);
  await move(trx,scope,wo,plan.component,eventID,'MATERIAL_RESERVATION',0n,0n,BigInt(plan.required));
  await trx('inventory_reservations').insert({id:randomUUID(),...scope,workorder_id:wo.id,sales_id:so.id,item_id:plan.component.id,quantity:plan.required,status:'Active'});
}
async function reservation(trx,scope,wo){return trx('inventory_reservations').where({...scope,workorder_id:wo.id,status:'Active'}).forUpdate().first();}
async function inventorySnapshot(db,scope,filters={}){
  fail(scope.dataset_id==='smarterp-demo','Inventory reports use the operational namespace only.');
  const to=date(filters.to||today()),from=filters.from?date(filters.from):null;fail(!from||from<=to,'Date range is reversed.');
  const sums=db('stock_movements').where(scope).where('business_date','<=',to).select('item_id').sum({physical:'quantity_delta',held:'held_delta',reserved:'reserved_delta'}).groupBy('item_id');
  let q=db('records as i').leftJoin(sums.as('s'),'s.item_id','i.id').where({'i.company_id':scope.company_id,'i.dataset_id':scope.dataset_id,'i.resource':'items'});
  if(filters.search){fail(String(filters.search).length<=120,'Search is too long.');const term='%'+String(filters.search).replace(/[\\%_]/g,c=>'\\'+c)+'%';q=q.where(w=>w.whereILike('i.name',term).orWhereILike('i.external_id',term));}
  const rows=await q.select('i.id','i.external_id','i.name','i.data','s.physical','s.held','s.reserved').orderBy('i.external_id').limit(5001);fail(rows.length<=5000,'Narrow the inventory report to at most 5,000 items.',413);
  const items=rows.map(i=>{const balance={physical:String(i.physical||0),held:String(i.held||0),reserved:String(i.reserved||0)};return {id:i.id,resource:'items',external_id:i.external_id,name:i.name,uom:i.data.uom,...balance,available:String(available(balance)),reorder_base:i.data.reorder_base||'0',low:available(balance)<=BigInt(i.data.reorder_base||0)};});
  return {to,from,items,low_stock:items.filter(i=>i.low).length,reserved_items:items.filter(i=>BigInt(i.reserved)>0n).length,held_items:items.filter(i=>BigInt(i.held)>0n).length,note:'Physical − QC held − reserved = available. Quantities remain in each item’s original unit; kg and pieces are never added together. Balances are as of To; From does not change closing stock.'};
}
module.exports={available,stock,move,reserve,reservation,inventorySnapshot};
