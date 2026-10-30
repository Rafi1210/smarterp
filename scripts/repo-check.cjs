// Read-only heuristic preflight. Never prints a matched credential or file content.
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const CAP = 6 * 1024 * 1024;
function git(root, args, input) {
  const result = spawnSync('git', args, {cwd: root, input, encoding: input === undefined ? 'utf8' : undefined, maxBuffer: 96 * 1024 * 1024, windowsHide: true});
  if (result.error || result.status !== 0) throw new Error('Git inspection failed. Run this inside the SmartERP repository with Git installed.');
  return result.stdout;
}
function protectedPath(file) {
  const p = file.replaceAll('\\', '/'), parts = p.split('/'), name = parts.at(-1);
  return parts.some(s => ['.local-db', '.smarterp-backups', '.deployment-reports', 'node_modules', '.next', '.netlify', '.qa-db'].includes(s)) ||
    (name.startsWith('.env') && name !== '.env.example') || /\.(pem|key|p12|pfx)$/i.test(name) || /^update-smarterp-.*\.mjs(?:\.txt)?$/.test(name);
}
function contentIssues(bytes) {
  if (bytes.includes(0)) return []; // Binary inspection is outside this heuristic scanner.
  const s = bytes.toString('utf8'), issues = new Set();
  if (/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/.test(s)) issues.add('private-key');
  if (/\bsk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{24,}\b/.test(s)) issues.add('possible-openai-key');
  if (/\b(?:gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{35,})\b/.test(s)) issues.add('possible-github-token');
  const placeholder = value => !value || /^(?:(?:your|choose|set|generate|replace|change|use|create|pick)[-_ ]|EXAMPLE|<)/i.test(value) || /^(?:PASSWORD|USER|YOUR_API_KEY|YOUR_OPENAI_API_KEY|YOUR_OWN_CODE_HERE)$/i.test(value);
  for (const match of s.matchAll(/postgres(?:ql)?:\/\/([^:/\s"'`]+):([^@\s"'`]+)@([^/\s"'`]+)/g)) {
    const [, user, password, host] = match;
    const local = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
    if (!local && !placeholder(user) && !placeholder(password)) issues.add('embedded-database-credential');
  }
  for (const match of s.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*(?:PASSWORD|TOKEN|SECRET|API_KEY|WRITE_CODE)[A-Z0-9_]*)\s*=\s*([^\r\n]*)/gm)) {
    let value = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (value.startsWith('#')) value = '';
    if (!placeholder(value) && value.length >= 10 && !value.includes('${') && !value.startsWith('process.env.')) issues.add('literal-secret-assignment');
  }
  return [...issues];
}
function inspect(root = process.cwd(), {history = true} = {}) {
  const actual = git(root, ['rev-parse', '--show-toplevel']).trim();
  if (fs.realpathSync(actual) !== fs.realpathSync(root)) throw new Error('Run the check at the project repository root, not in a parent repository.');
  const findings = [], seen = new Set(), objects = new Map();
  const add = (file, reason, source) => { const key = file + reason + source; if (!seen.has(key)) { seen.add(key); findings.push({path: file, reason, source}); } };
  const files = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  for (const file of new Set(files)) {
    if (protectedPath(file)) { add(file, 'protected-local-file', 'working-tree'); continue; }
    const full = path.join(root, file);
    let stat; try { stat = fs.lstatSync(full); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    if (stat.isSymbolicLink()) { add(file, 'symlink-needs-review', 'working-tree'); continue; }
    if (!stat.isFile()) continue;
    if (stat.size > CAP) { add(file, 'text-scan-size-limit', 'working-tree'); continue; }
    for (const reason of contentIssues(fs.readFileSync(full))) add(file, reason, 'working-tree');
  }
  for (const entry of git(root, ['ls-files', '--stage', '-z']).split('\0').filter(Boolean)) {
    const m = entry.match(/^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/);
    if (!m) throw new Error('Unrecognized Git index entry.');
    const [, mode, oid, stage, file] = m;
    if (stage !== '0') add(file, 'unresolved-index-conflict', 'index');
    if (mode === '120000') add(file, 'symlink-needs-review', 'index');
    if (protectedPath(file)) add(file, 'protected-local-file', 'index');
    objects.set(oid, {file, source: 'index'});
  }
  if (history) {
    const refs = git(root, ['rev-list', '--objects', '--all']).split('\n').filter(Boolean);
    for (const row of refs) {
      const space = row.indexOf(' '); if (space < 0) continue;
      const oid = row.slice(0, space), file = row.slice(space + 1);
      if (protectedPath(file)) add(file, 'protected-file-in-history', 'history');
      if (!objects.has(oid)) objects.set(oid, {file, source: 'history'});
    }
  }
  if (objects.size) {
    const info = git(root, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], Buffer.from([...objects.keys()].join('\n') + '\n')).toString('utf8');
    const blobs = [];
    for (const line of info.trim().split('\n')) {
      const [oid, type, size] = line.split(' ');
      if (type !== 'blob') continue;
      if (Number(size) > CAP) { const o = objects.get(oid); add(o.file, 'history-scan-size-limit', o.source); } else blobs.push(oid);
    }
    if (blobs.length) {
      const payload = git(root, ['cat-file', '--batch'], Buffer.from(blobs.join('\n') + '\n'));
      let offset = 0;
      for (const oid of blobs) {
        const end = payload.indexOf(10, offset);
        const header = payload.subarray(offset, end).toString('ascii').split(' '), size = Number(header[2]);
        if (header[0] !== oid || header[1] !== 'blob' || !Number.isSafeInteger(size)) throw new Error('Git object inspection failed.');
        const bytes = payload.subarray(end + 1, end + 1 + size), o = objects.get(oid);
        for (const reason of contentIssues(bytes)) add(o.file, reason, o.source);
        offset = end + size + 2;
      }
    }
  }
  const protectedSamples = ['.env.local', '.env.staging.local', '.local-db/probe', '.deployment-reports/probe', '.smarterp-backups/probe', 'update-smarterp-check.mjs'];
  const ignored = spawnSync('git', ['check-ignore', '--no-index', '--stdin', '-z'], {cwd: root, input: protectedSamples.join('\0') + '\0', encoding: 'utf8'});
  const ignoredSet = new Set((ignored.stdout || '').split('\0'));
  for (const file of protectedSamples) if (!ignoredSet.has(file)) add('.gitignore', 'missing-protected-ignore-rule', file);
  for (const remote of git(root, ['remote', '-v']).split('\n').filter(Boolean)) {
    if (/https?:\/\/[^/\s]+@/i.test(remote)) add('.git/config', 'credential-in-remote-url', 'configuration');
  }
  return {passed: findings.length === 0, scannedFiles: new Set(files).size, scannedObjects: objects.size, historyChecked: history, findings, limitation: 'Heuristic plaintext scan; not a security certification or proof that no secret exists.'};
}
function main() {
  try { const result = inspect(); console.log(JSON.stringify(result, null, 2)); if (!result.passed) process.exitCode = 1; }
  catch { console.error('Repository check failed. Initialize Git at the project root and inspect Git configuration; no credentials are printed.'); process.exitCode = 1; }
}
if (require.main === module) main();
module.exports = {inspect, protectedPath, contentIssues};
