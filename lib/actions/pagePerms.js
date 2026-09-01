/* ================================================================
   PAGE PERMISSIONS — ported from Code.gs
   ================================================================ */
const { getSheet, sheetToObjects, ensureHeaders, clearContents, appendRawRow } = require('../sheets');

const PERM_HEADERS = ['role', 'pages'];
const DEFAULT_PAGES = {
  manager: ['overview', 'add', 'records', 'survey', 'import', 'delete', 'wi', 'eqdocs', 'store'],
  leader: ['overview', 'add', 'records', 'survey', 'delete', 'wi', 'eqdocs', 'store'],
  inspector: ['add', 'records', 'survey', 'wi', 'eqdocs', 'store'],
  observer: ['records', 'survey', 'wi', 'eqdocs', 'store']
};
const ALL_PAGES = ['overview', 'add', 'records', 'survey', 'import', 'master', 'users', 'delete', 'pm', 'cm', 'wi', 'eqdocs', 'store'];

async function getPagePermissions(role) {
  if (role === 'admin') return ALL_PAGES;
  const sh = await getSheet('PagePerms');
  await ensureHeaders(sh, PERM_HEADERS);
  const rows = await sheetToObjects(sh);
  const rec = rows.find(r => r.role === role);
  if (rec && rec.pages) return String(rec.pages).split(',').map(p => p.trim()).filter(Boolean);
  return DEFAULT_PAGES[role] || [];
}

async function actionGetPagePerms({ _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin' };
  const sh = await getSheet('PagePerms');
  await ensureHeaders(sh, PERM_HEADERS);
  const rows = await sheetToObjects(sh);
  const result = {};
  ['manager', 'leader', 'inspector', 'observer'].forEach(role => {
    const rec = rows.find(r => r.role === role);
    result[role] = rec && rec.pages
      ? String(rec.pages).split(',').map(p => p.trim()).filter(Boolean)
      : (DEFAULT_PAGES[role] || []);
  });
  return { ok: true, perms: result, allPages: ALL_PAGES };
}

async function actionSetPagePerms({ perms, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin' };
  const sh = await getSheet('PagePerms');
  await clearContents(sh);
  await ensureHeaders(sh, PERM_HEADERS);
  for (const [role, pages] of Object.entries(perms)) {
    await appendRawRow(sh, [role, Array.isArray(pages) ? pages.join(',') : pages]);
  }
  return { ok: true };
}

module.exports = { PERM_HEADERS, DEFAULT_PAGES, ALL_PAGES, getPagePermissions, actionGetPagePerms, actionSetPagePerms };
