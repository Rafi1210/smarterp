import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
function ensure(ok, message) { if (!ok) throw new Error(message); }
export async function smoke(env = process.env, fetcher = fetch) {
  let base; try { base = new URL(env.SMOKE_BASE_URL); } catch { throw new Error('Set SMOKE_BASE_URL to the actual local or staging origin.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  ensure(!base.username && !base.password && !base.search && !base.hash && base.pathname === '/' && (base.protocol === 'https:' || (local && base.protocol === 'http:')), 'Use an HTTPS hosted origin or an explicit local HTTP origin.');
  const origin = base.origin;
  const request = (url, options = {}) => fetcher(new URL(url, origin), {...options, redirect: 'manual', signal: AbortSignal.timeout(15000)});
  const result = {passed: false, checkedAt: new Date().toISOString(), origin, readiness: false, anonymousRecordsBlocked: false, wrongOriginBlocked: false, securityHeaders: false, authenticatedListTested: false, logoutVerified: false, aiCalls: 0, businessMutations: 0};
  const ready = await request('/api/health'), health = await ready.json();
  ensure(ready.ok && health.status === 'ready', 'Database readiness failed.');
  if (env.SMOKE_EXPECT_ENV) ensure(health.environment === env.SMOKE_EXPECT_ENV, 'The URL is connected to the wrong database environment.');
  if (env.SMOKE_EXPECT_COMMIT) ensure(/^[a-f0-9]{40}$/.test(env.SMOKE_EXPECT_COMMIT) && health.release?.commit === env.SMOKE_EXPECT_COMMIT, 'The deployed commit differs from the expected tested commit.');
  if (!local) ensure(/^[a-f0-9]{40}$/.test(health.release?.commit || '') && ['staging', 'main'].includes(health.release?.branch), 'Hosted release metadata is missing.');
  result.readiness = true; result.environment = health.environment; result.release = health.release || null;
  const closed = await request('/api/records/customers');
  ensure(closed.status === 401, 'Anonymous users can access business records.'); result.anonymousRecordsBlocked = true;
  const wrong = await request('/api/workflow', {method: 'POST', headers: {origin: 'https://wrong-origin.invalid', 'Content-Type': 'application/json'}, body: '{}'});
  ensure(wrong.status === 403, 'Wrong-origin mutation was not rejected.'); result.wrongOriginBlocked = true;
  const loginPage = await request('/login');
  ensure(loginPage.status === 200 && loginPage.headers.get('x-frame-options') === 'DENY' && loginPage.headers.get('x-content-type-options') === 'nosniff' && loginPage.headers.get('referrer-policy') === 'strict-origin-when-cross-origin', 'Expected browser security headers are missing.'); result.securityHeaders = true;
  const email = env.SMARTERP_SMOKE_EMAIL, password = env.SMARTERP_SMOKE_PASSWORD;
  ensure(local || (email && password), 'Hosted acceptance needs a smoke account to verify one persistent protected list.');
  ensure(Boolean(email) === Boolean(password), 'Set both smoke email and password, or neither for local public-only checks.');
  if (email && password) {
    const login = await request('/api/auth/login', {method: 'POST', headers: {origin, 'Content-Type': 'application/json'}, body: JSON.stringify({email, password})});
    ensure(login.ok, 'Smoke account sign-in failed.');
    const setCookie = login.headers.get('set-cookie'), cookie = setCookie?.split(';')[0];
    ensure(cookie && /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie) && (local || /;\s*Secure/i.test(setCookie)), 'Session cookie protection is missing.');
    let loggedOut = false;
    try {
      const me = await request('/api/auth/me', {headers: {cookie}});
      ensure(me.ok, 'Authenticated session could not be read.');
      const response = await request('/api/records/customers', {headers: {cookie}}), data = await response.json();
      ensure(response.ok && Array.isArray(data.data) && data.data.length > 0, 'Expected an authenticated persistent customer list.');
      result.authenticatedListTested = true; result.records = data.meta.total;
      ensure((await request('/api/auth/logout', {method: 'POST', headers: {cookie, origin}})).ok, 'Smoke session logout failed.');
      loggedOut = true;
      ensure((await request('/api/records/customers', {headers: {cookie}})).status === 401, 'Logged-out session still reads business records.'); result.logoutVerified = true;
    } finally { if (!loggedOut) await request('/api/auth/logout', {method: 'POST', headers: {cookie, origin}}).catch(() => {}); }
  }
  result.passed = true;
  return result;
}
async function report(file, value) {
  if (!file) return;
  const directory = path.resolve('.deployment-reports'), target = path.resolve(file);
  ensure(path.dirname(target) === directory && target.endsWith('.json'), 'Smoke reports belong in .deployment-reports/*.json.');
  await fs.mkdir(directory, {recursive: true, mode: 0o700});
  ensure(!(await fs.lstat(directory)).isSymbolicLink(), 'Refusing a symlink report directory.');
  const temp = target + '.' + process.pid + '.tmp';
  try { await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', {flag: 'wx', mode: 0o600}); await fs.rename(temp, target); }
  finally { await fs.unlink(temp).catch(() => {}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const result = await smoke(); await report(process.env.SMOKE_REPORT_FILE, result); console.log(JSON.stringify(result)); }
  catch (error) { await report(process.env.SMOKE_REPORT_FILE, {passed: false, checkedAt: new Date().toISOString(), reason: 'Smoke check failed; no credentials or session values are included.'}).catch(() => {}); console.error(error.message); process.exitCode = 1; }
}
