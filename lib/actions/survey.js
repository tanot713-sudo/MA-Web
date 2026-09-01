/* ================================================================
   SURVEY (สำรวจภาคสนาม) — ported from Code.gs
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, sheetToObjects, ensureHeaders, appendRow, updateRowById, deleteRowById } = require('../sheets');
const { getOrCreateDynamicFolder, getFolder, saveImageToFolder, getThumbnailUrl } = require('../drive');
const { userCanAccessProject } = require('../common');
const { formatDate } = require('../utils');
const { getPagePermissions } = require('./pagePerms');
const { getSheetsClient, getDriveClient } = require('../googleAuth');

const SURVEY_HEADERS = [
  'id', 'project', 'system', 'location', 'sublocation', 'equipment',
  'brand', 'model', 'serial', 'inspector', 'surveyDate', 'note',
  'imgMain', 'thumbMain', 'imgSticker', 'thumbSticker',
  'createdBy', 'createdAt'
];

async function actionCreateSurvey({ record, images, _user }) {
  const sh = await getSheet(CONFIG.SHEETS.SURVEY);
  await ensureHeaders(sh, SURVEY_HEADERS);

  let imgMain = '', thumbMain = '', imgSticker = '', thumbSticker = '';
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const equip = (record.equipment || 'survey').replace(/[/\\:*?"<>|]/g, '_');
  const ser = (record.serial || '').replace(/[/\\:*?"<>|]/g, '_');
  const fname = suffix => `${equip}_${ser}_${ts}_${suffix}.jpg`;
  const equipFolder = await getOrCreateDynamicFolder(
    'AMR Onsite Inspection Images',
    record.project, record.location, record.sublocation, record.equipment,
    'Equipment Photos'
  );
  const stickerFolder = await getOrCreateDynamicFolder(
    'AMR Onsite Inspection Images',
    record.project, record.location, record.sublocation, record.equipment,
    'Sticker Photos'
  );
  if (images && images.main) {
    imgMain = await saveImageToFolder(images.main, fname('main'), equipFolder);
    thumbMain = getThumbnailUrl(imgMain);
  }
  if (images && images.sticker) {
    imgSticker = await saveImageToFolder(images.sticker, fname('sticker'), stickerFolder);
    thumbSticker = getThumbnailUrl(imgSticker);
  }

  await appendRow(sh, SURVEY_HEADERS, { ...record, imgMain, thumbMain, imgSticker, thumbSticker, createdBy: _user.username });
  exportSurveyExcelToDrive(record.project).catch(err => console.error('exportSurveyExcelToDrive error:', err));
  return { ok: true, serverId: record.id };
}

async function actionListSurvey({ _user }) {
  const sh = await getSheet(CONFIG.SHEETS.SURVEY);
  await ensureHeaders(sh, SURVEY_HEADERS);
  let rows = await sheetToObjects(sh);

  const role = _user.role;
  if (role === 'leader' || role === 'inspector') {
    rows = rows.filter(r => userCanAccessProject(_user, r.project));
  }

  return {
    ok: true,
    records: rows.map(r => ({
      id: r.id, project: r.project, system: r.system,
      location: r.location, sublocation: r.sublocation,
      equipment: r.equipment, brand: r.brand, model: r.model, serial: r.serial,
      inspector: r.inspector, surveyDate: r.surveyDate, note: r.note,
      imgMain: r.imgMain, thumbMain: r.thumbMain,
      imgSticker: r.imgSticker, thumbSticker: r.thumbSticker,
      createdBy: r.createdBy,
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now()
    }))
  };
}

async function actionUpdateSurvey({ record, images, _user }) {
  const sh = await getSheet(CONFIG.SHEETS.SURVEY);
  const rows = await sheetToObjects(sh);
  const old = rows.find(r => r.id === record.id);
  if (!old) return { ok: false, message: 'ไม่พบรายการ' };

  const role = _user.role;
  if ((role === 'leader' || role === 'inspector') && !userCanAccessProject(_user, old.project)) {
    return { ok: false, message: 'ไม่มีสิทธิ์แก้ไขรายการของโครงการนี้' };
  }

  let imgMain = old.imgMain || '';
  let thumbMain = old.thumbMain || '';
  let imgSticker = old.imgSticker || '';
  let thumbSticker = old.thumbSticker || '';
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = (record.serial || record.equipment || 'survey').replace(/[^\w฀-๿]/g, '_');

  if (images && images.main && images.main.startsWith('data:')) {
    const folder = await getFolder([CONFIG.FOLDERS.ONSITE_IMAGES, CONFIG.FOLDERS.ONSITE_IMG_EQUIP]);
    imgMain = await saveImageToFolder(images.main, `${base}_main_${ts}.jpg`, folder);
    thumbMain = getThumbnailUrl(imgMain);
  }
  if (images && images.sticker && images.sticker.startsWith('data:')) {
    const folder = await getFolder([CONFIG.FOLDERS.ONSITE_IMAGES, CONFIG.FOLDERS.ONSITE_IMG_STICK]);
    imgSticker = await saveImageToFolder(images.sticker, `${base}_sticker_${ts}.jpg`, folder);
    thumbSticker = getThumbnailUrl(imgSticker);
  }

  const updated = { ...record, imgMain, thumbMain, imgSticker, thumbSticker, createdBy: old.createdBy };
  const ok = await updateRowById(sh, SURVEY_HEADERS, record.id, updated);
  if (ok) exportSurveyExcelToDrive(record.project).catch(err => console.error('exportSurveyExcelToDrive error:', err));
  return { ok, message: ok ? 'แก้ไขแล้ว' : 'ไม่พบรายการ' };
}

async function actionDeleteSurvey({ id, _user }) {
  const sh = await getSheet(CONFIG.SHEETS.SURVEY);
  const rows = await sheetToObjects(sh);
  const old = rows.find(r => r.id === id);
  if (!old) return { ok: false, message: 'ไม่พบรายการ' };

  const role = _user.role;
  if (role !== 'admin' && !(await getPagePermissions(role)).includes('delete')) {
    return { ok: false, message: 'ไม่มีสิทธิ์ลบ' };
  }
  if ((role === 'leader' || role === 'inspector') && !userCanAccessProject(_user, old.project)) {
    return { ok: false, message: 'ไม่มีสิทธิ์ลบรายการของโครงการนี้' };
  }

  const ok = await deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

// Best-effort background export — mirrors the old exportSurveyExcelToDrive():
// dumps the Survey sheet (optionally filtered to one project) to a fresh
// temporary Google Sheet, exports it as .xlsx via the Drive API, uploads
// that into the target folder (replacing any previous export for the same
// project), then discards the temp sheet. Never throws into the caller —
// callers fire this and .catch() it, same as the original's try/catch.
async function exportSurveyExcelToDrive(project) {
  const sh = await getSheet(CONFIG.SHEETS.SURVEY);
  const rows = await sheetToObjects(sh);
  const list = project ? rows.filter(r => r.project === project) : rows;
  if (!list.length) return;

  const sheetsClient = getSheetsClient();
  const driveClient = getDriveClient();
  const cols = ['project', 'system', 'location', 'sublocation', 'equipment', 'brand', 'model',
    'serial', 'inspector', 'surveyDate', 'note', 'createdBy', 'createdAt'];

  const created = await sheetsClient.spreadsheets.create({
    requestBody: { properties: { title: `Survey_${project || 'All'}_tmp` } },
    fields: 'spreadsheetId'
  });
  const ssId = created.data.spreadsheetId;

  try {
    const values = [cols, ...list.map(r => cols.map(c => r[c] || ''))];
    await sheetsClient.spreadsheets.values.update({
      spreadsheetId: ssId,
      range: 'A1',
      valueInputOption: 'RAW',
      requestBody: { values }
    });

    const exported = await driveClient.files.export(
      { fileId: ssId, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { responseType: 'arraybuffer' }
    );
    const buffer = Buffer.from(exported.data);

    const safeName = (project || 'All').replace(/[^\w฀-๿]/g, '_');
    const dateStr = formatDate(new Date(), 'yyyyMMdd_HHmm');
    const fileName = `Survey_${safeName}_${dateStr}.xlsx`;
    const folderId = await getFolder([CONFIG.FOLDERS.ONSITE_MASTER, CONFIG.FOLDERS.ONSITE_EXCEL]);

    const prefix = `Survey_${safeName}_`;
    const existing = await driveClient.files.list({
      q: `'${folderId}' in parents and trashed=false and name contains '${prefix}'`,
      fields: 'files(id,name)'
    });
    for (const f of existing.data.files || []) {
      if (f.name.startsWith(prefix)) {
        await driveClient.files.update({ fileId: f.id, requestBody: { trashed: true } });
      }
    }

    const { Readable } = require('stream');
    await driveClient.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: Readable.from(buffer)
      },
      fields: 'id'
    });
  } finally {
    await driveClient.files.update({ fileId: ssId, requestBody: { trashed: true } }).catch(() => {});
  }
}

module.exports = { SURVEY_HEADERS, actionCreateSurvey, actionListSurvey, actionUpdateSurvey, actionDeleteSurvey, exportSurveyExcelToDrive };
