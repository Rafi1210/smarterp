import {cookies} from 'next/headers';import {redirect} from 'next/navigation';import {database,assertContext} from './db.js';import {authenticate,COOKIE} from './auth.js';
export async function pageUser(){const store=await cookies(),db=database();await assertContext(db);return authenticate(db,new Request('http://localhost/',{headers:{cookie:COOKIE+'='+(store.get(COOKIE)?.value||'')}}));}
export async function requirePageUser(returnTo='/'){try{return await pageUser();}catch{redirect('/login?returnTo='+encodeURIComponent(returnTo));}}
export function safeReturnTo(value){return typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')&&!/[\\\r\n]/.test(value)&&!value.startsWith('/login')?value:'/';}
