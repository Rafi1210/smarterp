import {guard} from '@/lib/access.js';
import {COMPANY,DEMO} from '@/lib/registry.js';
import {report,exportReport} from '@/lib/services/business-reports.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=guard(async(db,user,req)=>{
 const params=Object.fromEntries(new URL(req.url).searchParams),type=params.type||'sales';
 const result=await report(db,{company_id:COMPANY,dataset_id:params.dataset||DEMO},type,params);
 if(params.view==='csv')return new Response(exportReport(result),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${type}-business-analysis.csv"`,'Cache-Control':'no-store'}});
 const {export_buyers,export_rows,...data}=result;return Response.json(data,{headers:{'Cache-Control':'no-store'}});
});
