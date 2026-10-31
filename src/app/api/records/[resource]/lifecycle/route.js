import {guard} from '@/lib/access.js';
import {jsonBody} from '@/lib/http.js';
import {COMPANY,DEMO,getResource} from '@/lib/registry.js';
import {command} from '@/lib/services/lifecycle.js';
export const runtime='nodejs';
export const POST=guard(async(db,user,req,{params})=>{
  const {resource}=await params,body=await jsonBody(req),scope={company_id:COMPANY,dataset_id:body.dataset||DEMO};
  getResource(resource,scope.dataset_id);
  return Response.json(await command(db,scope,resource,body.id,body));
},true);
