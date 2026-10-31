const {assertCreate,assertBatch,restrictBatches}=require('../resource-access.js');const {actorLabel,currentUser}=require('../actor.js');
const Papa = require('papaparse');
const { randomUUID } = require('node:crypto');
const { fail, hash, stableHash, integer, safeCell } = require('../core.js');
const { getResource, normalize, UCI, NW } = require('../registry.js');
const { insertRecord, filtered, matchesHash } = require('./records.js');
const LIMIT_BYTES = 2000000, LIMIT_ROWS = 5000;
function parseCSV(buffer) {
  fail(buffer.length <= LIMIT_BYTES,'CSV exceeds the 2 MB upload limit.',413);
  let text;
  try { text = new TextDecoder('utf-8',{fatal:true}).decode(buffer); } catch { fail(false,'CSV must use UTF-8 encoding.'); }
  text = text.replace(/^\uFEFF/,''); fail(!text.includes('\u0000'),'CSV contains invalid null characters.');
  const headers = Papa.parse(text,{preview:1,skipEmptyLines:'greedy'}).data[0] || [];
  const trimmed = headers.map(h=>String(h).trim());
  fail(trimmed.length > 0 && trimmed.length <= 80 && trimmed.every(Boolean),'CSV needs 1–80 nonempty headers.');
  fail(new Set(trimmed.map(h=>h.toLowerCase())).size===trimmed.length,'Duplicate CSV headers are not allowed.');
  const parsed = Papa.parse(text,{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.trim(),dynamicTyping:false});
  fail(parsed.data.length>0,'CSV has no data rows.'); fail(parsed.data.length<=LIMIT_ROWS,'CSV exceeds the 5,000-row limit.',413);
  fail(!parsed.errors.length,'Malformed CSV.',400,parsed.errors.slice(0,50).map(e=>({row:e.row===undefined?null:e.row+2,reason:e.message})));
  return { headers:trimmed,rows:parsed.data,fileHash:hash(buffer) };
}
function mappingFor(cfg,headers,supplied) {
  const mapping = {};
  for(const f of cfg.fields) {
    const h = supplied && Object.hasOwn(supplied,f.key) ? supplied[f.key] : headers.find(h=>h.toLowerCase().replace(/[\s-]/g,'_')===f.key.toLowerCase()) || '';
    fail(!h || headers.includes(h),`Mapped column '${h}' is absent.`);
    fail(!f.required || h,`Map the required field '${f.label}'.`);
    mapping[f.key]=h;
  }
  const used = Object.values(mapping).filter(Boolean);
  fail(new Set(used).size===used.length,'Map each source column at most once.'); return mapping;
}
async function preview(db,scope,{resource,buffer,filename,mapping}) {
  fail(scope.dataset_id!==NW,'Northwind is integrity-seeded and read-only in Stage 1. Use the UCI source adapter for historical CSV imports.',409);
  assertCreate(resource);const cfg=getResource(resource,scope.dataset_id); const parsed=parseCSV(buffer); const columnMap=mappingFor(cfg,parsed.headers,mapping);
  const groups=new Map(), occur=new Map();
  for(const [index,row] of parsed.rows.entries()) {
    const mapped=Object.fromEntries(Object.entries(columnMap).map(([k,h])=>[k,h?String(row[h]??''):'']));
    let key=cfg.grouped ? mapped.external_id.trim() : `row-${index}`;
    if(scope.dataset_id===UCI) {
      const digest=stableHash(mapped).slice(0,24); const n=(occur.get(digest)||0)+1; occur.set(digest,n);
      mapped.__external_id=`UCI-${digest}-${n}`;
    }
    if(!groups.has(key)) groups.set(key,[]); groups.get(key).push({...mapped,__row:index+2});
  }
  const documents=[]; let error_count=0,warning_count=0;
  for(const [position,rowsWithLine] of [...groups.values()].entries()) {
    const rows=rowsWithLine.map(({__row,...r})=>r);
    let normalized=null; const issues=[];
    try {
      normalized=await normalize(db,scope,resource,rows);assertCreate(resource,normalized.data?.kind);
      for(const warning of normalized.warnings||[]) issues.push({severity:'warning',row:rowsWithLine[0].__row,external_id:normalized.external_id,...warning,value:rows[0][warning.field]??''});
      const existing=await db('records').where({...scope,resource,external_id:normalized.external_id}).first();
      if(existing){const {lines=[],refs=[],warnings,...values}=normalized;fail(matchesHash(existing.content_hash,values,lines,refs),`External ID '${normalized.external_id}' exists with different content.`,409);}
      if(resource==='customers'&&scope.dataset_id==='smarterp-demo'&&!existing){const candidates=await require('./buyers.js').matches(db,scope,{...normalized.data,name:normalized.name},normalized.external_id);if(candidates.matches.length)issues.push({severity:'warning',row:rowsWithLine[0].__row,external_id:normalized.external_id,field:'name',value:normalized.name,reason:'Possible duplicate buyer: '+candidates.matches.map(r=>r.external_id).join(', ')+'. Review these codes before committing; imports never merge buyers.'});}
      if(existing) issues.push({severity:'warning',row:rowsWithLine[0].__row,external_id:normalized.external_id,field:'external_id',value:normalized.external_id,reason:'Existing external ID: commit skips identical content and rejects differing content.'});
    } catch(e) { issues.push({severity:'error',row:rowsWithLine[0].__row,external_id:rows[0].external_id||'',field:'document',value:'',reason:e.status?e.message:'Validation could not complete. Try again.'}); }
    error_count+=issues.filter(i=>i.severity==='error').length; warning_count+=issues.filter(i=>i.severity==='warning').length;
    documents.push({position,external_id:normalized?.external_id||rows[0].external_id||`row-${position+2}`,rows:rowsWithLine,normalized,issues,outcome:issues.some(i=>i.severity==='error')?'INVALID':'PENDING'});
  }
  // A duplicate business key anywhere in the file blocks all conflicting documents.
  const keys=new Map();
  for(const doc of documents) {
    if(!keys.has(doc.external_id)) keys.set(doc.external_id,[]); keys.get(doc.external_id).push(doc);
  }
  for(const duplicates of keys.values()) if(duplicates.length>1) for(const d of duplicates) {
    d.issues.push({severity:'error',row:d.rows[0].__row,external_id:d.external_id,field:'external_id',value:d.external_id,reason:'Duplicate business key within the file.'}); d.outcome='INVALID'; error_count++;
  }
  if(resource==='customers'&&scope.dataset_id==='smarterp-demo'){const seen=new Map();for(const doc of documents){if(!doc.normalized)continue;const key=doc.normalized.name.trim().replace(/\s+/g,' ').toLowerCase();const previous=seen.get(key);if(previous){for(const d of [previous,doc]){d.issues.push({severity:'warning',row:d.rows[0].__row,external_id:d.external_id,field:'name',value:d.normalized.name,reason:'Another buyer in this file uses the same normalized name. Different codes create separate buyers.'});warning_count++;}}else seen.set(key,doc);}}
  if(currentUser()?.role==='operations'&&resource==='invoices')fail([...groups.values()].every(rows=>rows.every(row=>row.kind==='PURCHASE')),'Operations may import supplier bills only.',403);
  const access_group=resource==='invoices'&&[...groups.values()].every(rows=>rows.every(row=>row.kind==='PURCHASE'))?'operations':'finance';
  const id=randomUUID();
  await db.transaction(async trx=>{
    await trx('import_batches').insert({id,...scope,resource,access_group,filename:String(filename||'upload.csv').slice(0,100),file_hash:parsed.fileHash,mapping:columnMap,row_count:parsed.rows.length,document_count:documents.length,error_count,warning_count});
    // Bound SQL parameter count even for a 5,000-row file; this is staging only.
    for(let i=0;i<documents.length;i+=100) await trx('import_documents').insert(documents.slice(i,i+100).map(d=>({...d,batch_id:id,rows:JSON.stringify(d.rows),normalized:d.normalized?JSON.stringify(d.normalized):null,issues:JSON.stringify(d.issues)})));
  });
  return getBatch(db,scope,id,1);
}
async function getBatch(db,scope,id,page=1) {
  const batch=await db('import_batches').where({...scope,id}).first(); fail(batch,'Import batch not found.',404);assertBatch(batch);
  page=integer(String(page),'Page',{min:1,max:10000});
  const documents=await db('import_documents').where({batch_id:id}).orderBy('position').limit(50).offset((page-1)*50).select('position','external_id','rows','issues','outcome','record_id');
  return {...batch,documents,page,pages:Math.max(1,Math.ceil(batch.document_count/50))};
}
async function commit(db,scope,id) {
  // Serialize one chunk per batch; each document is imported inside a savepoint.
  return db.transaction(async trx=>{
    const batch=await trx('import_batches').where({...scope,id}).forUpdate().first(); fail(batch,'Import batch not found.',404);assertBatch(batch);
    fail(!['CANCELLED','PARTIAL','FAILED'].includes(batch.status),'This import was stopped. Create a new preview to continue remaining documents.',409);
    assertBatch(batch,true);
    if(batch.status==='COMPLETED') return batch;
    // Whole-file validation: no business records are written until every row passes.
    fail(batch.error_count===0,'Fix all blocking errors and preview the file again before importing.',409);
    const cfg=getResource(batch.resource,batch.dataset_id); const size=cfg.grouped?50:250;
    const docs=await trx('import_documents').where({batch_id:id}).where('position','>=',batch.cursor).orderBy('position').limit(size);
    let imported=batch.imported,skipped=batch.skipped,errors=batch.error_count;
    for(const doc of docs) {
      if(doc.outcome!=='PENDING') continue;
      try {
        const result=await trx.transaction(async savepoint=>{
          // References and current duplicate rules are revalidated at commit time.
          const rows=doc.rows.map(({__row,...row})=>row);
          const normalized=await normalize(savepoint,scope,batch.resource,rows);assertCreate(batch.resource,normalized.data?.kind);
          return insertRecord(savepoint,scope,batch.resource,normalized,actorLabel('csv-import'));
        });
        const outcome=result.skipped?'SKIPPED':'IMPORTED'; result.skipped?skipped++:imported++;
        await trx('import_documents').where({batch_id:id,position:doc.position}).update({outcome,record_id:result.record.id});
      } catch(e) {
        errors++;
        const issues=[...doc.issues,{severity:'error',row:doc.rows[0].__row,external_id:doc.external_id,field:'document',value:'',reason:e.status?e.message:'Document transaction rolled back. Preview a new batch after resolving the database error.'}];
        await trx('import_documents').where({batch_id:id,position:doc.position}).update({outcome:'FAILED',issues:JSON.stringify(issues)});
      }
    }
    const cursor=docs.length?docs[docs.length-1].position+1:batch.document_count;
    const status=errors?'FAILED':cursor>=batch.document_count?'COMPLETED':'COMMITTING';
    await trx('import_batches').where({id}).update({cursor,status,imported,skipped,error_count:errors});
    return {id,status,cursor,document_count:batch.document_count,imported,skipped,error_count:errors};
  });
}
async function cancel(db,scope,id) {
  return db.transaction(async trx=>{
    const batch=await trx('import_batches').where({...scope,id}).forUpdate().first(); fail(batch,'Batch not found.',404);assertBatch(batch,true);
    fail(['PREVIEWED','COMMITTING'].includes(batch.status),'Only pending imports can be stopped.',409);
    await trx('import_batches').where({id}).update({status:batch.cursor?'PARTIAL':'CANCELLED'});
    return {status:batch.cursor?'PARTIAL':'CANCELLED',retainedDocuments:batch.imported};
  });
}
function csv(rows,fields) { return Papa.unparse({fields,data:rows.map(r=>fields.map(k=>safeCell(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])))},{newline:'\r\n'}); }
async function exportRecords(db,scope,resource,filters) {
  const cfg=getResource(resource,scope.dataset_id); const records=await filtered(db,scope,resource,filters).select('*').orderBy('external_id').limit(10001);
  fail(records.length<=10000,'Export exceeds the 10,000-record synchronous limit. Narrow the filters.',413);
  const rows=[];
  for(const record of records) {
    const base={...record.data,external_id:record.external_id,name:record.name,status:record.status,dataset:scope.dataset_id};
    if(cfg.grouped && scope.dataset_id!==NW) {
      const lines=await db('document_lines as l').join('records as i','i.id','l.item_id').where({'l.document_id':record.id,'l.company_id':scope.company_id,'l.dataset_id':scope.dataset_id}).select('l.*','i.external_id as item_external_id');
      for(const l of lines) rows.push({...base,line_id:l.external_line_id,item_id:l.item_external_id,quantity:l.uom==='g'?Number(l.quantity)/1000:l.quantity,rate:Number(l.unit_price_minor)/100});
    } else rows.push(base);
  }
  if(['cashbook','journals','payslips'].includes(resource)){
    const rows=[];
    for(const r of records){if(resource==='journals'){const legs=await db('finance_journal_lines').where({...scope,journal_id:r.id}).orderBy('line_no');for(const leg of legs)rows.push({external_id:r.external_id,status:r.status,date:r.business_date,kind:r.data.kind,account:leg.account,debit_minor:leg.debit_minor,credit_minor:leg.credit_minor,currency:'BDT'});}else rows.push({external_id:r.external_id,status:r.status,date:r.business_date,...r.data});}
    const fields=[...new Set(rows.flatMap(r=>Object.keys(r)))];return csv(rows,fields.length?fields:['external_id','status','date']);
  }
  const fields=scope.dataset_id===NW?['external_id','name','status','dataset','source_json']:['external_id','status','dataset',...cfg.fields.map(f=>f.key).filter(k=>k!=='external_id')];
  if(resource==='tasks')fields.push('baseline_start','baseline_due_date','actual_start','actual_completed','version');
  return csv(rows.map(r=>scope.dataset_id===NW?{...r,source_json:JSON.stringify(r)}:r),fields);
}
async function errorCSV(db,scope,id) {
  await getBatch(db,scope,id);
  const docs=await db('import_documents').where({batch_id:id}).orderBy('position').select('issues');
  return csv(docs.flatMap(d=>d.issues),['severity','row','external_id','field','value','reason']);
}
async function history(db,scope,page=1){page=integer(String(page),'Page',{min:1,max:10000});const q=restrictBatches(db('import_batches').where(scope));const n=await q.clone().count('* as n').first();return {data:await q.clone().select('id','resource','filename','status','row_count','document_count','cursor','imported','skipped','error_count','warning_count','created_at').orderBy('created_at','desc').limit(25).offset((page-1)*25),page,pages:Math.max(1,Math.ceil(Number(n.n)/25)),total:Number(n.n)};}
module.exports={history,LIMIT_BYTES,LIMIT_ROWS,parseCSV,mappingFor,preview,getBatch,commit,cancel,csv,exportRecords,errorCSV};
