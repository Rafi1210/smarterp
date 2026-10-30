require('./env.cjs');
const {database,assertContext}=require('../src/lib/db.js');
const {COMPANY,DEMO,NW,UCI,normalize}=require('../src/lib/registry.js');
const {insertRecord}=require('../src/lib/services/records.js');
async function main(){const db=database();try{await assertContext(db);await db.transaction(async trx=>{
await trx('companies').insert({id:COMPANY,name:'Demo Garments Ltd.'}).onConflict('id').ignore();
for(const d of [{id:DEMO,name:'Operational synthetic',operational:true,units:'BDT; kg; pieces',attribution:'Synthetic interview data',warnings:[]},{id:NW,name:'Northwind historical',operational:false,units:'Original source units',attribution:'jpwhite3/northwind-SQLite3 · MIT',warnings:['Fictional trading data; not BDT or garment production.']},{id:UCI,name:'UCI garment historical',operational:false,units:'Original team-day source units',attribution:'UCI Garment Productivity · CC BY 4.0',warnings:['Missing WIP is null. Unweighted team-day productivity; not individual payroll.']}])await trx('datasets').insert({...d,company_id:COMPANY,warnings:JSON.stringify(d.warnings)}).onConflict('id').ignore();
const scope={company_id:COMPANY,dataset_id:DEMO};
for(const [resource,rows] of [['customers',[{external_id:'BUYER-001',name:'Demo Apparel Buyer',country:'Bangladesh'}]],['suppliers',[{external_id:'SUP-001',name:'Demo Fabric Supplier',country:'Bangladesh'}]],['items',[{external_id:'FABRIC-001',name:'Finished cotton fabric',uom:'kg',kind:'raw'}]],['items',[{external_id:'TSHIRT-001',name:'Basic cotton T-shirt',uom:'pieces',kind:'finished'}]],['employees',[{external_id:'EMP-001',name:'Demo Employee',department:'Production'}]]])await insertRecord(trx,scope,resource,await normalize(trx,scope,resource,rows),'explicit-seed');
});console.log('Idempotent foundation seed complete. No business postings created.');}finally{await db.destroy()}}main().catch(e=>{console.error(e.message);process.exitCode=1});
