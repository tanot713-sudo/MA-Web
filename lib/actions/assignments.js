/* ================================================================
   ASSIGNMENTS + SURVEY ASSIGNMENTS — ported from Code.gs
   (both sheets share the exact same shape/logic, just a different
   sheet name, same as the original)
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, ensureHeaders, getAllValues, batchSetCells, appendRawRow } = require('../sheets');

const ASSIGN_HEADERS = [
  'id', 'project', 'scopeType', 'locName', 'subName', 'equipment',
  'masterId', 'missingFields', 'assignedTo', 'assignedBy', 'note',
  'status', 'createdAt', 'doneAt', 'doneData', 'targetDate'
];

async function saveAssignmentRow(sheetName, assignment) {
  const sh = await getSheet(sheetName);
  await ensureHeaders(sh, ASSIGN_HEADERS);
  const data = await getAllValues(sh);
  const hdr = data[0] || [];
  const idCol = hdr.indexOf('id');
  for (let r = 1; r < data.length; r++) {
    if (data[r][idCol] === assignment.id) {
      const updates = ASSIGN_HEADERS.map((h, i) => {
        let v = assignment[h];
        if (h === 'missingFields' || h === 'doneData') v = JSON.stringify(v || (h === 'doneData' ? {} : []));
        return { row: r + 1, col: i + 1, value: v == null ? '' : v };
      });
      await batchSetCells(sh, updates);
      return;
    }
  }
  const row = ASSIGN_HEADERS.map(h => {
    let v = assignment[h];
    if (h === 'missingFields' || h === 'doneData') v = JSON.stringify(v || (h === 'doneData' ? {} : []));
    return v == null ? '' : v;
  });
  await appendRawRow(sh, row);
}

async function listAssignmentRows(sheetName, _user) {
  const role = (_user && _user.role) || '';
  const username = (_user && _user.username) || '';
  const userProjs = (_user && _user.project ? _user.project.split(',').map(p => p.trim()).filter(Boolean) : []);
  const sh = await getSheet(sheetName);
  await ensureHeaders(sh, ASSIGN_HEADERS);
  const data = await getAllValues(sh);
  if (data.length < 2) return [];
  const hdr = data[0];
  const rows = data.slice(1).map(r => {
    const obj = {};
    hdr.forEach((h, i) => {
      let v = r[i];
      if (h === 'missingFields' || h === 'doneData') {
        try { v = JSON.parse(v || (h === 'doneData' ? '{}' : '[]')); }
        catch (e) { v = h === 'doneData' ? {} : []; }
      }
      obj[h] = v;
    });
    return obj;
  }).filter(a => a.id);
  if (role === 'admin' || role === 'manager') return rows;
  if (role === 'leader') return rows.filter(a => userProjs.includes(a.project) || a.assignedBy === username || a.assignedTo === username);
  return rows.filter(a => a.assignedTo === username);
}

async function completeAssignmentRow(sheetName, id, doneData) {
  const sh = await getSheet(sheetName);
  const data = await getAllValues(sh);
  const hdr = data[0] || [];
  const idCol = hdr.indexOf('id');
  const statusCol = hdr.indexOf('status');
  const doneAtCol = hdr.indexOf('doneAt');
  const doneDataCol = hdr.indexOf('doneData');
  for (let r = 1; r < data.length; r++) {
    if (data[r][idCol] === id) {
      await batchSetCells(sh, [
        { row: r + 1, col: statusCol + 1, value: 'done' },
        { row: r + 1, col: doneAtCol + 1, value: Date.now() },
        { row: r + 1, col: doneDataCol + 1, value: JSON.stringify(doneData || {}) }
      ]);
      return true;
    }
  }
  return false;
}

async function actionSaveAssignment({ assignment, _user }) {
  if (!assignment || !assignment.id) return { ok: false, message: 'No assignment' };
  await saveAssignmentRow(CONFIG.SHEETS.ASSIGNMENTS, assignment);
  return { ok: true };
}
async function actionListAssignments({ _user }) {
  return { ok: true, assignments: await listAssignmentRows(CONFIG.SHEETS.ASSIGNMENTS, _user) };
}
async function actionCompleteAssignment({ id, doneData, _user }) {
  if (!id) return { ok: false, message: 'No id' };
  const ok = await completeAssignmentRow(CONFIG.SHEETS.ASSIGNMENTS, id, doneData);
  return ok ? { ok: true } : { ok: false, message: 'Not found' };
}

async function actionSaveSurveyAssignment({ assignment, _user }) {
  if (!assignment || !assignment.id) return { ok: false, message: 'No assignment' };
  await saveAssignmentRow(CONFIG.SHEETS.SURVEY_ASSIGNMENTS, assignment);
  return { ok: true };
}
async function actionListSurveyAssignments({ _user }) {
  return { ok: true, assignments: await listAssignmentRows(CONFIG.SHEETS.SURVEY_ASSIGNMENTS, _user) };
}
async function actionCompleteSurveyAssignment({ id, doneData, _user }) {
  if (!id) return { ok: false, message: 'No id' };
  const ok = await completeAssignmentRow(CONFIG.SHEETS.SURVEY_ASSIGNMENTS, id, doneData);
  return ok ? { ok: true } : { ok: false, message: 'Not found' };
}

module.exports = {
  ASSIGN_HEADERS,
  actionSaveAssignment, actionListAssignments, actionCompleteAssignment,
  actionSaveSurveyAssignment, actionListSurveyAssignments, actionCompleteSurveyAssignment
};
