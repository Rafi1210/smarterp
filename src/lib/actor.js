const {AsyncLocalStorage}=require('node:async_hooks');
const context=new AsyncLocalStorage();
function currentUser(){return context.getStore()||null;}
function actorLabel(fallback='local-workspace'){const user=currentUser();return user?`${user.email} (${user.role})`:fallback;}
function withActor(user,fn){return context.run(user,fn);}
module.exports={currentUser,actorLabel,withActor};
