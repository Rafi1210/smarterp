const {test}=require('node:test');const assert=require('node:assert/strict');const {exact,date,safeCell,environment}=require('../src/lib/core.js');const {parseCSV}=require('../src/lib/services/imports.js');
test('money preserves paisa without floating-point rounding',()=>{assert.equal(exact('450.01'),'45001');assert.throws(()=>exact('1.001'));assert.throws(()=>exact('-1'));});
test('calendar rejects invalid day',()=>{assert.throws(()=>date('2026-02-30'));assert.equal(date('2026-10-29'),'2026-10-29')});
test('CSV rejects duplicate headers and excessive upload bytes',()=>{assert.throws(()=>parseCSV(Buffer.from('name,NAME\na,b')));assert.throws(()=>parseCSV(Buffer.alloc(2000001)));assert.equal(parseCSV(Buffer.from('name,country\n"Buyer, Ltd",BD')).rows[0].name,'Buyer, Ltd')});
test('CSV formula output is escaped',()=>assert.equal(safeCell('=SUM(A1)'),"'=SUM(A1)"));
test('unknown deployment context fails closed',()=>{const old=process.env.APP_ENV;process.env.APP_ENV='preview-disabled';assert.throws(environment);if(old===undefined)delete process.env.APP_ENV;else process.env.APP_ENV=old;});

const {recordHash}=require('../src/lib/services/records.js');
test('record hashes ignore JSONB property ordering',()=>assert.equal(recordHash({data:{name:'A',external_id:'ID'}},[],[]),recordHash({data:{external_id:'ID',name:'A'}},[],[])));

const {requireWriteAccess}=require('../src/lib/access.js');
test('write origins match APP_URL and hosted origins require HTTPS',()=>{const before={APP_ENV:process.env.APP_ENV,APP_URL:process.env.APP_URL,CONTEXT:process.env.CONTEXT};try{delete process.env.CONTEXT;process.env.APP_ENV='test';process.env.APP_URL='http://localhost:3000';assert.doesNotThrow(()=>requireWriteAccess(new Request('http://localhost:3000/api/workflow',{method:'POST',headers:{origin:'http://localhost:3000'}})));assert.throws(()=>requireWriteAccess(new Request('http://localhost:3000/api/workflow',{method:'POST',headers:{origin:'https://other.invalid'}})));process.env.APP_ENV='staging';process.env.APP_URL='http://erp.invalid';assert.throws(()=>requireWriteAccess(new Request('http://erp.invalid/api/workflow',{method:'POST',headers:{origin:'http://erp.invalid'}})));process.env.APP_URL='https://erp.invalid';assert.doesNotThrow(()=>requireWriteAccess(new Request('https://erp.invalid/api/workflow',{method:'POST',headers:{origin:'https://erp.invalid'}})));}finally{for(const [key,value]of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;}});

test('form idempotency keys also work on HTTP when randomUUID is unavailable',()=>{
 const {makeRequestKey}=require('../src/lib/request-key.js'),descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');let called=false;
 try{Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues(bytes){called=true;bytes.fill(171);return bytes}}});const key=makeRequestKey();assert.ok(called);assert.match(key,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)}finally{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;}
});


const {monthRange}=require('../src/lib/services/planning.js');
test('calendar month ranges preserve leap dates and reject unsupported months',()=>{assert.deepEqual(monthRange('2028-02'),{from:'2028-02-01',to:'2028-02-29'});assert.deepEqual(monthRange('2026-02'),{from:'2026-02-01',to:'2026-02-28'});assert.throws(()=>monthRange('2026-13'));assert.throws(()=>monthRange('0099-01'));});
test('source manifest containment supports Windows paths and rejects traversal or other drives',()=>{
 const {isChildPath}=require('../scripts/verify-sources.cjs'),{win32,posix}=require('node:path');
 assert.equal(isChildPath('E:\\smarterp\\data\\source','E:\\smarterp\\data\\source\\northwind\\orders.csv',win32),true);
 assert.equal(isChildPath('E:\\smarterp\\data\\source','E:\\smarterp\\data\\outside.csv',win32),false);
 assert.equal(isChildPath('E:\\smarterp\\data\\source','C:\\private.csv',win32),false);
 assert.equal(isChildPath('/app/data/source','/app/data/source/northwind/orders.csv',posix),true);
 assert.equal(isChildPath('/app/data/source','/app/data/source-other/orders.csv',posix),false);
});
