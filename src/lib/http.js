const {fail}=require('./core.js');
async function readBytes(req,limit){fail(Number(req.headers.get('content-length')||0)<=limit,'Request body exceeds the allowed limit.',413);const reader=req.body?.getReader();fail(reader,'Request body is required.');const chunks=[];let total=0;try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;fail(total<=limit,'Request body exceeds the allowed limit.',413);chunks.push(Buffer.from(value));}}catch(e){await reader.cancel();throw e;}return Buffer.concat(chunks,total);}
async function jsonBody(req){const bytes=await readBytes(req,64000);try{return JSON.parse(bytes.toString('utf8'))}catch{fail(false,'Invalid JSON request.');}}
function errorResponse(e){return Response.json({error:e.status?e.message:'The request could not complete. Check database readiness.',details:e.status?e.details:undefined},{status:e.status||503});}
module.exports={readBytes,jsonBody,errorResponse};
