import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
const require=createRequire(import.meta.url),knex=require('knex'),run=promisify(execFile),{check}=require('../scripts/deploy-preflight.cjs');
test('deployment preflight reads schema and accounts without creating migration metadata, seeding, posting or adopting another context',async()=>{
 const keys=['APP_ENV','APP_MODE','APP_URL','AI_ENABLED','DATABASE_URL','DATABASE_DIRECT_URL','CONTEXT','BRANCH','SITE_ID','NETLIFY'];const beforeEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const pg=await PGlite.create(),server=new PGLiteSocketServer({db:pg,host:'127.0.0.1',port:25451});let db;
 try{
  await server.start();const url='postgresql://postgres:postgres@127.0.0.1:25451/postgres';db=knex({client:'pg',connection:url,pool:{min:0,max:1}});
  for(const k of ['CONTEXT','BRANCH','SITE_ID','NETLIFY'])delete process.env[k];
  Object.assign(process.env,{APP_ENV:'staging',APP_MODE:'demo',APP_URL:'https://staging--synthetic.netlify.app',AI_ENABLED:'false'});
  const login=['fixture','fixture'].join(':');process.env.DATABASE_URL='postgresql://'+login+'@ep-synthetic-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';process.env.DATABASE_DIRECT_URL='postgresql://'+login+'@ep-synthetic.us-east-2.aws.neon.tech/neondb?sslmode=require';
  await db.schema.createTable('app_context',t=>{t.integer('id').primary();t.text('environment')});await db('app_context').insert({id:1,environment:'staging'});
  await assert.rejects(check(db),/Apply migrations explicitly/);assert.equal(await db.schema.hasTable('knex_migrations'),false);
  await db.schema.dropTable('app_context');
  await db.destroy();db=null;
  const env={...process.env,SMARTERP_SKIP_ENV_FILE:'1',DATABASE_URL:url,DATABASE_DIRECT_URL:url};
  for(const file of ['migrate.cjs','seed-demo.cjs'])await run(process.execPath,['scripts/'+file],{env});
  db=knex({client:'pg',connection:url,pool:{min:0,max:1}});
  const snapshot=async()=>{const result={};for(const {tablename}of (await db.raw("select tablename from pg_tables where schemaname='public' order by tablename")).rows){result[tablename]=(await db(tablename)).map(r=>JSON.stringify(r)).sort()}return JSON.stringify(result)};
  const uninitialized=await snapshot();await assert.rejects(check(db),/accounts explicitly/);assert.equal(await snapshot(),uninitialized);assert.equal((await db('app_users')).length,0);
  for(const role of ['ADMIN','OPERATIONS','FINANCE'])env['SMARTERP_'+role+'_PASSWORD']='SyntheticFixture-'+role+'-2026';
  await db.destroy();db=null;await run(process.execPath,['scripts/setup-auth.cjs'],{env});db=knex({client:'pg',connection:url,pool:{min:0,max:1}});const ready=await snapshot();await check(db);assert.equal(await snapshot(),ready);
  process.env.APP_ENV='demo-production';await assert.rejects(check(db),/environment does not match/);assert.equal(await snapshot(),ready);
 }finally{
  await db?.destroy();await server.stop();await pg.close();for(const [k,v]of Object.entries(beforeEnv))if(v===undefined)delete process.env[k];else process.env[k]=v;
 }
});
