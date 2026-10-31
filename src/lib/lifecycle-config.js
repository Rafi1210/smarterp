const {canCreate} = require('./permissions.js');
// Work Orders use cancel_workorder, which preserves the existing committed-order
// uniqueness rule and releases any material reservation in its domain transaction.
const DRAFTS = ['sales','merchandising','purchases','receipts','openings','deliveries','invoices','attendance','payroll','payments','tasks','bom'];
const MASTERS = ['customers','suppliers','items','employees','bom'];
const CANCELLABLE = {sales:['Quoted','Confirmed'],merchandising:['Approved'],purchases:['Approved'],attendance:['Reviewed'],payroll:['Reviewed']};
function lifecycleActions(record, role) {
  if (!record || (role && !canCreate(role, record.resource, record.data?.kind))) return [];
  const {resource,status} = record, actions = [];
  if (DRAFTS.includes(resource) && status === 'Draft') actions.push({action:'delete_draft',label:'Delete draft'});
  if (MASTERS.includes(resource) && ['Active','Draft','Approved'].includes(status)) actions.push({action:'archive',label:'Archive record'});
  if (MASTERS.includes(resource) && status === 'Archived') actions.push({action:'restore',label:'Restore record'});
  if (DRAFTS.includes(resource) && status === 'Deleted') actions.push({action:'restore',label:'Restore draft'});
  if (CANCELLABLE[resource]?.includes(status)) actions.push({action:'cancel_document',label:'Cancel document'});
  if (resource === 'payments' && status === 'Posted' && (!role || ['admin','finance'].includes(role))) actions.push({action:'reverse_payment',label:'Reverse payment'});
  return actions;
}
module.exports = {DRAFTS,MASTERS,CANCELLABLE,lifecycleActions};
