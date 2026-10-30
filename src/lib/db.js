const knex = require('knex');
// A DATE is a calendar date, not a timezone-shifted JavaScript timestamp.
require('pg').types.setTypeParser(1082,value=>value);
const { environment, fail } = require('./core.js');
const globalKey = Symbol.for('smarterp.database');
function config(url) {
  fail(url, 'Database is not configured for this environment.', 503);
  const parsed = new URL(url);
  const local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  fail(local || parsed.hostname.endsWith('.neon.tech'), 'Use the isolated Neon database or an explicit local test database.', 503);
  return {
    client: 'pg', connection: url,
    pool: { min: 0, max: local ? 1 : 2, acquireTimeoutMillis: 15000, idleTimeoutMillis: 10000 },
    acquireConnectionTimeout: 15000,
    migrations: { directory: require('node:path').resolve(process.cwd(), 'db/migrations'), loadExtensions: ['.cjs'] },
  };
}
function database() {
  environment();
  if (!globalThis[globalKey]) globalThis[globalKey] = knex(config(process.env.DATABASE_URL));
  return globalThis[globalKey];
}
async function assertContext(db) {
  const env = environment();
  const ctx = await db('app_context').where({ id: 1 }).first();
  fail(ctx && ctx.environment === env, 'Database environment does not match this deployment. Writes and reads are disabled.', 503);
}
module.exports = { database, config, assertContext };
