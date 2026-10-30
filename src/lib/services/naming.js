const {fail, today} = require('../core.js');
const PREFIXES = {tasks:'TNA',customers:'CUS',suppliers:'SUP',items:'ITM',employees:'EMP',sales:'SO',purchases:'PO',bom:'BOM',merchandising:'MER',workorders:'WO',receipts:'GRN',deliveries:'DN',openings:'OPN',invoices:'INV',attendance:'ATT',payroll:'PAY',payments:'PMT',movements:'STK',cashbook:'CSH',journals:'JRN',payslips:'PSL'};
function prefixFor(resource, data={}) {
  if (resource==='invoices') return data.kind==='PURCHASE'?'BILL':'INV';
  if (resource==='payments') return {CUSTOMER:'RCV',SUPPLIER:'SPV',SALARY:'SAL'}[data.kind] || 'PMT';
  return PREFIXES[resource];
}
// Call inside the same transaction as the document insert. A row lock protects
// numbering even when multiple requests/imports arrive together.
async function nextCode(trx, scope, prefix, businessDate=today()) {
  fail(/^[A-Z]{2,5}$/.test(prefix||''), 'Unsupported document series.');
  const year=Number(String(businessDate).slice(0,4)); fail(year>=1900&&year<=2200, 'Invalid document year.');
  const key={...scope,prefix,year};
  await trx('document_sequences').insert({...key,last_number:0}).onConflict(['company_id','dataset_id','prefix','year']).ignore();
  const sequence=await trx('document_sequences').where(key).forUpdate().first();
  let n=sequence.last_number;
  for(let attempt=0;attempt<10000;attempt++) {
    n++; fail(n<=9999999,'Document series exhausted.',409);
    const code=`${prefix}-${year}-${String(n).padStart(5,'0')}`;
    if(!await trx('records').where(scope).where('external_id',code).first()) {
      await trx('document_sequences').where(key).update({last_number:n}); return code;
    }
  }
  fail(false,'Too many occupied document numbers; review the series.',409);
}
module.exports={nextCode,prefixFor,PREFIXES};
