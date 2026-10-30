import {database,assertContext} from '@/lib/db.js';import {logout,cookie} from '@/lib/auth.js';import {errorResponse} from '@/lib/http.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(req){try{const db=database();await assertContext(db);await logout(db,req);return Response.json({signed_out:true},{headers:{'Set-Cookie':cookie('',true),'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
