import {createElement} from 'react';
import {notFound} from 'next/navigation';
import {requirePageUser} from './server-auth';
import {resolveRoute,routeAllowed,paramsOf,withQuery} from './workspace-routes';
export function workspaceMetadata(path){return {title:(resolveRoute(path)?.title||'Workspace')+' · SmartERP'};}
export async function workspacePage(path,searchParams){
 const params=paramsOf(searchParams),user=await requirePageUser(withQuery(path,params)),route=resolveRoute(path,params,user.role);
 if(!routeAllowed(user.role,route))notFound();
 return createElement('span',{className:'workspace-route-anchor','aria-hidden':true});
}
