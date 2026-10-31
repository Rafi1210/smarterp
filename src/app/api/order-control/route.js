import {guard} from '@/lib/access.js';
import {COMPANY,DEMO} from '@/lib/registry.js';
import {orderControl,exportControl} from '@/lib/services/order-control.js';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=guard(async(db,user,req)=>{
 const filters=Object.fromEntries(new URL(req.url).searchParams);
 const data=await orderControl(db,{company_id:COMPANY,dataset_id:filters.dataset||DEMO},filters);
 if(filters.view==='csv')return new Response(exportControl(data),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="order-control.csv"'}});
 const {export_rows,...publicData}=data;
 return Response.json(publicData);
});
