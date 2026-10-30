const fs = require('node:fs');
const path = require('node:path');
const {parseEnv} = require('node:util');
const {spawnSync} = require('node:child_process');
const {validateHostedConfig} = require('../src/lib/deployment.js');
const PROFILES = {staging: 'staging', production: 'demo-production'};
const COMMANDS = {'db:migrate': 'migrate.cjs', 'db:seed:demo': 'seed-demo.cjs', 'db:seed:history': 'seed-history.cjs', 'db:seed:workflow': 'seed-workflow.cjs', 'db:seed:people': 'seed-people.cjs', 'auth:setup': 'setup-auth.cjs', 'db:check': 'check-integrity.cjs', 'deploy:check': 'deploy-preflight.cjs', 'smoke:live': 'smoke-live.mjs'};
const allowedKey = key => /^(APP_ENV|APP_MODE|APP_URL|DATABASE_URL|DATABASE_DIRECT_URL|AI_ENABLED|OPENAI_API_KEY|OPENAI_MODEL|AI_BUDGET_MICRO_USD|AI_RESERVATION_MICRO_USD|AI_DAILY_LIMIT|AI_COOLDOWN_SECONDS|AI_MAX_OUTPUT_TOKENS|MAX_IMPORT_BYTES|MAX_IMPORT_ROWS|SMARTERP_(ADMIN|OPERATIONS|FINANCE)_(EMAIL|PASSWORD)|SMARTERP_SMOKE_(EMAIL|PASSWORD)|SMOKE_EXPECT_COMMIT|SMOKE_EXPECT_ENV)$/.test(key);
function template(profile) {
  const staging = profile === 'staging', site = staging ? 'staging--YOUR-SITE' : 'YOUR-SITE', endpoint = staging ? 'YOUR_STAGING_ENDPOINT' : 'YOUR_PRODUCTION_ENDPOINT';
  return '# Git-ignored hosted profile. Does not replace your working .env.local.\n' +
    `APP_ENV=${PROFILES[profile]}\nAPP_MODE=demo\nAPP_URL=https://${site}.netlify.app\n` +
    `DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@${endpoint}-pooler.us-east-2.aws.neon.tech/YOUR_DB?sslmode=require\n` +
    `DATABASE_DIRECT_URL=postgresql://YOUR_USER:YOUR_PASSWORD@${endpoint}.us-east-2.aws.neon.tech/YOUR_DB?sslmode=require\n` +
    'AI_ENABLED=false\nAI_BUDGET_MICRO_USD=1000000\n# First deployment uses the free rules-based brief. Do not allocate a new $1 to every DB.\n';
}
function loadProfile(root, profile, parent = process.env) {
  if (!PROFILES[profile]) throw new Error('Choose staging or production.');
  const file = path.join(root, '.env.' + profile + '.local');
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('The profile must be a regular local file.');
  const values = parseEnv(fs.readFileSync(file, 'utf8'));
  if (Object.keys(values).some(key => !allowedKey(key))) throw new Error('Profile contains an unsupported key. Keep only documented application variables.');
  if (values.APP_ENV !== PROFILES[profile]) throw new Error('APP_ENV does not match the selected profile.');
  validateHostedConfig(values, {directRequired: true});
  const env = {...parent};
  for (const key of Object.keys(env)) if (allowedKey(key) || /^(NETLIFY|CONTEXT|BRANCH|SITE_ID|URL|DEPLOY_PRIME_URL|DEPLOY_URL|COMMIT_REF|SMARTERP_SKIP_ENV_FILE|NODE_OPTIONS|NODE_TLS_REJECT_UNAUTHORIZED|PG[A-Z_]*$|SMOKE_)/.test(key)) delete env[key];
  Object.assign(env, values, {SMARTERP_SKIP_ENV_FILE: '1'});
  env.SMOKE_BASE_URL = values.APP_URL;
  env.SMOKE_EXPECT_ENV = values.APP_ENV;
  env.SMOKE_REPORT_FILE = path.join(root, '.deployment-reports', profile + '-smoke.json');
  return env;
}
function main(args = process.argv.slice(2), root = path.resolve(__dirname, '..')) {
  const [profile, command, ...extra] = args;
  if (!PROFILES[profile]) throw new Error('Use npm run profile -- staging|production init|check|db:migrate|db:seed:demo|auth:setup|deploy:check|db:check|smoke:live');
  if (command === 'init') {
    if (extra.length) throw new Error('Profile init takes no additional arguments.');
    const file = path.join(root, '.env.' + profile + '.local');
    fs.writeFileSync(file, template(profile), {flag: 'wx', mode: 0o600});
    console.log('Created .env.' + profile + '.local with placeholders. Edit it locally; never send connection strings or passwords in chat.');
    return;
  }
  const env = loadProfile(root, profile);
  if (command === 'check') { console.log(JSON.stringify({profile, environment: env.APP_ENV, origin: new URL(env.APP_URL).origin, credentialsPrinted: false, databaseConnected: false, localEnvironmentPreserved: true})); return; }
  if (!COMMANDS[command]) throw new Error('Unsupported profile command.');
  if (extra.length && !(command === 'auth:setup' && extra.length === 2 && extra[0] === '--reset' && ['admin', 'operations', 'finance'].includes(extra[1]))) throw new Error('Unsupported command arguments.');
  const child = spawnSync(process.execPath, [path.join(root, 'scripts', COMMANDS[command]), ...extra], {cwd: root, env, stdio: 'inherit'});
  if (child.error || child.status !== 0) throw new Error('Profile command failed; no profile values are printed.');
}
if (require.main === module) { try { main(); } catch (e) { const name = PROFILES[process.argv[2]] ? process.argv[2] : 'staging'; console.error(e.code === 'ENOENT' ? 'Create this profile first: npm run profile -- ' + name + ' init' : e.code === 'EEXIST' ? 'Profile already exists; it was not overwritten.' : e.message); process.exitCode = 1; } }
module.exports = {loadProfile, template, main, PROFILES};
