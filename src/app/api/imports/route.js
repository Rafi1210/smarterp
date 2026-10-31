import {guard} from '@/lib/access.js';
import {preview,getBatch,commit,cancel,errorCSV,history} from '@/lib/services/imports.js';
import {COMPANY,DEMO} from '@/lib/registry.js';
import {fail} from '@/lib/core.js';
import {readBytes} from '@/lib/http.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function batchID(value){const id=String(value||'');fail(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id),'Choose a valid import batch.');return id;}
function mapping(value){try{return value?JSON.parse(String(value)):null;}catch{fail(false,'Column mapping is not valid JSON.');}}
export const POST=guard(async(db,user,req)=>{
 const bytes=await readBytes(req,2100000);
 let form;try{form=await new Response(bytes,{headers:{'Content-Type':req.headers.get('content-type')||''}}).formData();}catch{fail(false,'Send a valid CSV upload form.');}
 const scope={company_id:COMPANY,dataset_id:String(form.get('dataset')||DEMO)},action=form.get('action');
 if(action==='commit')return Response.json(await commit(db,scope,batchID(form.get('id'))));
 if(action==='cancel')return Response.json(await cancel(db,scope,batchID(form.get('id'))));
 fail(action==='preview','Unknown import action.');
 const file=form.get('file');fail(file&&typeof file.arrayBuffer==='function'&&file.size>0&&file.size<=2000000,'Choose a nonempty CSV up to 2 MB.');
 return Response.json(await preview(db,scope,{resource:String(form.get('resource')),buffer:Buffer.from(await file.arrayBuffer()),filename:file.name,mapping:mapping(form.get('mapping'))}));
},true);
export const GET=guard(async(db,user,req)=>{
 const p=new URL(req.url).searchParams,scope={company_id:COMPANY,dataset_id:p.get('dataset')||DEMO};
 if(!p.get('id'))return Response.json(await history(db,scope,p.get('page')||1,p.get('resource')||''));
 const id=batchID(p.get('id'));
 if(p.get('view')==='errors')return new Response(await errorCSV(db,scope,id),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="import-errors.csv"'}});
 return Response.json(await getBatch(db,scope,id,p.get('page')||1,p.get('issue')||'all'));
});
