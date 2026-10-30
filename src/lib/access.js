const {fail}=require('./core.js');const {database,assertContext}=require('./db.js');const {authenticate,requireOrigin}=require('./auth.js');const {withActor}=require('./actor.js');
function requireWriteAccess(req){requireOrigin(req);}
async function withAccess(req,write,fn){if(write)requireWriteAccess(req);const db=database();await assertContext(db);const user=await authenticate(db,req);return withActor(user,()=>fn(db,user));}
module.exports={requireWriteAccess,withAccess};

function guard(fn,write=false){return async(req,context)=>{let response;try{response=await withAccess(req,write,(db,user)=>fn(db,user,req,context));}catch(e){response=require('./http.js').errorResponse(e);}response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie');response.headers.set('X-Content-Type-Options','nosniff');return response;};}
module.exports.guard=guard;
