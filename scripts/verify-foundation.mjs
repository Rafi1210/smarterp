import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
import {spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
const run=promisify(execFile);const db=await PGlite.create();const server=new PGLiteSocketServer({db,host:'127.0.0.1',port:5439});await server.start();
const env={...process.env,APP_ENV:'test',DATABASE_URL:'postgresql://postgres:postgres@127.0.0.1:5439/postgres',DATABASE_DIRECT_URL:'postgresql://postgres:postgres@127.0.0.1:5439/postgres'};
// CLI .env.local must not override this isolated integration-test database.
const fs=await import('node:fs/promises');let saved;try{saved=await fs.readFile('.env.local');await fs.rename('.env.local','.env.local.test-backup')}catch{}
let app;
try{for(const file of ['migrate.cjs','seed-demo.cjs','seed-demo.cjs']){const r=await run(process.execPath,[`scripts/${file}`],{env});console.log(r.stdout.trim());}
const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
const knex=require('knex');const connection=knex({client:'pg',connection:env.DATABASE_URL,pool:{min:0,max:1}});
try{const {listRecords,chart,detail}=require('../src/lib/services/records.js');const {COMPANY,DEMO}=require('../src/lib/registry.js');const scope={company_id:COMPANY,dataset_id:DEMO};
const result=await listRecords(connection,scope,'customers',{});if(result.meta.total!==1)throw Error('Seed not idempotent');console.log('Persistent customer list: 1 record after two seeds');
const d=await detail(connection,scope,'customers',result.data[0].id);if(d.activity.length!==1)throw Error('Duplicate seed activity');console.log('Related detail and activity: verified');
const c=await chart(connection,scope,'items',{});if(c.total!==2)throw Error('Saved-data chart mismatch');console.log('Saved-data chart: 2 items');
const {preview,commit,exportRecords}=require('../src/lib/services/imports.js');const buffer=Buffer.from('external_id,name,country\\nBUYER-002,Second Buyer,BD'.replace('\\n','\n'));const batch=await preview(connection,scope,{resource:'customers',buffer,filename:'customers.csv'});if(batch.error_count)throw Error('Preview failed');await commit(connection,scope,batch.id);await commit(connection,scope,batch.id);const imported=await listRecords(connection,scope,'customers',{});if(imported.meta.total!==2)throw Error('Import not idempotent');console.log('CSV preview, commit, repeated commit: verified');const csv=await exportRecords(connection,scope,'customers',{});if(!csv.includes('Second Buyer'))throw Error('Export omitted saved data');console.log('Filtered CSV export: verified');
}finally{await connection.destroy()}
}finally{app?.kill('SIGTERM');await server.stop();await db.close();if(saved)await fs.rename('.env.local.test-backup','.env.local');}
