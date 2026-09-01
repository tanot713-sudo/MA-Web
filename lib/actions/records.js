/* ================================================================
   RECORDS — ported from Code.gs
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, sheetToObjects, ensureHeaders, appendRow, deleteRowById } = require('../sheets');
const { getOrCreateDynamicFolder, saveImageToFolder } = require('../drive');
const { userCanAccessProject } = require('../common');
const { getPagePermissions } = require('./pagePerms');

const REC_HEADERS = [
  'id', 'project', 'system', 'typeLocation', 'location', 'sublocation', 'equipment',
  'serial', 'brand', 'model', 'asset', 'inspector', 'note',
  'imgMain', 'thumbMain', 'imgSticker', 'thumbSticker',
  'img3', 'thumb3', 'img4', 'thumb4',
  'createdBy', 'createdAt'
];

async function actionCreateRecord({ record, images, _user }) {
  const sh = await getSheet(CONFIG.SHEETS.RECORDS);
  await ensureHeaders(sh, REC_HEADERS);

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const equip = (record.equipment || 'img').replace(/[/\\:*?"<>|]/g, '_');
  const ser = (record.serial || '').replace(/[/\\:*?"<>|]/g, '_');
  const fname = suffix => `${equip}_${ser}_${ts}_${suffix}.jpg`;

  const equipFolder = await getOrCreateDynamicFolder('AMR Inspection Images', record.project, record.location, record.sublocation, record.equipment, 'Equipment Photos');
  const stickerFolder = await getOrCreateDynamicFolder('AMR Inspection Images', record.project, record.location, record.sublocation, record.equipment, 'Sticker Photos');
  const add1Folder = await getOrCreateDynamicFolder('AMR Inspection Images', record.project, record.location, record.sublocation, record.equipment, 'Additional image 1');
  const add2Folder = await getOrCreateDynamicFolder('AMR Inspection Images', record.project, record.location, record.sublocation, record.equipment, 'Additional image 2');

  let imgMain = '', thumbMain = '', imgSticker = '', thumbSticker = '', img3 = '', thumb3 = '', img4 = '', thumb4 = '';

  if (images && images.main) {
    imgMain = await saveImageToFolder(images.main, fname('main'), equipFolder);
    thumbMain = imgMain;
  }
  if (images && images.sticker) {
    imgSticker = await saveImageToFolder(images.sticker, fname('sticker'), stickerFolder);
    thumbSticker = imgSticker;
  }
  if (images && images.img3) {
    img3 = await saveImageToFolder(images.img3, fname('img3'), add1Folder);
    thumb3 = img3;
  }
  if (images && images.img4) {
    img4 = await saveImageToFolder(images.img4, fname('img4'), add2Folder);
    thumb4 = img4;
  }

  await appendRow(sh, REC_HEADERS, {
    ...record,
    imgMain, thumbMain,
    imgSticker, thumbSticker,
    img3, thumb3,
    img4, thumb4,
    createdBy: _user.username
  });

  return { ok: true, serverId: record.id };
}

async function actionListRecords({ _user }) {
  const sh = await getSheet(CONFIG.SHEETS.RECORDS);
  await ensureHeaders(sh, REC_HEADERS);
  let rows = await sheetToObjects(sh);

  const role = _user.role;
  if (role === 'leader' || role === 'inspector') {
    rows = rows.filter(r => userCanAccessProject(_user, r.project));
  }

  return {
    ok: true,
    records: rows.map(r => ({
      id: r.id, project: r.project, system: r.system, typeLocation: r.typeLocation,
      location: r.location, sublocation: r.sublocation,
      equipment: r.equipment, serial: r.serial,
      brand: r.brand, model: r.model, asset: r.asset,
      inspector: r.inspector, note: r.note,
      imgMain: r.imgMain, thumbMain: r.thumbMain,
      imgSticker: r.imgSticker, thumbSticker: r.thumbSticker,
      img3: r.img3, thumb3: r.thumb3,
      img4: r.img4, thumb4: r.thumb4,
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now()
    }))
  };
}

async function actionDeleteRecord({ id, _user }) {
  if (_user.role !== 'admin' && !(await getPagePermissions(_user.role)).includes('delete'))
    return { ok: false, message: 'ไม่มีสิทธิ์ลบ' };
  const sh = await getSheet(CONFIG.SHEETS.RECORDS);
  if (_user.role !== 'admin' && _user.role !== 'manager') {
    const rows = await sheetToObjects(sh);
    const rec = rows.find(r => r.id === id);
    if (rec && !userCanAccessProject(_user, rec.project)) {
      return { ok: false, message: 'ไม่มีสิทธิ์ลบรายการของโครงการนี้' };
    }
  }
  const ok = await deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

module.exports = { REC_HEADERS, actionCreateRecord, actionListRecords, actionDeleteRecord };
