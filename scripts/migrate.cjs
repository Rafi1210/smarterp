require('./env.cjs');
const knex = require('knex');
const { config } = require('../src/lib/db.js');
const { environment, fail } = require('../src/lib/core.js');
async function main() {
  const env = environment();
  const db = knex(config(process.env.DATABASE_DIRECT_URL));
  try {
    // No automatic seed, reset, down migration, or cross-environment adoption.
    if (await db.schema.hasTable('app_context')) {
      const current = await db('app_context').where({ id: 1 }).first();
      fail(!current || current.environment === env, 'Migration refused: wrong database context.', 503);
    }
    const [batch, names] = await db.migrate.latest();
    await db('app_context').insert({ id: 1, environment: env }).onConflict('id').ignore();
    const actual = await db('app_context').where({ id: 1 }).first();
    fail(actual.environment === env, 'Migration context mismatch.', 503);
    console.log(JSON.stringify({ environment: env, batch, applied: names }));
  } finally { await db.destroy(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
