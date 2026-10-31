import {guard} from '@/lib/access.js';
import {COMPANY,DEMO} from '@/lib/registry.js';
import {dashboard,exportDashboard} from '@/lib/services/analytics.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=guard(async(db,user,req)=>{
 const filters=Object.fromEntries(new URL(req.url).searchParams),data=await dashboard(db,{company_id:COMPANY,dataset_id:filters.dataset||DEMO},filters);
 if(filters.view==='csv')return new Response(exportDashboard(data),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="filtered-dashboard.csv"','Cache-Control':'no-store'}});
 return Response.json(data,{headers:{'Cache-Control':'no-store'}});
});
