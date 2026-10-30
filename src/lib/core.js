const crypto = require('node:crypto');
class AppError extends Error {
  constructor(message, status = 400, details = undefined) { super(message); this.status = status; this.details = details; }
}
function fail(condition, message, status = 400, details) { if (!condition) throw new AppError(message, status, details); }
function exact(value, places = 2, label = 'Amount') {
  const text = String(value ?? '').trim();
  fail(new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(text), `${label}: use a nonnegative decimal with at most ${places} decimal places.`);
  const [a, b = ''] = text.split('.');
  const result = BigInt(a) * 10n ** BigInt(places) + BigInt(b.padEnd(places, '0'));
  fail(result <= 9000000000000n, `${label} exceeds the supported safe range.`);
  return result.toString();
}
function date(value, label = 'Date') {
  const s = String(value || '');
  fail(/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, `${label} must be a valid YYYY-MM-DD date.`);
  return s;
}
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function calendar(value) { return typeof value === 'string' ? value.slice(0,10) : `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`; }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function stableHash(value) { return hash(JSON.stringify(value)); }
function safeCell(value) {
  const text = value == null ? '' : String(value);
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
}
function integer(value, label, { min = 0, max = 1000000000 } = {}) {
  fail(/^\d+$/.test(String(value).trim()), `${label} must be a whole number.`);
  const n = Number(value); fail(Number.isSafeInteger(n) && n >= min && n <= max, `${label} must be between ${min} and ${max}.`); return n;
}
function environment() {
  return require('./deployment.js').runtimeEnvironment();
}
module.exports = { AppError, fail, exact, date, today, calendar, hash, stableHash, safeCell, integer, environment };
