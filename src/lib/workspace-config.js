const REVIEWS={purchases:{label:'Purchase order',state:'Draft',action:'approve_purchase'},merchandising:{label:'Merchandising sheet',state:'Draft',action:'approve_merchandising'},bom:{label:'Bill of material',state:'Draft',action:'approve_bom'},payroll:{label:'Payroll run',state:'Reviewed',action:'approve_payroll'}};
const MILESTONES={SAMPLE:'Sample approval',FABRIC_BOOKING:'Fabric booking',FABRIC_ARRIVAL:'Fabric arrival',CUTTING:'Cutting',SEWING:'Sewing',FINISHING:'Finishing',QC:'Quality inspection',SHIPMENT:'Shipment readiness'};
const TASK_ACTIONS=['start_task','complete_task','reschedule_task','cancel_task'];
module.exports={REVIEWS,MILESTONES,TASK_ACTIONS};
