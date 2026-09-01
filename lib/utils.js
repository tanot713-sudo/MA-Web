/* ================================================================
   UTILS — replaces GAS's built-in Utilities service
   ================================================================ */
const crypto = require('crypto');

function genToken() {
  return crypto.randomUUID();
}

function genId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

// same salted-SHA256 scheme as the old hashPw() in Code.gs, so existing
// password hashes already stored in the Users sheet keep working unchanged
function hashPw(pw) {
  return crypto.createHash('sha256').update(String(pw) + 'AMR_SALT_2024').digest('base64');
}

// Utilities.formatDate(date, 'Asia/Bangkok', 'yyyy-MM-dd' | 'dd/MM/yyyy' | 'yyyyMMdd_HHmm') equivalent
function formatDate(date, pattern) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const yyyy = parts.year, MM = parts.month, dd = parts.day;
  const HH = parts.hour === '24' ? '00' : parts.hour, mm = parts.minute, ss = parts.second;
  switch (pattern) {
    case 'yyyy-MM-dd': return `${yyyy}-${MM}-${dd}`;
    case 'dd/MM/yyyy': return `${dd}/${MM}/${yyyy}`;
    case 'yyyyMMdd_HHmm': return `${yyyy}${MM}${dd}_${HH}${mm}`;
    default: return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
  }
}

function safeParseJson(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

module.exports = { genToken, genId, hashPw, formatDate, safeParseJson };
