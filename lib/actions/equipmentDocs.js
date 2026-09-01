/* ================================================================
   EQUIPMENT DOCUMENTS — ported from Code.gs
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, sheetToObjects, ensureHeaders, appendRow, updateRowById, deleteRowById } = require('../sheets');
const { getOrCreateDynamicFolder, saveImageToFolder } = require('../drive');
const { userCanAccessProject } = require('../common');
const { genId } = require('../utils');

const EQUIPMENT_DOC_HEADERS = ['id', 'project', 'system', 'locName', 'subName', 'equipment', 'docName', 'fileUrl', 'fileName', 'note', 'uploadedBy', 'uploadedAt'];

async function actionListEquipmentDocs({ _user }) {
  const sh = await getSheet(CONFIG.SHEETS.EQUIPMENT_DOCS);
  await ensureHeaders(sh, EQUIPMENT_DOC_HEADERS);
  let rows = (await sheetToObjects(sh)).filter(r => r.id);
  if (_user.role === 'leader' || _user.role === 'inspector') {
    rows = rows.filter(r => userCanAccessProject(_user, r.project));
  }
  return { ok: true, docs: rows };
}

async function actionSaveEquipmentDoc({ doc, file, fileName, _user }) {
  if (_user.role !== 'admin')
    return { ok: false, message: 'เฉพาะ admin เท่านั้นที่แนบเอกสารอุปกรณ์ได้' };
  if (!doc || !doc.project || !doc.equipment || !doc.docName)
    return { ok: false, message: 'ต้องมีโครงการ, อุปกรณ์ และชื่อเอกสาร' };
  if (!doc.id && !file)
    return { ok: false, message: 'ต้องแนบไฟล์' };

  const sh = await getSheet(CONFIG.SHEETS.EQUIPMENT_DOCS);
  await ensureHeaders(sh, EQUIPMENT_DOC_HEADERS);

  let fileUrl = doc.fileUrl || '';
  let savedFileName = doc.fileName || '';
  if (file) {
    const folder = await getOrCreateDynamicFolder('AMR Equipment Documents', doc.project, doc.locName, doc.subName, doc.equipment, 'Documents');
    const extMatch = String(fileName || '').match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch ? extMatch[0] : '';
    const safeName = String(doc.docName || fileName || 'doc').replace(/[/\\:*?"<>|]/g, '_');
    fileUrl = await saveImageToFolder(file, `${safeName}_${Date.now()}${ext}`, folder);
    savedFileName = fileName || '';
  }

  if (doc.id) {
    const rows = await sheetToObjects(sh);
    const existing = rows.find(d => d.id === doc.id);
    if (existing) {
      await updateRowById(sh, EQUIPMENT_DOC_HEADERS, doc.id, {
        ...existing,
        project: doc.project, system: doc.system || '', locName: doc.locName || '', subName: doc.subName || '',
        equipment: doc.equipment, docName: doc.docName, fileUrl, fileName: savedFileName, note: doc.note || ''
      });
      return { ok: true, action: 'updated' };
    }
  }

  const id = genId();
  await appendRow(sh, EQUIPMENT_DOC_HEADERS, {
    id, project: doc.project, system: doc.system || '', locName: doc.locName || '', subName: doc.subName || '',
    equipment: doc.equipment, docName: doc.docName, fileUrl, fileName: savedFileName, note: doc.note || '',
    uploadedBy: _user.username, uploadedAt: new Date().toISOString()
  });
  return { ok: true, action: 'created', id };
}

async function actionDeleteEquipmentDoc({ id, _user }) {
  if (_user.role !== 'admin')
    return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  const sh = await getSheet(CONFIG.SHEETS.EQUIPMENT_DOCS);
  const ok = await deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

module.exports = { EQUIPMENT_DOC_HEADERS, actionListEquipmentDocs, actionSaveEquipmentDoc, actionDeleteEquipmentDoc };
