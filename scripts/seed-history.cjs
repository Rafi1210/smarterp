require('./env.cjs');const {database,assertContext}=require('../src/lib/db.js');const {loadHistorical}=require('../src/lib/services/history.js');
(async()=>{const db=database();try{await assertContext(db);console.log(JSON.stringify(await loadHistorical(db)));}finally{await db.destroy();}})().catch(e=>{console.error(e.message);process.exitCode=1});
