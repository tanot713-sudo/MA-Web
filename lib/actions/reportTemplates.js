/* ================================================================
   REPORT TEMPLATES + FIELD PRESETS + REPORT INFO — ported from Code.gs
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, sheetToObjects, ensureHeaders, appendRow, deleteRowById, getAllValues, setCell, colLetter, setRange } = require('../sheets');
const { getFolder } = require('../drive');
const { getDriveClient } = require('../googleAuth');
const { genId, formatDate } = require('../utils');

const REPORT_TEMPLATES_HEADERS = ['id', 'name', 'fileId', 'createdAt'];
const REPORT_PRESETS_HEADERS = ['field', 'value', 'lastUsedAt'];
const REPORT_INFO_HEADERS = ['project', 'contractName', 'contractNo', 'contractDate', 'client', 'clause', 'submittedTo', 'logoCustomer', 'updatedAt'];

async function actionListReportTemplates({ _user }) {
  const sh = await getSheet('ReportTemplates');
  await ensureHeaders(sh, REPORT_TEMPLATES_HEADERS);
  const rows = await sheetToObjects(sh);
  return { ok: true, templates: rows };
}

async function actionSaveReportTemplate({ name, fileId, _user }) {
  if (_user.role !== 'admin' && _user.role !== 'manager') {
    return { ok: false, message: 'เฉพาะ Admin/Manager เท่านั้น' };
  }
  name = String(name || '').trim();
  fileId = String(fileId || '').trim();
  if (!name || !fileId) return { ok: false, message: 'ต้องกรอกชื่อและ File ID' };

  try {
    const drive = getDriveClient();
    await drive.files.get({ fileId, fields: 'id' });
  } catch (e) {
    return { ok: false, message: 'ไม่พบไฟล์ หรือไม่มีสิทธิ์เข้าถึง File ID นี้' };
  }

  const sh = await getSheet('ReportTemplates');
  await ensureHeaders(sh, REPORT_TEMPLATES_HEADERS);
  const rows = await sheetToObjects(sh);
  if (rows.some(r => r.fileId === fileId)) return { ok: false, message: 'Template นี้มีอยู่แล้ว' };
  await appendRow(sh, REPORT_TEMPLATES_HEADERS, {
    id: genId(), name, fileId, createdAt: new Date().toISOString()
  });
  return { ok: true };
}

async function actionDeleteReportTemplate({ id, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  const sh = await getSheet('ReportTemplates');
  const ok = await deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

async function actionListReportPresets({ _user }) {
  const sh = await getSheet('ReportPresets');
  await ensureHeaders(sh, REPORT_PRESETS_HEADERS);
  const rows = await sheetToObjects(sh);
  const byField = {};
  rows.forEach(r => {
    if (!r.field || !r.value) return;
    if (!byField[r.field]) byField[r.field] = [];
    if (!byField[r.field].includes(r.value)) byField[r.field].push(r.value);
  });
  return { ok: true, presets: byField };
}

async function actionSaveReportPreset({ fields, _user }) {
  if (!fields || typeof fields !== 'object') return { ok: false, message: 'ไม่มีข้อมูล' };
  const sh = await getSheet('ReportPresets');
  await ensureHeaders(sh, REPORT_PRESETS_HEADERS);
  const rows = await sheetToObjects(sh);
  const now = new Date().toISOString();
  for (const field of Object.keys(fields)) {
    const value = String(fields[field] || '').trim();
    if (!value) continue;
    const existingRow = findRowByFieldValue(rows, field, value);
    if (existingRow > 0) {
      await setCell(sh, existingRow, REPORT_PRESETS_HEADERS.indexOf('lastUsedAt') + 1, now);
    } else {
      await appendRow(sh, REPORT_PRESETS_HEADERS, { field, value, lastUsedAt: now });
    }
  }
  return { ok: true };
}

function findRowByFieldValue(rows, field, value) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].field === field && rows[i].value === value) return i + 2; // +2: header row + 1-index
  }
  return -1;
}

function normalizeDateFields(rows) {
  return rows.map(r => {
    const out = {};
    Object.keys(r).forEach(k => {
      out[k] = (r[k] instanceof Date) ? formatDate(r[k], 'dd/MM/yyyy') : r[k];
    });
    return out;
  });
}

async function actionListReportInfo({ _user }) {
  const sh = await getSheet('ReportInfo');
  await ensureHeaders(sh, REPORT_INFO_HEADERS);
  return { ok: true, info: normalizeDateFields(await sheetToObjects(sh)) };
}

async function actionSaveReportInfo({ row, _user }) {
  if (!row || !String(row.project || '').trim()) return { ok: false, message: 'ต้องมีชื่อโครงการ' };
  const sh = await getSheet('ReportInfo');
  await ensureHeaders(sh, REPORT_INFO_HEADERS);
  const data = await getAllValues(sh);
  const hdrs = data[0];
  const pCol = hdrs.indexOf('project');
  row.updatedAt = new Date().toISOString();
  for (let i = 1; i < data.length; i++) {
    if (data[i][pCol] === row.project) {
      const rowNum = i + 1;
      const currentVals = hdrs.map((h, ci) => (row[h] !== undefined ? row[h] : data[i][ci]));
      await setRange(sh, rowNum, 1, [currentVals]);
      return { ok: true };
    }
  }
  await appendRow(sh, REPORT_INFO_HEADERS, row);
  return { ok: true };
}

async function actionBulkSaveReportInfo({ rows, _user }) {
  if (!Array.isArray(rows)) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };
  let count = 0;
  for (const row of rows) {
    if (row && String(row.project || '').trim()) { await actionSaveReportInfo({ row, _user }); count++; }
  }
  return { ok: true, count };
}

async function actionGetCustomerLogoFolderUrl({ _user }) {
  const folderId = await getFolder([CONFIG.FOLDERS.AMR_IMAGES, CONFIG.FOLDERS.CUSTOMER_LOGOS]);
  return { ok: true, url: `https://drive.google.com/drive/folders/${folderId}` };
}

module.exports = {
  REPORT_TEMPLATES_HEADERS, REPORT_PRESETS_HEADERS, REPORT_INFO_HEADERS,
  actionListReportTemplates, actionSaveReportTemplate, actionDeleteReportTemplate,
  actionListReportPresets, actionSaveReportPreset,
  actionListReportInfo, actionSaveReportInfo, actionBulkSaveReportInfo,
  actionGetCustomerLogoFolderUrl
};
