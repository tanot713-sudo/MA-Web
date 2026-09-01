/* ================================================================
   CHECKLIST / WI TEMPLATE LIBRARY — ported from Code.gs
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, sheetToObjects, ensureHeaders, appendRow, updateRowById, deleteRowById } = require('../sheets');
const { getOrCreateFolder, getRootFolder, saveImageToFolder } = require('../drive');
const { genId, safeParseJson } = require('../utils');

const CHECKLIST_TEMPLATE_HEADERS = ['id', 'name', 'checklist', 'wiFileUrl', 'wiFileName', 'active', 'createdBy', 'createdAt'];

async function actionListChecklistTemplates({ _user }) {
  const sh = await getSheet(CONFIG.SHEETS.CHECKLIST_TEMPLATES);
  await ensureHeaders(sh, CHECKLIST_TEMPLATE_HEADERS);
  const rows = (await sheetToObjects(sh)).map(r => ({ ...r, checklist: safeParseJson(r.checklist, []) }));
  return { ok: true, templates: rows };
}

async function actionSaveChecklistTemplate({ template, wiFile, wiFileName, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้นที่จัดการคลังเช็คลิสต์/WI ได้' };
  if (!template || !template.name)
    return { ok: false, message: 'ต้องมีชื่อแม่แบบ' };

  const sh = await getSheet(CONFIG.SHEETS.CHECKLIST_TEMPLATES);
  await ensureHeaders(sh, CHECKLIST_TEMPLATE_HEADERS);
  const checklist = JSON.stringify(template.checklist || []);

  let wiFileUrl = template.wiFileUrl || '';
  let wiName = template.wiFileName || '';
  if (wiFile) {
    const folder = await getOrCreateFolder(getRootFolder(), 'WI Documents');
    const safeName = String(wiFileName || 'WI').replace(/[/\\:*?"<>|]/g, '_');
    wiFileUrl = await saveImageToFolder(wiFile, `${safeName}_${Date.now()}.pdf`, folder);
    wiName = wiFileName || '';
  }

  if (template.id) {
    const rows = await sheetToObjects(sh);
    const existing = rows.find(t => t.id === template.id);
    if (existing) {
      await updateRowById(sh, CHECKLIST_TEMPLATE_HEADERS, template.id, {
        ...existing,
        name: template.name, checklist,
        wiFileUrl, wiFileName: wiName,
        active: template.active !== undefined ? String(template.active) : existing.active
      });
      return { ok: true, action: 'updated' };
    }
  }

  const id = genId();
  await appendRow(sh, CHECKLIST_TEMPLATE_HEADERS, {
    id, name: template.name, checklist,
    wiFileUrl, wiFileName: wiName, active: 'true',
    createdBy: _user.username, createdAt: new Date().toISOString()
  });
  return { ok: true, action: 'created', id };
}

async function actionDeleteChecklistTemplate({ id, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้น' };
  const sh = await getSheet(CONFIG.SHEETS.CHECKLIST_TEMPLATES);
  const ok = await deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

module.exports = { CHECKLIST_TEMPLATE_HEADERS, actionListChecklistTemplates, actionSaveChecklistTemplate, actionDeleteChecklistTemplate };
