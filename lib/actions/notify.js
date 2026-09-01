/* ================================================================
   ASSIGNMENT NOTIFICATIONS — ported from Code.gs
   findUserRow / findUserEmail / findUserName / sendAssignmentEmail

   Email sending is intentionally stubbed for now (deferred per the
   user's decision when migrating off Apps Script — MailApp had no
   drop-in replacement yet). sendAssignmentEmail() always returns
   false here, same as it would if a user had no email on file — the
   rest of the assign/acknowledge flow (which doesn't depend on the
   email actually going out) behaves identically either way.

   TODO: wire up a real email provider (e.g. Resend) here once that's
   decided, then flip sendAssignmentEmail() back to actually sending.
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, sheetToObjects, ensureHeaders } = require('../sheets');
const { USER_HEADERS } = require('./auth');

async function findUserRow(username) {
  const sh = await getSheet(CONFIG.SHEETS.USERS);
  await ensureHeaders(sh, USER_HEADERS);
  return (await sheetToObjects(sh)).find(r => r.username === username);
}
async function findUserEmail(username) { const u = await findUserRow(username); return u ? (u.email || '') : ''; }
async function findUserName(username) { const u = await findUserRow(username); return u ? (u.name || u.username) : username; }

// eslint-disable-next-line no-unused-vars
async function sendAssignmentEmail(username, kindLabel, detail, assignedByUsername) {
  // TODO(email): not wired up yet — see file header. Always "not sent".
  return false;
}

module.exports = { findUserRow, findUserEmail, findUserName, sendAssignmentEmail };
