/* ================================================================
   MASTER DATA — ported from Code.gs
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, sheetToObjects, ensureHeaders, clearContents, setRange } = require('../sheets');
const { userCanAccessProject } = require('../common');

const MASTER_HEADERS = [
  'id', 'project', 'system', 'typeLocation', 'location', 'sublocation',
  'equipment', 'brand', 'model', 'asset', 'serial', 'order'
];

async function actionSaveMaster({ master, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  const sh = await getSheet(CONFIG.SHEETS.MASTER);
  await clearContents(sh);
  if (!master || !master.length) return { ok: true, count: 0 };
  const rows = [MASTER_HEADERS, ...master.map(m => MASTER_HEADERS.map(h => (m[h] != null ? m[h] : '')))];
  await setRange(sh, 1, 1, rows);
  return { ok: true, count: master.length };
}

async function actionListMaster({ _user }) {
  const sh = await getSheet(CONFIG.SHEETS.MASTER);
  await ensureHeaders(sh, MASTER_HEADERS);
  let rows = await sheetToObjects(sh);
  if (_user.role === 'leader' || _user.role === 'inspector') {
    rows = rows.filter(m => userCanAccessProject(_user, m.project));
  }
  return { ok: true, master: rows };
}

async function actionGetProgress({ _user }) {
  const master = await sheetToObjects(await getSheet(CONFIG.SHEETS.MASTER));
  const records = await sheetToObjects(await getSheet(CONFIG.SHEETS.RECORDS));
  const role = _user.role;

  const projectMap = {};
  master.forEach(m => {
    if ((role === 'leader' || role === 'inspector') && !userCanAccessProject(_user, m.project)) return;
    if (!projectMap[m.project]) projectMap[m.project] = { total: 0, serials: new Set() };
    projectMap[m.project].total++;
    if (m.serial) projectMap[m.project].serials.add(m.serial);
  });

  let filteredRecords = records;
  if (role === 'leader' || role === 'inspector') {
    filteredRecords = records.filter(r => userCanAccessProject(_user, r.project));
  }

  const doneSerials = new Set(filteredRecords.map(r => r.serial).filter(Boolean));

  const progress = Object.entries(projectMap).map(([project, info]) => ({
    project,
    total: info.total,
    done: [...info.serials].filter(s => doneSerials.has(s)).length
  })).sort((a, b) => a.project.localeCompare(b.project, 'th'));

  return { ok: true, progress };
}

module.exports = { MASTER_HEADERS, actionSaveMaster, actionListMaster, actionGetProgress };
