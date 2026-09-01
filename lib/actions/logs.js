/* ================================================================
   LOGS — ported from Code.gs
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, ensureHeaders, appendRawRow } = require('../sheets');

const LOG_HEADERS = ['ts', 'action', 'username', 'device', 'browser', 'ip'];

async function writeLog(action, username, ctx) {
  try {
    const sh = await getSheet(CONFIG.SHEETS.LOGS);
    await ensureHeaders(sh, LOG_HEADERS);
    await appendRawRow(sh, [
      new Date().toISOString(), action, username,
      ctx.device || '',
      ctx.browser ? ctx.browser.slice(0, 80) : '',
      ctx.ip || ''
    ]);
  } catch (e) { /* never let logging crash the actual request */ }
}

module.exports = { LOG_HEADERS, writeLog };
