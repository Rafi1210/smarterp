const { readFileSync } = require('node:fs');
const pathAPI = require('node:path');
const { resolve } = pathAPI;
const { createHash } = require('node:crypto');
function isChildPath(root, file, api = pathAPI) {
  const relative = api.relative(root, file);
  return Boolean(relative) && relative !== '..' && !relative.startsWith('..' + api.sep) && !api.isAbsolute(relative);
}
function verifySources() {
  const root = resolve(process.cwd(), 'data/source');
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json')));
  for (const f of manifest.files) {
    const path = resolve(root, f.path);
    if (!isChildPath(root, path)) throw new Error('Unsafe manifest path.');
    const bytes = readFileSync(path);
    if (bytes.length !== f.bytes || createHash('sha256').update(bytes).digest('hex') !== f.sha256) throw new Error(`Source integrity mismatch: ${f.path}`);
  }
  return manifest.files.length;
}
module.exports = { verifySources, isChildPath };
if (require.main === module) console.log(JSON.stringify({ verifiedFiles: verifySources(), algorithm: 'SHA-256', originalBytes: true }));
