const {fail}=require('../core.js');const {REVIEWS}=require('../workspace-config.js');
async function reviewGate(trx,scope,record,action,options={}){
 if(REVIEWS[record.resource]?.action!==action)return;
 const pending=await trx('approval_requests').where({...scope,document_id:record.id,status:'Pending'}).first();
 fail(!pending||options.approval_request_id===pending.id,'A review request is pending. Decide it from Approval Inbox.',409);
}
module.exports={reviewGate};
