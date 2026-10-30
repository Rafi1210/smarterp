import { database, assertContext } from '@/lib/db.js';
import { buildContext } from '@/lib/deployment';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(){const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};const release={commit:buildContext.commit,branch:buildContext.branch,context:buildContext.context};try { const db=database(); await assertContext(db); await db.raw('select 1'); return Response.json({status:'ready',database:'connected',environment:process.env.APP_ENV||'development',release},{headers}); } catch { return Response.json({status:'not-ready',database:'unavailable',release}, {status:503,headers}); }}
