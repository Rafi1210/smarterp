require('./env.cjs');
const fs = require('node:fs');
const path = require('node:path');
const {validateHostedConfig} = require('../src/lib/deployment.js');
async function check(providedDB) {
  const configuration = validateHostedConfig(process.env);
  const {database, assertContext} = require('../src/lib/db.js');
  const db = providedDB || database();
  try {
    await assertContext(db);
    await db.raw('select 1');
    if (!await db.schema.hasTable('knex_migrations')) throw new Error('Apply migrations explicitly before checking this database.');
    const completed = new Set(await db('knex_migrations').pluck('name'));
    const pending = fs.readdirSync(path.resolve(__dirname, '../db/migrations')).filter(name => name.endsWith('.cjs') && !completed.has(name));
    if (pending.length) throw new Error('Apply pending additive migrations explicitly with the selected profile before deploying.');
    const required = ['records', 'app_users', 'app_sessions', 'approval_requests', 'inventory_reservations', 'ai_allowance', 'payment_reversals'];
    for (const table of required) if (!await db.schema.hasTable(table)) throw new Error('Database schema is incomplete; apply explicit migrations.');
    const company = await db('companies').first('id');
    const buyer = company && await db('records').where({company_id: company.id, dataset_id: 'smarterp-demo', resource: 'customers'}).first('id');
    const roles = company ? await db('app_users').where({company_id: company.id, active: true}).distinct('role') : [];
    if (!buyer || !['admin', 'operations', 'finance'].every(role => roles.some(r => r.role === role))) throw new Error('Initialize synthetic master data and the three accounts explicitly before first deployment.');
    console.log(JSON.stringify({ready: true, environment: configuration.environment, origin: configuration.origin, pendingMigrations: 0, realCustomerListReady: true, fixedAccountsReady: true, aiEnabled: configuration.aiEnabled, mutations: 0}));
  } finally { if (!providedDB) await db.destroy(); }
}
if (require.main === module) check().catch(() => { console.error('Deployment preflight failed. Verify the selected profile, database context, migrations, seed and account setup; no connection values are printed.'); process.exitCode = 1; });
module.exports = {check};
