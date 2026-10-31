const test=require('node:test'),assert=require('node:assert/strict');
const {ROUTES,LIST_DEFAULTS,paramsOf,readValues,queryPatch,resolveRoute,routeAllowed,hrefFor,documentKey,documentQuery,legacyHref}=require('../src/lib/workspace-routes.js');
const ID='00000000-0000-4000-8000-000000000099';
test('every module has a unique bookmarkable route and navigation round-trips to the same resource and namespace',()=>{
 assert.equal(new Set(ROUTES.map(r=>r.path)).size,ROUTES.length);assert.ok(ROUTES.length>=35);
 for(const r of ROUTES){const url=new URL(hrefFor(r.module,r.resource,r.kind,r.dataset,r.view,{},'admin'),'https://workspace.invalid'),resolved=resolveRoute(url.pathname,url.searchParams,'admin');assert.ok(resolved,r.path);assert.equal(resolved.resource,r.resource,r.path);assert.equal(resolved.dataset,r.dataset,r.path);assert.equal(resolved.kind,r.kind,r.path);assert.equal(routeAllowed('admin',resolved),true,r.path);}
});
test('page routes enforce existing role policy without relying on menu visibility or query-supplied roles',()=>{
 for(const path of ['/finance/invoices','/finance/payments','/finance/supplier-bills','/people/employees','/people/payroll','/reports/financial','/reports/collections','/management-brief'])assert.equal(routeAllowed('operations',resolveRoute(path)),false,path);
 for(const path of ['/sales/orders','/purchases/bills','/inventory/items','/reports/sales','/order-control','/planning/calendar'])assert.equal(routeAllowed('operations',resolveRoute(path)),true,path);
 assert.equal(routeAllowed('unknown',resolveRoute('/apps')),false);
 assert.equal(routeAllowed('finance',resolveRoute('/imports',{},'finance')),true);assert.equal(resolveRoute('/imports',{},'finance').resource,'invoices');
 assert.equal(routeAllowed('operations',resolveRoute('/imports',{resource:'payroll'})),false);
});
test('URL query cannot retarget a route to another resource, dataset, document kind or privileged report',()=>{
 const r=resolveRoute('/sales/orders',{dataset:'northwind-history',resource:'payroll',kind:'SALES',view:'report',role:'admin'});assert.equal(r.resource,'sales');assert.equal(r.dataset,'smarterp-demo');assert.equal(r.view,'list');
 assert.equal(resolveRoute('/sales/orders',{view:'charts'}).view,'charts');assert.equal(resolveRoute('/finance/invoices',{kind:'PURCHASE'}).kind,'SALES');
 for(const path of ['/unknown','//sales/orders','/sales/../finance/invoices','/history/northwind/bom'])assert.equal(resolveRoute(path),null);
 assert.equal(resolveRoute('/imports',{dataset:'other-tenant'}),null);assert.equal(resolveRoute('/imports',{resource:'journals'}),null);assert.equal(resolveRoute('/imports',{dataset:'uci-garment-history',resource:'sales'}),null);
});
test('record permalinks preserve namespace and list filters; closing only removes the selected document',()=>{
 const p=new URLSearchParams('buyer=CUS-1&page=3&status=Confirmed');const next=documentQuery(p,{id:ID,resource:'sales',dataset:'northwind-history'},resolveRoute('/history/northwind/sales'));
 assert.deepEqual(documentKey(next,resolveRoute('/history/northwind/sales')),{id:ID,resource:'sales',dataset:'northwind-history'});assert.equal(next.get('page'),'3');assert.equal(next.get('buyer'),'CUS-1');
 const closed=documentQuery(next,null);assert.equal(closed.get('record'),null);assert.equal(closed.get('status'),'Confirmed');assert.equal(closed.get('page'),'3');
 assert.equal(documentKey({record:'not-uuid',record_resource:'sales'},resolveRoute('/apps')),null);assert.equal(documentKey({record:ID,record_resource:'../../payroll'},resolveRoute('/apps')),null);assert.equal(documentKey({record:ID,record_resource:'sales',record_dataset:'other-company'},resolveRoute('/apps')),null);
});
test('legacy links resolve to canonical pages with document identity, overdue scope and historical namespace intact',()=>{
 assert.equal(legacyHref({workspace:'finance-report'}),'/reports/financial');assert.equal(legacyHref({workspace:'approvals'}),'/approvals');assert.equal(legacyHref({workspace:'calendar-overdue'}),'/planning/calendar?overdue=1');assert.equal(legacyHref({workspace:'order-control'}),'/order-control');
 const url=new URL(legacyHref({record:ID,resource:'sales',dataset:'northwind-history'}),'https://workspace.invalid');assert.equal(url.pathname,'/apps');assert.equal(url.searchParams.get('record_resource'),'sales');assert.equal(url.searchParams.get('record_dataset'),'northwind-history');
 assert.equal(legacyHref({workspace:'https://outside.invalid'}),'/apps');
});
test('query state preserves explicit All/empty filters, bounded page parsing and unrelated document parameters',()=>{
 const initial='status=Approved&page=2&record='+ID,next=queryPatch(initial,{status:'',page:1},{status:'Pending',page:1});assert.equal(next.get('status'),'');assert.equal(next.get('record'),ID);assert.equal(readValues(next,{status:'Pending'}).status,'');assert.equal(readValues('',{status:'Pending'}).status,'Pending');
 const reset=queryPatch('search=hello&buyer=CUS-1&page=5&record='+ID,LIST_DEFAULTS,LIST_DEFAULTS);assert.equal(reset.get('search'),null);assert.equal(reset.get('page'),null);assert.equal(reset.get('record'),ID);
 assert.equal(readValues('page=-2',LIST_DEFAULTS).page,1);assert.equal(readValues('page=100000000000000000000000',LIST_DEFAULTS).page,1);assert.equal(readValues('page=4',LIST_DEFAULTS).page,4);assert.equal(readValues('overdue=1',{overdue:false}).overdue,true);
 assert.equal(paramsOf({buyer:['CUS-1','CUS-2']}).get('buyer'),'CUS-1');
});
