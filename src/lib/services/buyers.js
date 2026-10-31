const {fail,stableHash} = require('../core.js');
const clean = value => String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const phoneKey = value => String(value||'').replace(/\D/g,'');
async function matches(db,scope,data={},excludeCode='') {
  fail(scope.dataset_id==='smarterp-demo','Buyer suggestions use Operations records only.');
  const name=clean(data.name),email=clean(data.email),phone=phoneKey(data.phone),registration=clean(data.registration_no);
  fail(name.length<=200&&email.length<=200&&phone.length<=40&&registration.length<=100,'Buyer search values are too long.');
  if(name.length<3&&!email&&phone.length<6&&!registration)return {matches:[],fingerprint:stableHash([])};
  const rows=await db('records').where({...scope,resource:'customers'}).whereNot('status','Deleted').modify(q=>{if(excludeCode)q.whereNot('external_id',excludeCode);})
    .where(q=>{
      if(name.length>=3)q.orWhereRaw("lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')) = ?",[name]);
      if(email)q.orWhereRaw("lower(btrim(COALESCE(data->>'email',''))) = ?",[email]);
      if(phone.length>=6)q.orWhereRaw("regexp_replace(COALESCE(data->>'phone',''),'[^0-9]','','g') = ?",[phone]);
      if(registration)q.orWhereRaw("lower(btrim(COALESCE(data->>'registration_no',''))) = ?",[registration]);
    }).select('id','external_id','name','status','data').orderBy('created_at','desc').orderBy('id').limit(10);
  const result=rows.map(r=>({id:r.id,external_id:r.external_id,name:r.name,status:r.status,country:r.data.country||'',email:r.data.email||'',reasons:[clean(r.name)===name&&name.length>=3?'Same buyer name':null,email&&clean(r.data.email)===email?'Same email':null,phone.length>=6&&phoneKey(r.data.phone)===phone?'Same phone':null,registration&&clean(r.data.registration_no)===registration?'Same registration number':null].filter(Boolean)}));
  return {matches:result,fingerprint:stableHash({name,email,phone,registration,ids:result.map(r=>r.id).sort()})};
}
async function guardDuplicate(db,scope,normalized,ack) {
  const result=await matches(db,scope,{...normalized.data,name:normalized.name},normalized.external_id);
  if(!result.matches.length)return;
  const reason=String(ack?.reason||'').trim();
  fail(ack?.fingerprint===result.fingerprint&&reason.length>=6&&reason.length<=500,'A similar buyer already exists. Select that buyer, or confirm why this is a separate buyer.',409,{code:'POSSIBLE_DUPLICATE_BUYER',...result});
  return {reason,matches:result.matches.map(r=>r.external_id)};
}
module.exports={matches,guardDuplicate};
