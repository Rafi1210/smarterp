const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const Papa=require('papaparse');
const {getResource}=require('../src/lib/registry.js');
function verifyBusinessPack(root=path.resolve(__dirname,'../data/business-pack')){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 if(manifest.id!=='business-analysis-ba26-v1'||manifest.namespace!=='smarterp-demo'||!Array.isArray(manifest.files)||manifest.files.length!==11)throw Error('Unknown business training pack.');
 const names=new Set();let total=0;
 for(const entry of manifest.files){
  if(!/^\d{2}-[a-z-]+\.csv$/.test(entry.file)||names.has(entry.file))throw Error('Unsafe or duplicate pack filename.');names.add(entry.file);
  const target=path.join(root,entry.file),stat=fs.lstatSync(target);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Expected an ordinary pack source file: '+entry.file);
  const bytes=fs.readFileSync(target);if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Business-pack source integrity mismatch: '+entry.file);
  if(bytes.length>2000000)throw Error('Pack CSV exceeds the 2 MB upload cap.');
  const parsed=Papa.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes),{header:true,skipEmptyLines:'greedy'});
  if(parsed.errors.length||parsed.data.length!==entry.rows||entry.rows>5000||JSON.stringify(parsed.meta.fields)!==JSON.stringify(entry.columns))throw Error('CSV shape mismatch: '+entry.file);
  const cfg=getResource(entry.resource,manifest.namespace);if(cfg.readOnly||cfg.fields.some(f=>f.required&&!parsed.meta.fields.includes(f.key)))throw Error('CSV is missing required import fields: '+entry.file);
  if(parsed.meta.fields.includes('status')||parsed.meta.fields.includes('posted'))throw Error('Training sources must not claim posting statuses.');
  const keys=new Set();for(const row of parsed.data){const key=row.external_id+':'+(row.line_id||'');if(keys.has(key))throw Error('Duplicate source key in '+entry.file);keys.add(key);}
  total+=entry.rows;
 }
 return {verifiedFiles:names.size,rows:total,algorithm:'SHA-256',originalBytes:true,synthetic:true,transactionImports:'Draft only',databaseTouched:false};
}
if(require.main===module){try{console.log(JSON.stringify(verifyBusinessPack()));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={verifyBusinessPack};
