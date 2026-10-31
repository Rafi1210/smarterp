const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {makeBuildContext} = require('../src/lib/deployment.js');
const localContext = {provider: 'local', context: null, branch: null, commit: null, environment: null};
function writeContext(root, context) {
  fs.writeFileSync(path.join(root, 'src/lib/deployment-context.js'), '// Generated build metadata; contains no credentials.\nmodule.exports = ' + JSON.stringify(context) + ';\n');
}
function testEnvironment(source) {
  const env = {...source};
  for (const key of Object.keys(env)) if (/^(NETLIFY|CONTEXT$|BRANCH$|SITE_ID$|URL$|DEPLOY_|COMMIT_REF$|DATABASE_|OPENAI_|AI_|SMARTERP_)/.test(key)) delete env[key];
  return {...env, APP_ENV: 'test', APP_MODE: 'demo', APP_URL: 'http://localhost:3000', AI_ENABLED: 'false', SMARTERP_SKIP_ENV_FILE: '1'};
}
function run(root, args, env) {
  const child = spawnSync(process.execPath, args, {cwd: root, env, stdio: 'inherit'});
  if (child.error || child.status !== 0) throw new Error('Deployment build stopped because a required check failed.');
}
function runLocalChecks(root, source) {
  // Unit checks must not inherit hosted secrets or the hosted runtime stamp.
  writeContext(root, localContext);
  const env = testEnvironment(source);
  run(root, ['scripts/verify-sources.cjs'], env);
  run(root, ['scripts/verify-business-pack.cjs'], env);
  run(root, ['--test', 'tests/unit.test.cjs'], env);
}
function main() {
  const stamp = makeBuildContext(process.env);
  const root = path.resolve(__dirname, '..');
  runLocalChecks(root, process.env);
  writeContext(root, stamp);
  const env = {...process.env, SMARTERP_SKIP_ENV_FILE: '1'};
  run(root, ['scripts/deploy-preflight.cjs'], env);
  run(root, ['node_modules/next/dist/bin/next', 'build'], env);
  console.log(JSON.stringify({buildContext: stamp, automaticMigrations: false, automaticSeeds: false, automaticAccountReset: false}));
}
if (require.main === module) { try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = {main, runLocalChecks, testEnvironment};
