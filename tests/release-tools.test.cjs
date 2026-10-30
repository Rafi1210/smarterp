const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');
const {runtimeEnvironment, validateHostedConfig, makeBuildContext} = require('../src/lib/deployment.js');
const {inspect, contentIssues} = require('../scripts/repo-check.cjs');
const {loadProfile, main: profileMain, template} = require('../scripts/run-profile.cjs');
const synthetic = () => {
  const login = ['fixture', 'fixture'].join(':');
  return {APP_ENV: 'staging', APP_MODE: 'demo', APP_URL: 'https://staging--synthetic.netlify.app', AI_ENABLED: 'false', DATABASE_URL: 'postgresql://' + login + '@ep-synthetic-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require', DATABASE_DIRECT_URL: 'postgresql://' + login + '@ep-synthetic.us-east-2.aws.neon.tech/neondb?sslmode=require'};
};
const local = {provider: 'local', context: null, branch: null, commit: null, environment: null};
const stamp = {provider: 'netlify', context: 'branch-deploy', branch: 'staging', commit: 'a'.repeat(40), environment: 'staging'};
const sh = (root, args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smarterp-release-'));
  try { return fn(root); } finally { fs.rmSync(root, {recursive: true, force: true}); }
}
function repository(root) {
  sh(root, ['init', '-b', 'staging']); sh(root, ['config', 'user.email', 'fixture@smarterp.local']); sh(root, ['config', 'user.name', 'Synthetic fixture']);
  fs.writeFileSync(path.join(root, '.gitignore'), '.env*\n!.env.example\n.local-db/\n.deployment-reports/\n.smarterp-backups/\n/update-smarterp-*.mjs\n');
  fs.writeFileSync(path.join(root, 'source.js'), 'module.exports = 1;\n'); sh(root, ['add', '.']); sh(root, ['commit', '-m', 'Synthetic baseline']);
}
test('hosted config rejects crossed Neon endpoints, insecure URLs, pool/direct swaps and placeholders without leaking values', () => {
  assert.equal(validateHostedConfig(synthetic(), {directRequired: true}).environment, 'staging');
  for (const patch of [{DATABASE_DIRECT_URL: synthetic().DATABASE_DIRECT_URL.replace('ep-synthetic.', 'ep-other.')}, {APP_URL: 'http://erp.invalid'}, {DATABASE_URL: synthetic().DATABASE_DIRECT_URL}, {DATABASE_DIRECT_URL: synthetic().DATABASE_URL}, {DATABASE_URL: synthetic().DATABASE_URL.replace('require', 'disable')}, {DATABASE_URL: synthetic().DATABASE_URL + '&sslmode=disable'}, {APP_URL: 'https://YOUR-SITE.netlify.app'}]) assert.throws(() => validateHostedConfig({...synthetic(), ...patch}, {directRequired: true}), e => !e.message.includes('postgresql://'));
});
test('a verified branch build works at runtime without build-only CONTEXT/BRANCH and rejects a mismatched runtime environment', () => {
  assert.equal(runtimeEnvironment({APP_ENV: 'staging', SITE_ID: 'synthetic-site'}, stamp), 'staging');
  assert.throws(() => runtimeEnvironment({APP_ENV: 'demo-production'}, stamp), /differs/);
  assert.throws(() => runtimeEnvironment({APP_ENV: 'staging', SITE_ID: 'synthetic-site'}, local), /verified/);
  assert.equal(runtimeEnvironment({APP_ENV: 'test'}, local), 'test');
  assert.throws(() => runtimeEnvironment({APP_ENV: 'development', CONTEXT: 'deploy-preview'}, local), /disabled/);
});
test('Netlify pre-build checks isolate hosted secrets/context and replace a stale stamp before the real unit suite',()=>fixture(root=>{
 const {runLocalChecks,testEnvironment}=require('../scripts/netlify-build.cjs');
 for(const name of ['src/lib','scripts','data'])fs.cpSync(path.resolve(name),path.join(root,name),{recursive:true});
 fs.mkdirSync(path.join(root,'tests'));fs.copyFileSync(path.resolve('tests/unit.test.cjs'),path.join(root,'tests/unit.test.cjs'));
 fs.symlinkSync(path.resolve('node_modules'),path.join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
 fs.writeFileSync(path.join(root,'src/lib/deployment-context.js'),'module.exports='+JSON.stringify(stamp)+';');
 const hosted={...process.env,NETLIFY:'true',SITE_ID:'synthetic',CONTEXT:'production',BRANCH:'staging',APP_ENV:'staging',DATABASE_URL:'never-connect.invalid',OPENAI_API_KEY:'synthetic-server-key'};
 const isolated=testEnvironment(hosted);for(const key of ['NETLIFY','SITE_ID','CONTEXT','BRANCH','DATABASE_URL','OPENAI_API_KEY'])assert.equal(isolated[key],undefined);
 assert.equal(isolated.APP_ENV,'test');assert.equal(isolated.AI_ENABLED,'false');runLocalChecks(root,hosted);
 const saved=fs.readFileSync(path.join(root,'src/lib/deployment-context.js'),'utf8');assert.ok(saved.includes('"provider":"local"'));assert.ok(!saved.includes('synthetic-server-key'));
}));
test('only canonical staging and main builds can obtain a complete release stamp', () => {
  const env = {...synthetic(), NETLIFY: 'true', CONTEXT: 'branch-deploy', BRANCH: 'staging', COMMIT_REF: 'a'.repeat(40), DEPLOY_PRIME_URL: synthetic().APP_URL};
  assert.deepEqual(makeBuildContext(env), stamp);
  for (const patch of [{CONTEXT: 'deploy-preview'}, {BRANCH: 'feature'}, {APP_ENV: 'demo-production'}, {APP_URL: 'https://other.netlify.app'}, {COMMIT_REF: 'short'}]) assert.throws(() => makeBuildContext({...env, ...patch}));
  assert.equal(makeBuildContext({...env, CONTEXT: 'production', BRANCH: 'main', APP_ENV: 'demo-production', URL: synthetic().APP_URL}).branch, 'main');
  assert.equal(makeBuildContext({...env, CONTEXT: 'production', URL: synthetic().APP_URL}).environment, 'staging');
});
test('preview build refusal happens before modifying the stamp or accessing a database', () => {
  const file = path.resolve('src/lib/deployment-context.js'), before = fs.readFileSync(file);
  const child = spawnSync(process.execPath, ['scripts/netlify-build.cjs'], {env: {...process.env, NETLIFY: 'true', CONTEXT: 'deploy-preview', BRANCH: 'staging', APP_ENV: 'staging', DATABASE_URL: 'never-connect.invalid'}, encoding: 'utf8'});
  assert.equal(child.status, 1); assert.deepEqual(fs.readFileSync(file), before); assert.match(child.stderr, /Only verified/); assert.ok(!child.stderr.includes('never-connect.invalid'));
});
test('explicit profiles cannot inherit local DB, AI key, smoke password or Netlify build context', () => fixture(root => {
  fs.writeFileSync(path.join(root, '.env.staging.local'), Object.entries(synthetic()).map(([k, v]) => k + '=' + v).join('\n'));
  const env = loadProfile(root, 'staging', {PATH: process.env.PATH, DATABASE_URL: 'local-secret', OPENAI_API_KEY: 'local-key', SMARTERP_SMOKE_PASSWORD: 'local-password', CONTEXT: 'production', SITE_ID: 'other-site', NODE_OPTIONS: '--invalid'});
  assert.equal(env.DATABASE_URL, synthetic().DATABASE_URL); for (const key of ['OPENAI_API_KEY', 'SMARTERP_SMOKE_PASSWORD', 'CONTEXT', 'SITE_ID', 'NODE_OPTIONS']) assert.equal(env[key], undefined);
  assert.equal(env.SMARTERP_SKIP_ENV_FILE, '1'); assert.equal(env.SMOKE_EXPECT_ENV, 'staging');
  fs.writeFileSync(path.join(root, '.env.staging.local'), 'APP_ENV=development\n'); assert.throws(() => loadProfile(root, 'staging'), /selected profile/);
}));
test('profile init is create-only, keeps .env.local intact and rejects path or command injection', () => fixture(root => {
  fs.writeFileSync(path.join(root, '.env.local'), 'KEEP_LOCAL=1'); profileMain(['staging', 'init'], root);
  assert.equal(fs.readFileSync(path.join(root, '.env.local'), 'utf8'), 'KEEP_LOCAL=1'); assert.equal(fs.readFileSync(path.join(root, '.env.staging.local'), 'utf8'), template('staging'));
  assert.throws(() => profileMain(['staging', 'init'], root), /exist/); assert.throws(() => profileMain(['../outside', 'init'], root));
}));
test('repository check skips ignored secrets but rejects tracked local DB/config files', () => fixture(root => {
  repository(root); fs.writeFileSync(path.join(root, '.env.local'), 'PRIVATE_LOCAL_VALUE=1'); fs.mkdirSync(path.join(root, '.local-db')); fs.writeFileSync(path.join(root, '.local-db', 'data'), 'unchanged');
  assert.equal(inspect(root).passed, true);
  sh(root, ['add', '-f', '.env.local']); assert.ok(inspect(root).findings.some(x => x.reason === 'protected-local-file'));
}));
test('a new repository passes before its first commit or remote exists', () => fixture(root => {
  repository(root); const first = sh(root, ['rev-parse', 'HEAD']).trim(); sh(root, ['update-ref', '-d', 'refs/heads/staging', first]);
  assert.equal(inspect(root).passed, true);
}));
test('staged secret is rejected even after the working file was replaced by safe text; values never enter output', () => fixture(root => {
  repository(root); const secret = ['sk', 'proj'].join('-') + '-' + 'Z'.repeat(40);
  fs.writeFileSync(path.join(root, 'staged.js'), 'const key="' + secret + '";'); sh(root, ['add', 'staged.js']); fs.writeFileSync(path.join(root, 'staged.js'), 'const key=null;');
  const result = inspect(root); assert.ok(result.findings.some(x => x.source === 'index' && x.reason === 'possible-openai-key')); assert.ok(!JSON.stringify(result).includes(secret));
}));
test('deleted credentials still fail reachable-history checks', () => fixture(root => {
  repository(root); const secret = ['ghp', 'X'.repeat(40)].join('_'); fs.writeFileSync(path.join(root, 'old.js'), 'const key="' + secret + '";'); sh(root, ['add', '.']); sh(root, ['commit', '-m', 'Synthetic credential fixture']); sh(root, ['rm', 'old.js']); sh(root, ['commit', '-m', 'Remove fixture']);
  const result = inspect(root); assert.ok(result.findings.some(x => x.source === 'history' && x.reason === 'possible-github-token')); assert.ok(!JSON.stringify(result).includes(secret));
}));
test('remote embedded credentials and symlink files are rejected without reading their target', () => fixture(root => {
  repository(root); sh(root, ['remote', 'add', 'origin', 'https://synthetic-token@github.com/owner/repository.git']); assert.ok(inspect(root).findings.some(x => x.reason === 'credential-in-remote-url'));
  sh(root, ['remote', 'remove', 'origin']); fs.symlinkSync('/nonexistent-outside-fixture', path.join(root, 'outside.js')); assert.ok(inspect(root).findings.some(x => x.reason === 'symlink-needs-review')); sh(root, ['add', 'outside.js']); assert.ok(inspect(root).findings.some(x => x.reason === 'symlink-needs-review'));
}));
test('source templates remain allowed while embedded remote DB passwords and key material are detected', () => {
  assert.deepEqual(contentIssues(Buffer.from(template('staging'))), []);
  assert.ok(contentIssues(Buffer.from(synthetic().DATABASE_URL)).includes('embedded-database-credential'));
  assert.ok(contentIssues(Buffer.from(['-----BEGIN', 'PRIVATE KEY-----'].join(' '))).includes('private-key'));
});
test('hosted smoke checks identity/list/logout and commit without calling AI or business commands', async () => {
  const {smoke} = await import('../scripts/smoke-live.mjs'); let signed = false, calls = [];
  const fake = async (url, options) => {
    const p = url.pathname; calls.push([p, options.method || 'GET']);
    assert.equal(options.redirect, 'manual'); assert.ok(options.signal);
    if (p === '/api/health') return Response.json({status: 'ready', environment: 'staging', release: stamp});
    if (p === '/login') return new Response('', {headers: {'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin'}});
    if (p === '/api/workflow') return new Response('', {status: 403});
    if (p === '/api/auth/login') { signed = true; return Response.json({}, {headers: {'set-cookie': 'smarterp_session=synthetic; HttpOnly; SameSite=Lax; Secure'}}); }
    if (p === '/api/auth/logout') { signed = false; return Response.json({}); }
    if (p === '/api/auth/me') return Response.json({user: {role: 'finance'}});
    if (p === '/api/records/customers') return options.headers?.cookie && signed ? Response.json({data: [{id: 'synthetic'}], meta: {total: 1}}) : new Response('', {status: 401});
    throw new Error('Unexpected request');
  };
  const result = await smoke({SMOKE_BASE_URL: synthetic().APP_URL, SMOKE_EXPECT_COMMIT: stamp.commit, SMOKE_EXPECT_ENV: 'staging', SMARTERP_SMOKE_EMAIL: 'fixture@smarterp.local', SMARTERP_SMOKE_PASSWORD: 'synthetic-only'}, fake);
  assert.ok(result.passed && result.authenticatedListTested && result.logoutVerified); assert.ok(!JSON.stringify(result).includes('synthetic-only')); assert.equal(result.aiCalls, 0); assert.ok(calls.every(([p]) => p !== '/api/brief'));
  await assert.rejects(smoke({SMOKE_BASE_URL: synthetic().APP_URL, SMOKE_EXPECT_COMMIT: 'b'.repeat(40)}, fake), /commit differs/);
});
