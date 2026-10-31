const {canRead,canCreate,canAI}=require('./permissions.js');
const DEMO='smarterp-demo',NW='northwind-history',UCI='uci-garment-history';
const entries=[
 ['/apps','Apps','customers','apps','Applications'],['/overview','Overview','customers','overview','Business overview'],['/order-control','Order Control','sales','order-control','Order Control'],['/approvals','Approvals','purchases','approvals','Approval Inbox'],
 ['/sales/customers','Sales / CRM','customers','list','Customers'],['/sales/orders','Sales / CRM','sales','list','Inquiries / Quotes / Orders'],['/sales/deliveries','Sales / CRM','deliveries','list','Deliveries'],
 ['/merchandising/order-sheets','Merchandising','merchandising','list','Order Sheets & Handover'],
 ['/purchases/suppliers','Purchases','suppliers','list','Suppliers'],['/purchases/orders','Purchases','purchases','list','Purchase Orders'],['/purchases/receipts','Purchases','receipts','list','Goods Receipts'],['/purchases/bills','Purchases','invoices','list','Supplier Bills','PURCHASE'],
 ['/inventory/items','Inventory','items','list','Items & Stock'],['/inventory/opening-stock','Inventory','openings','list','Opening Stock'],['/inventory/movements','Inventory','movements','list','Stock Movements'],
 ['/manufacturing/bom','Manufacturing / QC','bom','list','Bills of Material'],['/manufacturing/work-orders','Manufacturing / QC','workorders','list','Work Orders / QC'],
 ['/planning/calendar','Planning','tasks','calendar','Time & Action calendar'],['/planning/milestones','Planning','tasks','list','Milestone Register'],
 ['/finance/invoices','Finance','invoices','list','Customer Invoices','SALES'],['/finance/supplier-bills','Finance','invoices','list','Supplier Bills','PURCHASE'],['/finance/payments','Finance','payments','list','Receipts & Payments'],['/finance/cashbook','Finance','cashbook','list','Cashbook'],['/finance/ledger','Finance','journals','list','Selected-event Ledger'],
 ['/people/employees','People / Payroll','employees','list','Employees'],['/people/attendance','People / Payroll','attendance','list','Attendance'],['/people/payroll','People / Payroll','payroll','list','Payroll Runs'],['/people/payslips','People / Payroll','payslips','list','Paid Payslips'],
 ['/reports/sales','Reports','sales','business-sales','Sales & Buyer Health'],['/reports/collections','Reports','payments','business-collections','Collection Priority'],['/reports/financial','Reports','invoices','report','Financial Snapshot'],['/reports/inventory','Reports','items','inventory-report','Inventory Availability'],
 ['/management-brief','Management Brief','invoices','brief','Management Brief'],['/imports','Imports','customers','imports','Import Center']
];
const ROUTES=entries.map(([path,module,resource,view,title,kind=''])=>({path,module,resource,view,title,kind,dataset:DEMO}));
for(const [resource,title]of [['customers','Customers'],['suppliers','Suppliers'],['items','Items'],['employees','Employees'],['sales','Orders']])ROUTES.push({path:'/history/northwind/'+resource,module:'Reports',resource,view:'list',title:'Northwind '+title,kind:'',dataset:NW});
ROUTES.push({path:'/history/garment-productivity',module:'Reports',resource:'productivity',view:'list',title:'Garment Productivity',kind:'',dataset:UCI});
const RESOURCES=['customers','suppliers','items','sales','merchandising','purchases','receipts','bom','openings','workorders','deliveries','tasks','invoices','productivity','employees','attendance','payroll','payslips','payments','cashbook','journals','movements'];
const DATASETS=[DEMO,NW,UCI],UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const LIST_DEFAULTS={search:'',status:'',from:'',to:'',sort:'created_at',direction:'desc',size:'25',group:'',lifecycle:'active',buyer:'',date_basis:'document',page:1};
const DOCUMENT_KEYS=['record','record_resource','record_dataset'];
function paramsOf(input){if(typeof input==='string')return new URLSearchParams(input);if(input instanceof URLSearchParams)return new URLSearchParams(input);if(input&&typeof input.toString==='function'&&typeof input.get==='function')return new URLSearchParams(input.toString());const p=new URLSearchParams();for(const [key,value]of Object.entries(input||{}))if(value!==undefined&&value!==null)p.set(key,Array.isArray(value)?String(value[0]||''):String(value));return p;}
function readValues(input,defaults){const p=paramsOf(input),result={};for(const [key,value]of Object.entries(defaults)){const raw=p.get(key);if(raw===null)result[key]=value;else if(typeof value==='number')result[key]=/^\d+$/.test(raw)&&Number.isSafeInteger(Number(raw))&&Number(raw)>0?Number(raw):value;else if(typeof value==='boolean')result[key]=raw==='1';else result[key]=raw;}return result;}
function queryPatch(input,patch,defaults={}){const p=paramsOf(input);for(const [key,value]of Object.entries(patch)){if(value===null||value===undefined||Object.hasOwn(defaults,key)&&String(value)===String(defaults[key])||(value===''||value===false)&&!Object.hasOwn(defaults,key))p.delete(key);else p.set(key,value===true?'1':value===false?'0':String(value));}return p;}
function withQuery(path,input){const p=paramsOf(input);return path+(p.size?'?'+p.toString():'');}
function resolveRoute(path,input={},role='admin'){
 const descriptor=ROUTES.find(r=>r.path===path);if(!descriptor)return null;
 const p=paramsOf(input),r={...descriptor};
 if(r.view==='list'&&p.get('view')==='charts')r.view='charts';
 if(r.view==='imports'){
  r.dataset=p.get('dataset')||DEMO;r.resource=p.get('resource')||(role==='finance'?'invoices':'customers');
  if(!DATASETS.includes(r.dataset)||!RESOURCES.includes(r.resource)||['movements','cashbook','journals','payslips'].includes(r.resource))return null;
  if(r.dataset===NW&&!['customers','suppliers','items','employees','sales'].includes(r.resource))return null;
  if(r.dataset===UCI&&r.resource!=='productivity'||r.dataset!==UCI&&r.resource==='productivity')return null;
 }
 return r;
}
function routeAllowed(role,r){if(!r)return false;if(r.view==='brief')return canAI(role);if(['report','business-collections'].includes(r.view))return canRead(role,'payments');if(r.view==='imports')return canCreate(role,r.resource);if(r.module==='Finance'&&role==='operations')return false;return canRead(role,r.resource,r.kind);}
function routeFor(module,resource,kind='',dataset=DEMO,view='list'){
 const special={Apps:'apps',Overview:'overview','Order Control':'order-control',Approvals:'approvals','Management Brief':'brief',Imports:'imports'};
 const mode=special[module]||view;
 if(mode==='calendar-overdue')return ROUTES.find(r=>r.view==='calendar');
 if(dataset!==DEMO&&mode!=='imports')return ROUTES.find(r=>r.dataset===dataset&&r.resource===resource)||null;
 if(!['list','charts'].includes(mode))return ROUTES.find(r=>r.view===mode)||null;
 return ROUTES.find(r=>r.module===module&&r.resource===resource&&r.kind===(kind||'')&&r.view==='list')||ROUTES.find(r=>r.resource===resource&&r.kind===(kind||'')&&r.view==='list'&&r.dataset===dataset)||null;
}
function hrefFor(module,resource,kind='',dataset=DEMO,view='list',preset={},role='admin'){
 if(module==='Imports'&&role==='finance'&&!canCreate(role,resource))resource='invoices';
 const r=routeFor(module,resource,kind,dataset,view);if(!r)return '/apps';
 let p=queryPatch(new URLSearchParams(),preset,LIST_DEFAULTS);
 if(view==='charts')p.set('view','charts');if(view==='calendar-overdue')p.set('overdue','1');
 if(r.view==='imports'){p.set('resource',resource);if(dataset!==DEMO)p.set('dataset',dataset);}
 return withQuery(r.path,p);
}
function documentKey(input,route){const p=paramsOf(input),id=p.get('record');if(!id)return null;const resource=p.get('record_resource')||route?.resource,dataset=p.get('record_dataset')||route?.dataset||DEMO;if(!UUID.test(id)||!RESOURCES.includes(resource)||!DATASETS.includes(dataset))return null;return {id,resource,dataset};}
function documentQuery(input,record,route){const patch=Object.fromEntries(DOCUMENT_KEYS.map(k=>[k,null]));if(record){patch.record=record.id;patch.record_resource=record.resource||route.resource;patch.record_dataset=record.dataset_id||record.dataset||route.dataset;}return queryPatch(input,patch);}
function legacyHref(input){const p=paramsOf(input),workspace=p.get('workspace'),targets={'finance-report':'/reports/financial',approvals:'/approvals','calendar-overdue':'/planning/calendar','order-control':'/order-control'};let target=targets[workspace]||'/apps';if(workspace==='calendar-overdue')p.set('overdue','1');p.delete('workspace');if(p.get('record')&&p.get('resource')){p.set('record_resource',p.get('resource'));p.delete('resource');if(DATASETS.includes(p.get('dataset')))p.set('record_dataset',p.get('dataset'));}return withQuery(target,p);}
module.exports={ROUTES,RESOURCES,DATASETS,LIST_DEFAULTS,DOCUMENT_KEYS,paramsOf,readValues,queryPatch,withQuery,resolveRoute,routeAllowed,routeFor,hrefFor,documentKey,documentQuery,legacyHref};
