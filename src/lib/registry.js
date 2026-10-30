const { z } = require('zod');
const { AppError, fail, exact, integer, date, stableHash, calendar } = require('./core.js');
const COMPANY = '00000000-0000-4000-8000-000000000001';
const DEMO = 'smarterp-demo';
const NW = 'northwind-history';
const UCI = 'uci-garment-history';
const field = (key, label, required = true) => ({ key, label:label||key.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase()).replace(/\bId\b/g,'code'), required });
const basic = [field('external_id', 'External ID'), field('name', 'Name')];
const grouped = [field('external_id', 'Document ID'), field('line_id', 'Line ID'), field('date', 'Business date'), field('item_id', 'Item external ID'), field('quantity', 'Quantity'), field('rate', 'Unit price')];
const registry = {
  tasks:{label:'T&A milestones',module:'Planning',fields:[field('external_id','Task no.'),field('source_sales_id','Sales order no.'),field('title','Task title'),field('milestone','Milestone code'),field('planned_start','Planned start'),field('due_date','Due date'),field('owner','Responsible team',false),field('priority','Low / Normal / High',false),field('depends_on','Prerequisite task no.',false)],chart:'Milestones by progress'},
  merchandising: {label:'Merchandising order sheets',module:'Merchandising',fields:[field('external_id','Order sheet no.'),field('source_sales_id','Sales order no.'),field('bom_id','Approved BOM code'),field('style_code','Style code'),field('style_name','Style name'),field('fabric_spec','Fabric specification'),field('delivery_date','Target delivery date'),field('buyer_reference','Buyer PO / reference',false),field('notes','Production / quality notes',false)],chart:'Order sheets by review status'},
  attendance: {label:'Attendance summaries',module:'People',fields:[field('external_id'),field('employee_id'),field('period'),field('scheduled_days'),field('present_days'),field('paid_leave_days')],chart:'Attendance summaries by state'},
  payments: {label:'Receipts & payments',module:'Finance',fields:[field('external_id'),field('kind','CUSTOMER / SUPPLIER / SALARY'),field('target_id','Invoice or payroll external ID'),field('amount','Payment amount (BDT)'),field('date'),field('reference','Bank / cash reference',false)],chart:'Payment documents by state'},
  cashbook: {label:'Cashbook',module:'Finance',readOnly:true,fields:[],chart:'Posted cash movement by day'},
  journals: {label:'Selected-event ledger',module:'Finance',readOnly:true,fields:[],chart:'Selected financial events by type'},
  payslips: {label:'Paid payslips',module:'People',readOnly:true,fields:[],chart:'Paid payslips by period'},

  openings: { label: 'Opening stock drafts', module: 'Inventory', fields: [field('external_id'),field('item_id'),field('quantity'),field('date')], chart: 'Opening documents by state' },
  receipts: { label: 'Goods receipts', module: 'Purchases', fields: [field('external_id'),field('purchase_id'),field('date')], chart: 'Goods receipts by state' },
  deliveries: { label: 'Deliveries', module: 'Sales', fields: [field('external_id'),field('workorder_id'),field('date')], chart: 'Deliveries by state' },
  movements: { label: 'Stock movement ledger', module: 'Inventory', readOnly: true, fields: [], chart: 'Movements by kind' },
  customers: { label: 'Customers', module: 'Sales', fields: [...basic, field('email', 'Email', false), field('country', 'Country', false)], chart: 'Customers by country' },
  suppliers: { label: 'Suppliers', module: 'Purchases', fields: [...basic, field('email', 'Email', false), field('country', 'Country', false)], chart: 'Suppliers by country' },
  items: { label: 'Items', module: 'Inventory', fields: [...basic, field('uom', 'Unit: kg or pieces'), field('kind', 'raw or finished'), field('reorder_level', 'Reorder level', false)], chart: 'Items by base unit' },
  employees: { label: 'Employees', module: 'People', fields: [...basic, field('department', 'Department')], chart: 'Headcount by department' },
  sales: { label: 'Sales documents', module: 'Sales', grouped: true, fields: [...grouped, field('customer_id', 'Customer external ID')], chart: 'Sales documents by stage' },
  purchases: { label: 'Purchase orders', module: 'Purchases', grouped: true, fields: [...grouped, field('supplier_id', 'Supplier external ID'), field('source_sales_id', 'Sales document external ID')], chart: 'Purchase documents by stage' },
  bom: { label: 'Bills of material', module: 'Manufacturing', fields: [field('external_id'), field('name'), field('finished_item_id'), field('component_item_id'), field('kg_per_piece')], chart: 'BOMs by state' },
  workorders: { label: 'Work orders', module: 'Manufacturing', fields: [field('external_id'), field('source_sales_id'), field('bom_id'), field('quantity'), field('date')], chart: 'Work orders by stage' },
  invoices: { label: 'Invoices & supplier bills', module: 'Finance', fields: [field('external_id'), field('kind'), field('source_id'), field('date'), field('due_date'),field('amount','Declared invoice / bill total (BDT)',false)], chart: 'Invoices by kind' },
  payroll: { label: 'Payroll runs', module: 'People', fields: [field('external_id'), field('employee_id'), field('period'), field('basic'), field('allowance'), field('extra'), field('deduction'), field('attendance_days'),field('attendance_id','Attendance summary external ID',false)], chart: 'Payroll documents by stage' },
  productivity: { label: 'Garment productivity', module: 'Reports', fields: ['date','quarter','department','day','team','targeted_productivity','smv','wip','over_time','incentive','idle_time','idle_men','no_of_style_change','no_of_workers','actual_productivity'].map(k => field(k, k, k !== 'wip')), chart: 'Unweighted team-day productivity' },
};
const text = (s, name, max = 200) => {
  const result = z.string().trim().min(1).max(max).safeParse(s);
  fail(result.success, `${name} is required (maximum ${max} characters).`); return result.data;
};
function getResource(resource, dataset = DEMO) {
  const config = registry[resource];
  fail(config, 'Unknown resource.', 404);
  fail([DEMO, NW, UCI].includes(dataset), 'Unknown dataset namespace.', 404);
  fail(dataset === DEMO ? resource !== 'productivity' : dataset === UCI ? resource === 'productivity' : ['customers','suppliers','items','employees','sales'].includes(resource), 'This resource is not available in the selected dataset.', 400);
  return config;
}
function schemas() { return Object.fromEntries(Object.entries(registry).map(([k, v]) => [k, { ...v }])); }
async function normalize(db, scope, resource, rawRows) {
  const cfg = getResource(resource, scope.dataset_id);
  fail(!cfg.readOnly, 'This ledger is generated by explicit business actions and cannot be uploaded.');
  fail(Array.isArray(rawRows) && rawRows.length > 0 && rawRows.length <= 100, 'Provide 1–100 rows.');
  const data = Object.fromEntries(Object.entries(rawRows[0]).map(([k, v]) => [k, String(v ?? '').trim()]));
  let refs = [], taskDependency=null;
  const ref = async (type, ext) => {
    const found = await db('records').where({ ...scope, resource: type, external_id: ext }).first();
    fail(found, `${type} reference '${ext}' does not exist in this company and namespace.`);
    refs.push({ id: found.id, relation: type }); return found;
  };
  if (resource === 'productivity') {
    const raw = rawRows[0];
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(data.date);
    const iso = match ? `${match[3]}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}` : data.date;
    date(iso);
    const numeric = {};
    for (const key of ['team','targeted_productivity','smv','wip','over_time','incentive','idle_time','idle_men','no_of_style_change','no_of_workers','actual_productivity']) {
      if (key === 'wip' && data[key] === '') { numeric[key] = null; continue; }
      fail(data[key] !== '' && Number.isFinite(Number(data[key])) && Number(data[key]) >= 0 && Number(data[key]) <= 1e9, `${key} must be a finite nonnegative number.`);
      numeric[key] = Number(data[key]);
    }
    integer(data.team, 'Team', { min: 1, max: 1000 });
    const dept = text(data.department, 'Department').toLowerCase();
    const issues = [];
    if (numeric.wip === null) issues.push({ field: 'wip', reason: 'Missing source WIP preserved as null, not zero.' });
    if (numeric.actual_productivity > 1) issues.push({ field: 'actual_productivity', reason: 'Source productivity exceeds 1; preserved without clipping.' });
    if (!Number.isInteger(numeric.no_of_workers)) issues.push({ field: 'no_of_workers', reason: 'Fractional source worker count preserved; not enterprise headcount.' });
    if (raw.department !== raw.department.trim() || dept === 'sweing') issues.push({ field: 'department', reason: 'Raw department label preserved alongside normalized label.' });
    return { external_id: data.__external_id || `UCI-${stableHash(raw).slice(0,24)}`, name: `${iso} · ${dept === 'sweing' ? 'sewing' : dept} · Team ${data.team}`, status: 'Historical', business_date: iso, data: { ...raw, ...numeric, source_date: raw.date, normalized_date: iso, department_raw: raw.department, department_normalized: dept === 'sweing' ? 'sewing' : dept, quarter_note: 'Source quarter label is not a calendar quarter.' }, lines: [], refs, warnings: issues };
  }
  const external_id = text(data.external_id, 'External ID', 80);
  const historical = scope.dataset_id === NW;
  let name = data.name || external_id, status = historical ? 'Historical' : 'Active', business_date = null, lines = [];
  if(resource === 'tasks'){
    const so=await ref('sales',data.source_sales_id);fail(['Confirmed','Delivered'].includes(so.status),'A T&A milestone must reference a confirmed Sales Order.');
    const {MILESTONES}=require('./workspace-config.js');fail(Object.hasOwn(MILESTONES,data.milestone),'Choose a supported T&A milestone code.');
    data.title=text(data.title,'Task title',180);data.planned_start=date(data.planned_start,'Planned start');data.due_date=date(data.due_date,'Due date');fail(data.planned_start<=data.due_date,'Planned start must not follow the due date.');
    fail(data.planned_start>=calendar(so.business_date),'Planning cannot begin before the source Sales Order.');
    if(data.owner)text(data.owner,'Responsible team',120);data.priority=data.priority||'Normal';fail(['Low','Normal','High'].includes(data.priority),'Priority must be Low, Normal or High.');
    if(data.depends_on){const dependency=await ref('tasks',data.depends_on);fail(dependency.data.source_sales_id===data.source_sales_id,'Prerequisite must belong to the same Sales Order.');taskDependency=dependency;}
    data.baseline_start=data.planned_start;data.baseline_due_date=data.due_date;data.version=0;business_date=data.due_date;name=data.title;status='Draft';
  } else if(resource === 'merchandising'){
    const so=await ref('sales',data.source_sales_id),bom=await ref('bom',data.bom_id);
    const ls=await db('document_lines').where({...scope,document_id:so.id});
    fail(ls.length===1,'Merchandising currently supports one finished style per Sales Order.');
    const item=await db('records').where({...scope,id:ls[0].item_id}).first();
    fail(item?.data.kind==='finished'&&item.external_id===bom.data.finished_item_id,'BOM finished item must match the Sales Order style.');
    for(const key of ['style_code','style_name','fabric_spec'])data[key]=text(data[key],key,key==='fabric_spec'?500:160);
    if(data.notes)text(data.notes,'Notes',1000);if(data.buyer_reference)text(data.buyer_reference,'Buyer reference',120);
    data.delivery_date=date(data.delivery_date,'Target delivery date');fail(data.delivery_date>=calendar(so.business_date),'Target delivery cannot predate the Sales Order.');
    data.finished_item_id=item.external_id;data.quantity=ls[0].quantity;business_date=calendar(so.business_date);name=`${data.style_code} · ${data.style_name}`;status='Draft';
  } else if(resource === 'attendance'){
    const employee=await ref('employees',data.employee_id);fail(/^\d{4}-(0[1-9]|1[0-2])$/.test(data.period),'Period must be YYYY-MM.');const [year,month]=data.period.split('-').map(Number);const days=new Date(Date.UTC(year,month,0)).getUTCDate();
    for(const key of ['scheduled_days','present_days','paid_leave_days'])data[key]=integer(data[key],key,{max:days});fail(data.scheduled_days>0&&data.present_days+data.paid_leave_days<=data.scheduled_days,'Present and paid leave days cannot exceed scheduled days.');data.absent_days=data.scheduled_days-data.present_days-data.paid_leave_days;business_date=data.period+'-01';name=`${data.period} · ${employee.name}`;status='Draft';
  } else if(resource === 'payments'){
    fail(['CUSTOMER','SUPPLIER','SALARY'].includes(data.kind),'Payment kind must be CUSTOMER, SUPPLIER or SALARY.');const target=await ref(data.kind==='SALARY'?'payroll':'invoices',data.target_id);if(data.kind!=='SALARY')fail(target.data.kind===(data.kind==='CUSTOMER'?'SALES':'PURCHASE'),'Payment kind does not match its invoice.');data.amount_minor=exact(data.amount,2,'Payment amount');fail(BigInt(data.amount_minor)>0n,'Payment must be positive.');if(data.reference)text(data.reference,'Reference',120);business_date=date(data.date);name=`${external_id} · ${target.external_id}`;status='Draft';
  } else if (resource === 'openings') {
    const item = await ref('items',data.item_id); data.quantity_base = item.data.uom === 'kg' ? exact(data.quantity,3,'Opening quantity') : String(integer(data.quantity,'Opening quantity',{min:1})); fail(BigInt(data.quantity_base)>0n,'Opening quantity must be positive.'); business_date=date(data.date); status='Draft';
  } else if (resource === 'receipts') {
    await ref('purchases',data.purchase_id); business_date=date(data.date); status='Draft';
  } else if (resource === 'deliveries') {
    await ref('workorders',data.workorder_id); business_date=date(data.date); status='Draft';
  } else if (['customers','suppliers'].includes(resource)) {
    name = text(data.name, 'Name');
    if (data.email) fail(z.email().safeParse(data.email).success, 'Email address is invalid.');
  } else if (resource === 'items') {
    name = text(data.name, 'Name'); fail(['kg','pieces'].includes(data.uom), 'Unit must be kg or pieces.'); fail(['raw','finished'].includes(data.kind), 'Item kind must be raw or finished.');
    data.base_uom = data.uom === 'kg' ? 'g' : 'pieces'; data.reorder_base = data.uom === 'kg' ? exact(data.reorder_level || '0',3,'Reorder level') : String(integer(data.reorder_level || '0','Reorder level'));
  } else if (resource === 'employees') {
    name = text(data.name, 'Employee name'); text(data.department, 'Department');
  } else if (cfg.grouped) {
    fail(rawRows.length <= 100, 'A document can contain at most 100 lines.');
    const counterpartyKey = resource === 'sales' ? 'customer_id' : 'supplier_id';
    const counterparty = await ref(resource === 'sales' ? 'customers' : 'suppliers', data[counterpartyKey]);
    if (resource === 'purchases') await ref('sales', data.source_sales_id);
    const ids = new Set(); business_date = date(data.date); status = historical ? 'Historical' : 'Draft'; name = `${external_id} · ${counterparty.name}`;
    let total = 0n;
    for (const row of rawRows) {
      for (const key of ['date',counterpartyKey,'source_sales_id']) if (data[key] !== undefined) fail(String(row[key] || '').trim() === data[key], `All lines must use the same ${key}.`);
      const lineID = text(String(row.line_id || ''), 'Line ID', 80); fail(!ids.has(lineID), `Duplicate line ID '${lineID}' in this document.`); ids.add(lineID);
      const item = await ref('items', String(row.item_id || '').trim());
      const qty = item.data.uom === 'kg' ? exact(row.quantity,3,'Quantity') : String(integer(row.quantity,'Quantity',{ min: 1 }));
      fail(BigInt(qty) > 0n, 'Quantity must be positive.');
      const rate = exact(row.rate,2,'Rate'); const divisor = item.data.uom === 'kg' ? 1000n : 1n;
      const value = BigInt(qty) * BigInt(rate);
      fail(value % divisor === 0n, 'Line total would contain a fraction of one paisa.');
      const lineTotal = value / divisor; total += lineTotal; fail(total <= 9000000000000n, 'Document total exceeds safe range.');
      lines.push({ external_line_id: lineID, item_id: item.id, quantity: qty, unit_price_minor: rate, line_total_minor: lineTotal.toString(), uom: item.data.base_uom || item.data.uom });
    }
    data.total_minor = total.toString(); data.currency = historical ? 'source price units' : 'BDT';
  } else if (resource === 'bom') {
    const fg = await ref('items', data.finished_item_id); const rm = await ref('items', data.component_item_id);
    fail(fg.data.kind === 'finished' && fg.data.uom === 'pieces' && rm.data.kind === 'raw' && rm.data.uom === 'kg', 'BOM requires a finished piece item and a raw kg component.');
    data.grams_per_piece = exact(data.kg_per_piece,3,'Fabric per piece'); fail(BigInt(data.grams_per_piece)>0n,'BOM quantity must be positive.'); name = text(data.name,'BOM name'); status = 'Draft';
  } else if (resource === 'workorders') {
    await ref('sales',data.source_sales_id); await ref('bom',data.bom_id); data.quantity = integer(data.quantity,'Production quantity',{min:1}); business_date = date(data.date); status = 'Draft';
  } else if (resource === 'invoices') {
    fail(['SALES','PURCHASE'].includes(data.kind), 'Invoice kind must be SALES or PURCHASE.'); await ref(data.kind === 'SALES' ? 'sales' : 'purchases', data.source_id); if(data.amount) data.declared_amount_minor=exact(data.amount,2,'Declared bill total'); business_date = date(data.date); date(data.due_date,'Due date'); fail(data.due_date >= data.date,'Due date must not precede the invoice.'); status = 'Draft';
  } else if (resource === 'payroll') {
    const employee = await ref('employees',data.employee_id); fail(/^\d{4}-(0[1-9]|1[0-2])$/.test(data.period),'Payroll period must be YYYY-MM.');
    for (const key of ['basic','allowance','extra','deduction']) data[`${key}_minor`] = exact(data[key],2,key);
    data.net_minor = (BigInt(data.basic_minor) + BigInt(data.allowance_minor) + BigInt(data.extra_minor) - BigInt(data.deduction_minor)).toString();
    fail(BigInt(data.net_minor) >= 0n,'Deductions exceed gross pay.'); data.attendance_days = integer(data.attendance_days,'Attendance days',{max:31});if(data.attendance_id){const a=await ref('attendance',data.attendance_id);fail(a.data.employee_id===data.employee_id&&a.data.period===data.period,'Attendance employee/period must match payroll.');}business_date=data.period+'-01'; status = 'Draft'; name = `${data.period} · ${employee.name}`;
  }
  const result={ external_id, name, status, business_date, data, lines, refs, warnings: [] };
  if(taskDependency){
    const saved=await db('records').where({...scope,resource,external_id}).first(),{matchesHash}=require('./services/records.js'),{lines:ls,refs:rs,warnings,...values}=result;
    // A byte-equivalent creation replay must skip, even after the saved plan is
    // rescheduled/cancelled. It never rewinds current dates, state or history.
    const replay=saved&&matchesHash(saved.content_hash,values,ls,rs);
    if(!replay){fail(taskDependency.status!=='Cancelled','A cancelled task cannot be a prerequisite.');fail(data.planned_start>=taskDependency.data.due_date,'Planned start must be on or after the prerequisite due date.');}
  }
  return result;
}
module.exports = { COMPANY, DEMO, NW, UCI, registry, getResource, schemas, normalize };
