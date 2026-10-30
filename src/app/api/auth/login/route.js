import {database,assertContext} from '@/lib/db.js';import {login,cookie} from '@/lib/auth.js';import {jsonBody,errorResponse} from '@/lib/http.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(req){try{const db=database();await assertContext(db);const result=await login(db,req,await jsonBody(req));return Response.json({user:result.user},{headers:{'Set-Cookie':cookie(result.token),'Cache-Control':'no-store'}});}catch(e){const response=errorResponse(e);response.headers.set('Cache-Control','no-store');return response;}}
