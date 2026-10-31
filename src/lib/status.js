// One shared semantic color per status across lists, details, reports and charts.
const STATUSES={
 Deleted:['Deleted draft','#a14457','#fff0f3'],Archived:['Archived','#64748b','#f1f5f9'],Reversed:['Reversed','#a75b78','#fff1f7'],
 Pending:['Pending review','#b7791f','#fff7e8'],Returned:['Returned','#c26638','#fff0e7'],InProgress:['In progress','#287fbb','#eaf5ff'],Done:['Completed','#24875a','#ecf9f1'],Overdue:['Overdue','#c84b52','#fff0f1'],
 Draft:['Draft','#64748b','#f1f5f9'],Quoted:['Quoted','#6366f1','#eef2ff'],Confirmed:['Confirmed','#2563eb','#eff6ff'],
 Approved:['Approved','#0f766e','#e7f7f2'],Reviewed:['Reviewed','#0891b2','#ecfeff'],Reserved:['Reserved','#7c3aed','#f5f0ff'],
 Received:['Received','#148a91','#e6f6f7'],Accepted:['Accepted','#15803d','#edf9ef'],Matched:['Matched','#8750a3','#f6eefb'],
 MaterialsIssued:['Materials issued','#b77a0c','#fff7e0'],Produced:['Produced','#a855f7','#faf0ff'],QCHold:['QC hold','#dc2626','#fff0f0'],QCReleased:['QC released','#059669','#e8fbf2'],
 Dispatched:['Dispatched','#1d4ed8','#eaf0ff'],Delivered:['Delivered','#166534','#e7f5e9'],Posted:['Posted','#0369a1','#eaf7ff'],
 PartPaid:['Part paid','#c2690b','#fff4e7'],Paid:['Paid','#16a34a','#edfbee'],Open:['Open','#d97706','#fff8e8'],Cancelled:['Cancelled','#9f4250','#fceff2'],
 Active:['Active','#347a40','#f0f9ed'],Historical:['Historical','#8a6b40','#f8f3e8'],
 PREVIEWED:['Previewed','#2563eb','#eff6ff'],COMMITTING:['Importing','#7c3aed','#f5f0ff'],COMPLETED:['Completed','#16a34a','#edfbee'],
 CANCELLED:['Cancelled','#9f4250','#fceff2'],PARTIAL:['Partially imported','#c2690b','#fff4e7'],FAILED:['Failed','#dc2626','#fff0f0'],
 INVALID:['Invalid','#dc2626','#fff0f0'],PENDING:['Pending','#64748b','#f1f5f9'],IMPORTED:['Imported','#16a34a','#edfbee'],SKIPPED:['Skipped','#8a6b40','#f8f3e8']
};
function statusInfo(status){const [label,color,background]=STATUSES[status]||[status||'Pending','#64748b','#f1f5f9'];return {label,color,background};}
const STATUS_OPTIONS=Object.keys(STATUSES).filter(s=>!['Open'].includes(s)&&s!==s.toUpperCase());
const CHART_COLORS=['#386fa4','#22a993','#f2a04a','#9c75ca','#df738e','#72939d'];
function resourceLabel(resource,kind){return {tasks:'T&A milestone',sales:'Sales order',merchandising:'Merchandising order sheet',purchases:'Purchase order',receipts:'Goods receipt',workorders:'Work order',deliveries:'Delivery note',invoices:kind==='PURCHASE'?'Supplier bill':'Customer invoice',payments:'Receipt / payment',bom:'Bill of material',openings:'Opening stock',movements:'Stock movement',cashbook:'Cash entry',journals:'Journal entry',attendance:'Attendance summary',payroll:'Payroll run',payslips:'Payslip',items:'Item',customers:'Customer',suppliers:'Supplier',employees:'Employee'}[resource]||resource;}
module.exports={STATUSES,statusInfo,STATUS_OPTIONS,CHART_COLORS,resourceLabel};
