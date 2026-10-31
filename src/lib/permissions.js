const ROLE_LABELS={admin:'System Admin',operations:'Operations',finance:'Finance'};
const PRIVATE_RESOURCES=['employees','attendance','payroll','payslips','payments','cashbook','journals'];
const OPS_CREATE=['customers','suppliers','items','sales','merchandising','purchases','receipts','bom','openings','workorders','deliveries','tasks','invoices','productivity'];
const FIN_CREATE=['employees','attendance','payroll','invoices','payments'];
const FIN_ACTIONS=['create_invoice','post_invoice','post_supplier_bill','post_payment','reverse_payment','review_attendance','create_payroll','review_payroll','make_payment'];
const APPROVAL_ACTIONS=['approve_bom','approve_merchandising','approve_purchase','approve_payroll'];
function canRead(role,resource,kind){return Boolean(ROLE_LABELS[role])&&(role!=='operations'||(!PRIVATE_RESOURCES.includes(resource)&&(resource!=='invoices'||!kind||kind==='PURCHASE')));}
function canCreate(role,resource,kind){return role==='admin'||(role==='operations'&&OPS_CREATE.includes(resource)&&(resource!=='invoices'||!kind||kind==='PURCHASE'))||(role==='finance'&&FIN_CREATE.includes(resource));}
function canSubmit(role,resource){return role==='admin'||(role==='operations'&&['bom','merchandising','purchases'].includes(resource))||(role==='finance'&&resource==='payroll');}
function canApprove(role,resource){return role==='admin'||(role==='finance'&&['purchases','payroll'].includes(resource));}
function canAction(role,action,record={}){if(APPROVAL_ACTIONS.includes(action))return false;if(action==='submit_review')return canSubmit(role,record.resource);if(role==='admin')return true;if(role==='finance')return FIN_ACTIONS.includes(action);if(role!=='operations')return false;if(FIN_ACTIONS.includes(action)||['prepare_people','prepare_demo'].includes(action))return false;return canRead(role,record.resource,record.data?.kind);}
function canAI(role){return role==='admin'||role==='finance';}
module.exports={ROLE_LABELS,PRIVATE_RESOURCES,APPROVAL_ACTIONS,canRead,canCreate,canSubmit,canApprove,canAction,canAI};
