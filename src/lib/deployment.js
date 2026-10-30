const buildContext = require('./deployment-context.js');
function need(ok, message) { if (!ok) { const e = new Error(message); e.status = 503; throw e; } }
function allowedContext(context, branch, environment) {
  return (context === 'production' && branch === 'main' && environment === 'demo-production') ||
    (['branch-deploy', 'production'].includes(context) && branch === 'staging' && environment === 'staging');
}
function runtimeEnvironment(env = process.env, stamp = buildContext) {
  const value = env.APP_ENV || 'development';
  need(['development', 'test', 'staging', 'demo-production'].includes(value), 'This deployment context has no database access.');
  if (stamp.provider === 'netlify') {
    need(allowedContext(stamp.context, stamp.branch, value) && stamp.environment === value && /^[a-f0-9]{40}$/.test(stamp.commit || ''), 'Runtime environment differs from this deployment.');
  }
  if (env.CONTEXT) need(allowedContext(env.CONTEXT, env.BRANCH, value), 'Database context is disabled for this deploy.');
  if (env.NETLIFY === 'true' || env.SITE_ID) need(stamp.provider === 'netlify', 'Hosted code needs a verified Netlify build context.');
  return value;
}
function origin(value) {
  let u; try { u = new URL(value); } catch { need(false, 'APP_URL must be an HTTPS origin.'); }
  need(u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/', 'APP_URL must be an HTTPS origin without a path or credentials.');
  need(!/YOUR[-_]|EXAMPLE|localhost|127\.0\.0\.1/i.test(u.hostname), 'Replace the APP_URL placeholder with the actual deployment origin.');
  return u.origin;
}
function connection(value, key, pooled) {
  let u; try { u = new URL(value); } catch { need(false, key + ' is missing or invalid.'); }
  need(['postgres:', 'postgresql:'].includes(u.protocol) && u.hostname.endsWith('.neon.tech') && u.username && u.password && u.pathname.length > 1, key + ' must be a Neon PostgreSQL connection.');
  need(!/YOUR_|PLACEHOLDER|CHANGE_ME/i.test(value), 'Replace the ' + key + ' placeholder.');
  need(['require', 'verify-full'].includes(u.searchParams.get('sslmode')), key + ' requires sslmode=require or verify-full.');
  for (const name of u.searchParams.keys()) need(['sslmode', 'channel_binding', 'application_name', 'connect_timeout'].includes(name) && u.searchParams.getAll(name).length === 1, key + ' contains an unsupported or repeated connection option.');
  need(pooled ? u.hostname.includes('-pooler.') : !u.hostname.includes('-pooler.'), key + (pooled ? ' must use the pooled endpoint.' : ' must use the direct endpoint.'));
  return {host: u.hostname.replace('-pooler.', '.'), database: u.pathname};
}
function validateHostedConfig(env, {directRequired = false} = {}) {
  need(['staging', 'demo-production'].includes(env.APP_ENV), 'APP_ENV must be staging or demo-production for a hosted profile.');
  need(env.APP_MODE === 'demo', 'APP_MODE must remain demo for this synthetic-data release.');
  need(['true', 'false'].includes(env.AI_ENABLED || 'false'), 'AI_ENABLED must be true or false.');
  const appOrigin = origin(env.APP_URL);
  const pooled = connection(env.DATABASE_URL, 'DATABASE_URL', true);
  if (directRequired || env.DATABASE_DIRECT_URL) {
    const direct = connection(env.DATABASE_DIRECT_URL, 'DATABASE_DIRECT_URL', false);
    need(direct.host === pooled.host && direct.database === pooled.database, 'Pooled and direct connections must point to the same Neon endpoint and database.');
  }
  return {environment: env.APP_ENV, origin: appOrigin, aiEnabled: env.AI_ENABLED === 'true'};
}
function makeBuildContext(env) {
  need(env.NETLIFY === 'true', 'build:deploy is for a Netlify build. Use npm run build locally.');
  need(allowedContext(env.CONTEXT, env.BRANCH, env.APP_ENV), 'Only verified staging or main deployments are enabled.');
  const result = validateHostedConfig(env);
  const expected = env.CONTEXT === 'production' ? env.URL : env.DEPLOY_PRIME_URL;
  need(expected && result.origin === new URL(expected).origin, 'APP_URL must match the canonical production or staging branch URL.');
  need(/^[a-f0-9]{40}$/.test(env.COMMIT_REF || ''), 'A complete Netlify COMMIT_REF is required.');
  return {provider: 'netlify', context: env.CONTEXT, branch: env.BRANCH, commit: env.COMMIT_REF, environment: env.APP_ENV};
}
module.exports = {runtimeEnvironment, validateHostedConfig, makeBuildContext, allowedContext, buildContext};
