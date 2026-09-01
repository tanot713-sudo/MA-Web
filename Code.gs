/* ================================================================
   AMR INSPECTION SYSTEM — Google Apps Script Backend
   ================================================================
   วิธีติดตั้ง:
   1. ไปที่ script.google.com → New Project
   2. วางโค้ดทั้งหมดนี้แทน Code.gs
   3. กำหนดค่าใน CONFIG ด้านล่าง
   4. Deploy → New Deployment → Web App
      - Execute as: Me
      - Who has access: Anyone
   5. เปิด URL ที่ได้จาก deployment ในเบราว์เซอร์ได้เลย
      (ไม่ต้องใส่ใน index.html แล้ว — HTML อยู่ใน GAS โดยตรง)
   ================================================================ */

/* ================================================================
   CONFIG — แก้ค่าเหล่านี้ก่อน Deploy
   ================================================================ */
const CONFIG = {
  SHEET_ID:     '1qnTe3simRhRTcaNdLcBIbslJkzA8yiQR75u7Sk8iuAg',
  DRIVE_ROOT_ID:'1ASSXHrqTR64fL1fqxN9CAuRGx_6tZ5CP',

  SHEETS: {
    USERS:   'Users',
    RECORDS: 'Records',
    MASTER:  'Master',
    SURVEY:  'Survey',
    ASSIGNMENTS: 'Assignments',
    SURVEY_ASSIGNMENTS: 'SurveyAssignments',
    PDPA:    'PDPA',
    TOKENS:  'Tokens',
    LOGS:    'Logs',
    PM_SCHEDULES:  'PmSchedules',
    PM_WORKORDERS: 'PmWorkOrders',
    CHECKLIST_TEMPLATES: 'ChecklistTemplates',
    EQUIPMENT_DOCS: 'EquipmentDocs',
    STORE_PARTS: 'StoreParts',
    STORE_TRANSACTIONS: 'StoreTransactions',
    CM_TICKETS: 'CmTickets'
  },

  FOLDERS: {
    AMR_IMAGES:       'AMR Inspection Images',
    AMR_IMG_EQUIP:    'Equipment Photos',
    AMR_IMG_STICKER:  'Sticker Photos',
    ONSITE_IMAGES:    'AMR Onsite Inspection Images',
    ONSITE_IMG_EQUIP: 'Equipment Photos',
    ONSITE_IMG_STICK: 'Sticker Photos',
    ONSITE_MASTER:    'Onsite master data',
    ONSITE_EXCEL:     'Excel',
    CUSTOMER_LOGOS:   'Customer Logos'
  },

  TOKEN_TTL:    8 * 60 * 60 * 1000,
  PDPA_VERSION: '1.0'
};

/* ================================================================
   ENTRY POINT
   ✅ FIX #1 — สลับ doGet/doPost ให้ถูกต้อง
      doGet  → เสิร์ฟ HTML
      doPost → รับ API call จาก frontend
   ================================================================ */

// doGet → แสดงหน้าเว็บ (HTML จากไฟล์ index.html ใน GAS)
function doGet(e) {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('AMR Inspection System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no') 
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// doPost → รับ API request จาก fetch() ใน frontend
function doPost(e) {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type':                 'application/json; charset=utf-8'
  };
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, token, ctx } = body;
    const payload = Object.assign({}, body);
    delete payload.action;
    delete payload.token;
    delete payload.ctx;

    const PUBLIC_ACTIONS = ['login'];
    if (!PUBLIC_ACTIONS.includes(action)) {
      const auth = verifyToken(token);
      if (!auth.ok) return output({ ok: false, error: 'UNAUTHORIZED', message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' }, headers);
      payload._user = auth.user;
    }

    if (ctx) writeLog(action, token ? getTokenUser(token) : 'guest', ctx);

    const result = route(action, payload);
    return output(result, headers);

  } catch (err) {
    console.error('doPost error:', err);
    return output({ ok: false, error: 'SERVER_ERROR', message: err.message }, headers);
  }
}

function output(data, headers) {
  const res = ContentService.createTextOutput(JSON.stringify(data));
  res.setMimeType(ContentService.MimeType.JSON);
  return res;
}

/* ================================================================
   ROUTER
   ✅ FIX #2 — เพิ่ม setUserActive ที่หายไป
   ================================================================ */
function route(action, payload) {
  switch (action) {
    // Auth
    case 'login':             return actionLogin(payload);
    case 'verifyToken':       return actionVerifyToken(payload);
    // PDPA
    case 'getPdpaStatus':     return actionGetPdpaStatus(payload);
    case 'acceptPdpa':        return actionAcceptPdpa(payload);
    // Records
    case 'createRecord':      return actionCreateRecord(payload);
    case 'listRecords':       return actionListRecords(payload);
    case 'deleteRecord':      return actionDeleteRecord(payload);
    // Master Data
    case 'saveMaster':        return actionSaveMaster(payload);
    case 'listMaster':        return actionListMaster(payload);
    case 'getProgress':       return actionGetProgress(payload);
    // Assignments (รายการบันทึก)
    case 'saveAssignment':    return actionSaveAssignment(payload);
    case 'listAssignments':   return actionListAssignments(payload);
    case 'completeAssignment':return actionCompleteAssignment(payload);
    // Survey Assignments (สำรวจภาคสนาม)
    case 'saveSurveyAssignment':    return actionSaveSurveyAssignment(payload);
    case 'listSurveyAssignments':   return actionListSurveyAssignments(payload);
    case 'completeSurveyAssignment':return actionCompleteSurveyAssignment(payload);
    // Survey
    case 'createSurvey':      return actionCreateSurvey(payload);
    case 'listSurvey':        return actionListSurvey(payload);
    case 'updateSurvey':      return actionUpdateSurvey(payload);
    case 'deleteSurvey':      return actionDeleteSurvey(payload);
    // Users
    case 'createUser':        return actionCreateUser(payload);
    case 'bulkCreateUsers':    return actionBulkCreateUsers(payload);
    case 'updateUser':        return actionUpdateUser(payload);
    case 'deleteUser':        return actionDeleteUser(payload);
    case 'setUserActive':     return actionSetUserActive(payload);
    case 'listUsers':         return actionListUsers(payload);
    // Page Permissions
    case 'getPagePerms':      return actionGetPagePerms(payload);
    case 'setPagePerms':      return actionSetPagePerms(payload);
    // Report Templates (เลือก Word/PDF template จากเว็บ)
    case 'listReportTemplates': return actionListReportTemplates(payload);
    case 'saveReportTemplate':  return actionSaveReportTemplate(payload);
    case 'deleteReportTemplate':return actionDeleteReportTemplate(payload);
    // Report Field Presets (autocomplete จากค่าที่เคยกรอก)
    case 'listReportPresets':   return actionListReportPresets(payload);
    case 'saveReportPreset':    return actionSaveReportPreset(payload);
    // Report Info (ข้อมูลสัญญาผูกกับโครงการ — upsert ทับของเดิม)
    case 'listReportInfo':      return actionListReportInfo(payload);
    case 'saveReportInfo':      return actionSaveReportInfo(payload);
    case 'bulkSaveReportInfo':  return actionBulkSaveReportInfo(payload);
    case 'getCustomerLogoFolderUrl': return actionGetCustomerLogoFolderUrl(payload);
     // Switch-case
    case 'saveTarget':      return actionSaveTarget(payload);
    case 'listTargets':     return actionListTargets(payload);
    case 'getAssignStats':  return actionGetAssignStats(payload);
    // Preventive Maintenance (PM)
    case 'listPmSchedules':     return actionListPmSchedules(payload);
    case 'savePmSchedule':      return actionSavePmSchedule(payload);
    case 'deletePmSchedule':    return actionDeletePmSchedule(payload);
    case 'listPmWorkOrders':    return actionListPmWorkOrders(payload);
    case 'completePmWorkOrder': return actionCompletePmWorkOrder(payload);
    case 'bulkSavePmSchedules': return actionBulkSavePmSchedules(payload);
    case 'assignPmWorkOrder':   return actionAssignPmWorkOrder(payload);
    case 'acknowledgePmWorkOrder': return actionAcknowledgePmWorkOrder(payload);
    case 'listUserRoster':      return actionListUserRoster(payload);
    // Checklist / WI Template Library
    case 'listChecklistTemplates':   return actionListChecklistTemplates(payload);
    case 'saveChecklistTemplate':    return actionSaveChecklistTemplate(payload);
    case 'deleteChecklistTemplate':  return actionDeleteChecklistTemplate(payload);
    // Equipment Documents (เอกสารอุปกรณ์ — แนบได้เฉพาะ admin)
    case 'listEquipmentDocs':   return actionListEquipmentDocs(payload);
    case 'saveEquipmentDoc':    return actionSaveEquipmentDoc(payload);
    case 'deleteEquipmentDoc':  return actionDeleteEquipmentDoc(payload);
    // Store Control (คลังอะไหล่)
    case 'listStoreParts':        return actionListStoreParts(payload);
    case 'saveStorePart':         return actionSaveStorePart(payload);
    case 'deleteStorePart':       return actionDeleteStorePart(payload);
    case 'listStoreTransactions': return actionListStoreTransactions(payload);
    case 'requestStoreWithdraw':  return actionRequestStoreWithdraw(payload);
    case 'requestStoreReturn':    return actionRequestStoreReturn(payload);
    case 'approveStoreTx':        return actionApproveStoreTx(payload);
    case 'rejectStoreTx':         return actionRejectStoreTx(payload);
    case 'adjustStoreStock':      return actionAdjustStoreStock(payload);
    // Corrective Maintenance (CM)
    case 'listCmTickets':    return actionListCmTickets(payload);
    case 'reportCmTicket':   return actionReportCmTicket(payload);
    case 'assignCmTicket':   return actionAssignCmTicket(payload);
    case 'acknowledgeCmTicket': return actionAcknowledgeCmTicket(payload);
    case 'completeCmTicket': return actionCompleteCmTicket(payload);
    // PDF Report
    case 'generateReport':    return actionGenerateReport(payload, payload._user);
    // Image proxy (สำหรับ Word export — แก้ปัญหา CORS)
    case 'fetchImageAsBase64':      return actionFetchImageAsBase64(payload);
    case 'fetchImagesAsBase64Batch':return actionFetchImagesAsBase64Batch(payload);
    default:
      return { ok: false, error: 'UNKNOWN_ACTION', message: `ไม่รู้จัก action: ${action}` };
  }
}


/* ================================================================
   PDF / GOOGLE DOC REPORT GENERATION
   ================================================================ */

var REPORT_TEMPLATE_ID = '1EZyibVq33y3Xzt82bXtD5DUKp_zIciDf';

function actionGenerateReport(payload, _user) {
  try {
  if (!_user || (_user.role !== 'admin' && _user.role !== 'manager')) {
    return { ok: false, message: 'เฉพาะ Admin/Manager เท่านั้น' };
  }

  var reportTitle  = payload.reportTitle  || 'รายงานผลการติดฉลากระบุรายละเอียดอุปกรณ์';
  var contractName = payload.contractName || '';
  var contractNo   = payload.contractNo   || '-';
  var contractDate = payload.contractDate || '';
  var clause       = payload.clause       || '';
  var submittedTo  = payload.submittedTo  || '';
  var logoCustomer = payload.logoCustomer || '';
  var projFilter   = payload.projectFilter|| '';
  var templateId   = payload.templateId   || REPORT_TEMPLATE_ID;

  /* ── 1. Get filtered entries ── */
  var sh = getSheet(CONFIG.SHEETS.RECORDS);
  var rows = sheetToObjects(sh);
  var entries = rows;
  if (projFilter && projFilter !== '__all') {
    entries = entries.filter(function(e){ return e.project === projFilter; });
  }
  if (!entries.length) return { ok: false, message: 'ไม่มีข้อมูลสำหรับโครงการที่เลือก' };

  /* ── 2. Copy template ── */
  var today    = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  var docName  = (projFilter && projFilter !== '__all' ? projFilter : 'ทุกโครงการ') + '_' + today;
  var copyFile = DriveApp.getFileById(templateId).makeCopy(docName);
  var docId    = copyFile.getId();
  var doc      = DocumentApp.openById(docId);
  var body     = doc.getBody();

  /* ── 3. Replace cover placeholders ── */
  function safe(s){ return String(s||'').replace(/\$/g,''); }
  body.replaceText('\{\{reportTitle\}\}',  safe(reportTitle));
  body.replaceText('\{\{logocustomer\}\}', safe(logoCustomer));
  body.replaceText('\{\{contractName\}\}', safe(contractName));
  body.replaceText('\{\{contractNo\}\}',   safe(contractNo));
  body.replaceText('\{\{contractDate\}\}', safe(contractDate));
  body.replaceText('\{\{clause\}\}',       safe(clause));
  body.replaceText('\{\{submittedTo\}\}',  safe(submittedTo));

  /* ── 4. Find {{CONTENT_START}} position ── */
  var NORMAL = DocumentApp.ParagraphHeading.NORMAL;
  var H2     = DocumentApp.ParagraphHeading.HEADING2;
  var H3     = DocumentApp.ParagraphHeading.HEADING3;
  var CENTER = DocumentApp.HorizontalAlignment.CENTER;
  var LEFT   = DocumentApp.HorizontalAlignment.LEFT;

  var insertIdx = body.getNumChildren();
  for (var ci = 0; ci < body.getNumChildren(); ci++) {
    var el = body.getChild(ci);
    if (el.getType() === DocumentApp.ElementType.PARAGRAPH &&
        el.getText().indexOf('{{CONTENT_START}}') >= 0) {
      el.asText().setText('');
      insertIdx = ci + 1;
      break;
    }
  }

  /* ── 5. Group entries by location ── */
  var locMap = {};
  entries.forEach(function(e){
    var loc = e.locName || e.location || '(ไม่ระบุสถานที่)';
    if (!locMap[loc]) locMap[loc] = [];
    locMap[loc].push(e);
  });

  /* helper: style paragraph */
  function para(text, heading, align) {
    var p = body.insertParagraph(insertIdx++, text||'');
    p.setHeading(heading || NORMAL);
    p.setAlignment(align || LEFT);
    return p;
  }

  /* helper: try fetch image blob */
  function fetchBlob(url) {
    if (!url) return null;
    try {
      var resp = UrlFetchApp.fetch(url, {muteHttpExceptions:true});
      if (resp.getResponseCode() !== 200) return null;
      var blob = resp.getBlob();
      if (blob.getBytes().length < 500) return null;
      return blob;
    } catch(e){ return null; }
  }

  /* ── Section heading ── */
  var secPara = para('สำนักเขต', H2, LEFT);

  /* ── Loop locations ── */
  var locKeys = Object.keys(locMap).sort();
  var equipCounter = 0;

  locKeys.forEach(function(loc, li){
    /* Location heading */
    var lp = para((li+1)+'. '+loc, H2, CENTER);
    lp.editAsText().setUnderline(true);
    para('', NORMAL); // spacer

    var items = locMap[loc];
    items.forEach(function(e, ei){
      equipCounter++;

      /* Equipment name */
      var eqPara = para(equipCounter+'. '+(e.equipment||'(ไม่ระบุ)'), H3, LEFT);

      /* Brand / model */
      if (e.brand || e.model) {
        para('    ยี่ห้อ '+(e.brand||'')+' รุ่น '+(e.model||''), NORMAL);
      }

      /* Serial / asset */
      var metaParts = [];
      if (e.serial) metaParts.push('Serial: '+e.serial);
      if (e.asset)  metaParts.push('รหัส: '+e.asset);
      if (metaParts.length) para('    '+metaParts.join('   '), NORMAL);

      /* Sublocation */
      if (e.subName) para(e.subName, NORMAL);

      /* ── Photo table (2 cols per row) ── */
      var imgList = [
        { url: e.thumbMain||e.imgMain||'',       cap: 'รูปรวมอุปกรณ์' },
        { url: e.thumbSticker||e.imgSticker||'', cap: 'รูปสติกเกอร์' },
        { url: e.thumb3||e.img3||'',             cap: 'รูปเพิ่มเติมที่ 1' },
        { url: e.thumb4||e.img4||'',             cap: 'รูปเพิ่มเติมที่ 2' }
      ].filter(function(im){ return im.url; });

      if (imgList.length) {
        for (var ri = 0; ri < imgList.length; ri += 2) {
          var tbl = body.insertTable(insertIdx++);
          tbl.setBorderWidth(0);
          var row = tbl.appendTableRow();

          var pair = [imgList[ri], imgList[ri+1]||null];
          pair.forEach(function(im){
            var cell = row.appendTableCell();
            if (!im) { cell.appendParagraph(''); return; }
            var blob = fetchBlob(im.url);
            if (blob) {
              try {
                var img = cell.insertImage(0, blob);
                var ow = img.getWidth(), oh = img.getHeight();
                var scale = Math.min(220/ow, 165/oh, 1);
                img.setWidth(Math.round(ow*scale));
                img.setHeight(Math.round(oh*scale));
              } catch(err){}
            }
            var capPara = cell.appendParagraph(im.cap);
            capPara.setAlignment(CENTER);
            capPara.editAsText().setFontSize(9).setForegroundColor('#555555');
          });
        }
      }

      para('', NORMAL); // spacer between equipment
    });
  });

  /* ── 6. Save and export PDF ── */
  doc.saveAndClose();
  Utilities.sleep(3000);

  var pdfBlob  = DriveApp.getFileById(docId).getAs(MimeType.PDF);
  var pdfB64   = Utilities.base64Encode(pdfBlob.getBytes());

  /* Move doc to AMR_PDF_Reports folder */
  try {
    var folder = getOrCreateFolder(getRootFolder(), 'AMR_PDF_Reports');
    copyFile.moveTo(folder);
  } catch(e){}

  /* บันทึกค่าฟิลด์ไว้ autocomplete ครั้งหน้า — ไม่ให้ error ตรงนี้ทำให้ทั้ง report เสีย */
  try {
    actionSaveReportPreset({
      fields: { reportTitle: reportTitle, contractName: contractName, contractNo: contractNo,
                 clause: clause, submittedTo: submittedTo, logoCustomer: logoCustomer },
      _user: _user
    });
  } catch (e) {}

  return {
    ok: true,
    pdfBase64:   pdfB64,
    docId:       docId,
    docUrl:      copyFile.getUrl(),
    docName:     docName,
    totalEquip:  equipCounter
  };
  } catch(err) {
    return { ok: false, message: 'เกิดข้อผิดพลาด: ' + (err.message || String(err)) };
  }
}

/* ================================================================
   PROJECT SCOPING — leader/inspector ดูได้แค่โครงการที่ตัวเองถูกผูกไว้
   (admin กำหนดได้หลายโครงการต่อคน คั่นด้วย comma ในช่อง "โครงการ")
   ================================================================ */
function userProjectList(_user) {
  return (_user.project || '').split(',').map(p => p.trim()).filter(Boolean);
}
// true ถ้า _user เข้าถึงโครงการนี้ได้ — admin/manager เห็นทุกโครงการเสมอ
// ถ้า leader/inspector ไม่ได้ผูกโครงการไว้เลย (รายการว่าง) ถือว่ายังไม่จำกัด (เห็นทุกโครงการ)
function userCanAccessProject(_user, project) {
  if (['admin', 'manager'].includes(_user.role)) return true;
  const list = userProjectList(_user);
  return list.length === 0 || list.includes(project);
}

/* ================================================================
   SHEET HELPERS
   ================================================================ */
function getSheet(name) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function sheetToObjects(sh) {
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(h => String(h).trim());
  return data.slice(1).filter(r => r.some(v => v !== '')).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
    return obj;
  });
}

// เพิ่ม header ที่ขาดไปต่อท้ายคอลัมน์ที่มีอยู่แล้วเสมอ (ไม่เขียนทับ/สลับตำแหน่งคอลัมน์เดิม)
// กันข้อมูลเพี้ยนเวลาเพิ่มฟิลด์ใหม่ใน sheet ที่มีข้อมูลอยู่แล้ว (เช่น Records)
function ensureHeaders(sh, headers) {
  const lastCol = sh.getLastColumn();
  if (lastCol === 0) { sh.getRange(1, 1, 1, headers.length).setValues([headers]); return; }
  const existing = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  if (!existing[0]) { sh.getRange(1, 1, 1, headers.length).setValues([headers]); return; }
  const missing = headers.filter(h => existing.indexOf(h) === -1);
  if (missing.length) sh.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
}

// เขียนค่าตามตำแหน่งคอลัมน์จริงของ sheet (อ่านชื่อ header แถวแรกจริง) ไม่ใช่ตามลำดับใน array headers
// เพื่อไม่ให้ข้อมูลเลื่อนคอลัมน์ผิดถ้ามีการเพิ่ม/เรียง headers array ใหม่ในอนาคต
function appendRow(sh, headers, obj) {
  ensureHeaders(sh, headers);
  const physicalHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const row = physicalHeaders.map(h => obj[h] !== undefined ? obj[h] : '');
  sh.appendRow(row);
}

function findRowById(sh, id) {
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return -1;
  const idCol = data[0].indexOf('id');
  if (idCol < 0) return -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) return i + 1;
  }
  return -1;
}

function updateRowById(sh, headers, id, obj) {
  const row = findRowById(sh, id);
  if (row < 0) return false;
  ensureHeaders(sh, headers);
  const physicalHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const vals = physicalHeaders.map(h => obj[h] !== undefined ? obj[h] : '');
  sh.getRange(row, 1, 1, vals.length).setValues([vals]);
  return true;
}

function deleteRowById(sh, id) {
  const row = findRowById(sh, id);
  if (row < 0) return false;
  sh.deleteRow(row);
  return true;
}

/* ================================================================
   DRIVE HELPERS
   ================================================================ */
function getRootFolder() {
  return DriveApp.getFolderById(CONFIG.DRIVE_ROOT_ID);
}

function getOrCreateFolder(parent, name) {
  const iter = parent.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return parent.createFolder(name);
}

function getFolder(pathParts) {
  let folder = getRootFolder();
  for (const part of pathParts) folder = getOrCreateFolder(folder, part);
  return folder;
}

function getNestedFolder(rootFolderName, record, subfolder) {
  const safe = s => String(s || 'Unknown').replace(/[\/\\:*?"<>|]/g, '_').trim() || 'Unknown';
  let f = getOrCreateFolder(getRootFolder(), rootFolderName);
  f = getOrCreateFolder(f, safe(record.project));
  f = getOrCreateFolder(f, safe(record.location || record.locName || 'Unknown'));
  f = getOrCreateFolder(f, safe(record.sublocation || record.subName || 'Unknown'));
  if (subfolder) f = getOrCreateFolder(f, subfolder);
  return f;
}

function saveImageToFolder(base64Data, filename, folder) {
  if (!base64Data || !base64Data.startsWith('data:')) return '';
  try {
    const [meta, b64] = base64Data.split(',');
    const mimeMatch = meta.match(/:(.*?);/);
    const mimeType  = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const decoded   = Utilities.base64Decode(b64);
    const blob      = Utilities.newBlob(decoded, mimeType, filename);
    const file      = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getDownloadUrl().replace('&export=download', '');
  } catch (err) {
    console.error('saveImageToFolder error:', err);
    return '';
  }
}

function getThumbnailUrl(driveUrl) {
  if (!driveUrl) return '';
  const m = driveUrl.match(/[-\w]{25,}/);
  if (!m) return '';
  return `https://drive.google.com/thumbnail?id=${m[0]}&sz=w400`;
}

// Proxy สำหรับดึงรูปจาก Drive มาเป็น base64 ฝั่ง backend — เพราะ fetch() ฝั่ง browser
// ถูก CORS บล็อกกับ drive.google.com ทำให้ Word export (docx library) ฝัง้รูปไม่ได้
// UrlFetchApp ฝั่ง Apps Script ไม่ติด CORS เพราะเป็น server-to-server request
function actionFetchImageAsBase64({ url, _user }) {
  if (!url || !/^https:\/\/drive\.google\.com\//.test(url)) return { ok: false };
  try {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return { ok: false };
    const blob = resp.getBlob();
    return { ok: true, base64: Utilities.base64Encode(blob.getBytes()), mimeType: blob.getContentType() || 'image/jpeg' };
  } catch (e) {
    return { ok: false };
  }
}

// ดึงรูปหลายรูปพร้อมกันใน 1 call — ใช้ UrlFetchApp.fetchAll() ซึ่ง GAS รันแบบ parallel
// ลดจาก N round-trip เหลือ ceil(N/CHUNK) round-trip และแต่ละ batch ดึงพร้อมกันหมด
function actionFetchImagesAsBase64Batch({ urls, _user }) {
  if (!Array.isArray(urls) || !urls.length) return { ok: false, results: [] };
  const requests = urls.map(url => ({
    url: url,
    muteHttpExceptions: true
  }));
  try {
    const responses = UrlFetchApp.fetchAll(requests);
    const results = responses.map((resp, i) => {
      if (resp.getResponseCode() !== 200) return { ok: false, url: urls[i] };
      const blob = resp.getBlob();
      return {
        ok: true,
        url: urls[i],
        base64: Utilities.base64Encode(blob.getBytes()),
        mimeType: blob.getContentType() || 'image/jpeg'
      };
    });
    return { ok: true, results };
  } catch (e) {
    return { ok: false, results: [], message: e.message };
  }
}

/* ================================================================
   AUTH — LOGIN / TOKEN
   ✅ FIX #3 — ส่ง error/code field ชื่อเดียวกัน (ใช้ 'code') ให้ frontend อ่านได้
   ================================================================ */
const USER_HEADERS = ['id','username','password','plainPwd','name','role','project','email','active','createdAt'];

function actionLogin({ username, password }) {
  if (!username || !password) return { ok: false, message: 'กรุณากรอก username และ password' };
  const sh = getSheet(CONFIG.SHEETS.USERS);
  ensureHeaders(sh, USER_HEADERS);

  const all = sheetToObjects(sh);
  if (all.length === 0) {
    appendRow(sh, USER_HEADERS, {
      id: genId(), username: 'admin', password: hashPw('admin1234'),
      name: 'Administrator', role: 'admin', project: '', active: 'true',
      createdAt: new Date().toISOString()
    });
  }

  const users      = sheetToObjects(sh);
  const byUsername = users.find(u => u.username === username);
  const byBoth     = users.find(u =>
    u.username === username &&
    (u.password === hashPw(password) || u.password === password)
  );

  if (!byUsername) {
    // ✅ ใช้ field 'code' ให้ตรงกับ frontend emap
    return { ok: false, code: 'USER_NOT_FOUND', message: 'ไม่พบชื่อผู้ใช้นี้ในระบบ' };
  }
  if (!byBoth) {
    return { ok: false, code: 'WRONG_PASSWORD', message: 'รหัสผ่านไม่ถูกต้อง' };
  }

  const user = byBoth;
  if (String(user.active).toLowerCase() === 'false') {
    return { ok: false, code: 'USER_INACTIVE', message: 'บัญชีนี้ถูกปิดการใช้งาน · ติดต่อผู้ดูแลระบบ' };
  }

  const token = genToken();
  const exp   = new Date(Date.now() + CONFIG.TOKEN_TTL).toISOString();
  const tsh   = getSheet(CONFIG.SHEETS.TOKENS);
  ensureHeaders(tsh, ['token','username','role','project','exp']);
  tsh.appendRow([token, user.username, user.role, user.project || '', exp]);

  const perms = getPagePermissions(user.role);

  return {
    ok: true, token,
    user: {
      username:  user.username,
      name:      user.name,
      role:      user.role,
      project:   user.project || '',
      pagePerms: perms
    }
  };
}

function verifyToken(token) {
  if (!token) return { ok: false };
  const tsh  = getSheet(CONFIG.SHEETS.TOKENS);
  const rows = sheetToObjects(tsh);
  const t    = rows.find(r => r.token === token);
  if (!t) return { ok: false };
  if (new Date(t.exp) < new Date()) return { ok: false };
  return { ok: true, user: { username: t.username, role: t.role, project: t.project } };
}

function actionVerifyToken({ _user }) {
  return { ok: true, user: _user };
}

function getTokenUser(token) {
  const tsh  = getSheet(CONFIG.SHEETS.TOKENS);
  const rows = sheetToObjects(tsh);
  const t    = rows.find(r => r.token === token);
  return t ? t.username : 'unknown';
}

function hashPw(pw) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw + 'AMR_SALT_2024')
  );
}
function genToken() { return Utilities.getUuid(); }
function genId()    { return Utilities.getUuid().replace(/-/g,'').slice(0,12); }

/* ================================================================
   PDPA
   ================================================================ */
const PDPA_HEADERS = ['username','version','acceptedAt','ip'];

function actionGetPdpaStatus({ version, _user }) {
  const sh   = getSheet(CONFIG.SHEETS.PDPA);
  ensureHeaders(sh, PDPA_HEADERS);
  const rows = sheetToObjects(sh);
  const rec  = rows.find(r =>
    r.username === _user.username &&
    r.version  === (version || CONFIG.PDPA_VERSION)
  );
  return { ok: true, accepted: !!rec };
}

function actionAcceptPdpa({ version, ctx, _user }) {
  const sh = getSheet(CONFIG.SHEETS.PDPA);
  ensureHeaders(sh, PDPA_HEADERS);
  appendRow(sh, PDPA_HEADERS, {
    username:   _user.username,
    version:    version || CONFIG.PDPA_VERSION,
    acceptedAt: new Date().toISOString(),
    ip:         ctx ? ctx.ip : ''
  });
  return { ok: true };
}

/* ================================================================
   RECORDS
   ================================================================ */
const REC_HEADERS = [
  'id','project','system','typeLocation','location','sublocation','equipment',
  'serial','brand','model','asset','inspector','note',
  'imgMain','thumbMain','imgSticker','thumbSticker',
  'img3','thumb3','img4','thumb4',
  'createdBy','createdAt'
];
function actionCreateRecord({ record, images, _user }) {
  const sh = getSheet(CONFIG.SHEETS.RECORDS);
  ensureHeaders(sh, REC_HEADERS);

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const equip = (record.equipment || 'img').replace(/[/\\:*?"<>|]/g, '_');
  const ser = (record.serial || '').replace(/[/\\:*?"<>|]/g, '_');
  const fname = (suffix) => `${equip}_${ser}_${ts}_${suffix}.jpg`;

  // สร้างโฟลเดอร์สำหรับรูปภาพ
  const equipFolder = getOrCreateDynamicFolder('AMR Inspection Images', record.project, record.location, record.sublocation, record.equipment, 'Equipment Photos');
  const stickerFolder = getOrCreateDynamicFolder('AMR Inspection Images', record.project, record.location, record.sublocation, record.equipment, 'Sticker Photos');
  const add1Folder = getOrCreateDynamicFolder('AMR Inspection Images', record.project, record.location, record.sublocation, record.equipment, 'Additional image 1');
  const add2Folder = getOrCreateDynamicFolder('AMR Inspection Images', record.project, record.location, record.sublocation, record.equipment, 'Additional image 2');

  let imgMain = '', thumbMain = '', imgSticker = '', thumbSticker = '', img3 = '', thumb3 = '', img4 = '', thumb4 = '';

  // บันทึกรูปและกำหนดค่า thumb (หากมีระบบย่อรูปใน saveImageToFolder หรือต้องการเก็บค่าเดียวกันไปก่อน)
  if (images && images.main) {
    imgMain = saveImageToFolder(images.main, fname('main'), equipFolder);
    thumbMain = imgMain; // หากยังไม่มีระบบย่อรูป ให้ใช้ URL รูปหลักไปก่อน
  }
  if (images && images.sticker) {
    imgSticker = saveImageToFolder(images.sticker, fname('sticker'), stickerFolder);
    thumbSticker = imgSticker;
  }
  if (images && images.img3) {
    img3 = saveImageToFolder(images.img3, fname('img3'), add1Folder);
    thumb3 = img3;
  }
  if (images && images.img4) {
    img4 = saveImageToFolder(images.img4, fname('img4'), add2Folder);
    thumb4 = img4;
  }

  // รวมข้อมูลและบันทึกลง Sheet (ใส่ค่า thumb ครบทุกตัว)
  appendRow(sh, REC_HEADERS, { 
    ...record, 
    imgMain, thumbMain, 
    imgSticker, thumbSticker, 
    img3, thumb3, 
    img4, thumb4, 
    createdBy: _user.username 
  });
  
  return { ok: true, serverId: record.id };
}

function actionListRecords({ _user }) {
  const sh   = getSheet(CONFIG.SHEETS.RECORDS);
  ensureHeaders(sh, REC_HEADERS);
  let rows = sheetToObjects(sh);

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

function actionDeleteRecord({ id, _user }) {
  if (_user.role !== 'admin' && !getPagePermissions(_user.role).includes('delete'))
    return { ok: false, message: 'ไม่มีสิทธิ์ลบ' };
  const sh = getSheet(CONFIG.SHEETS.RECORDS);
  if (_user.role !== 'admin' && _user.role !== 'manager') {
    const rows = sheetToObjects(sh);
    const rec = rows.find(r => r.id === id);
    if (rec && !userCanAccessProject(_user, rec.project)) {
      return { ok: false, message: 'ไม่มีสิทธิ์ลบรายการของโครงการนี้' };
    }
  }
  const ok = deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

/* ================================================================
   MASTER DATA
   ================================================================ */
const MASTER_HEADERS = [
  'id','project','system','typeLocation','location','sublocation',
  'equipment','brand','model','asset','serial','order'
];

function actionSaveMaster({ master, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  const sh = getSheet(CONFIG.SHEETS.MASTER);
  sh.clearContents();
  if (!master || !master.length) return { ok: true, count: 0 };
  // batch write — 1 API call instead of N appendRow calls (prevents 6-min timeout on large datasets)
  const rows = [MASTER_HEADERS, ...master.map(m => MASTER_HEADERS.map(h => m[h] != null ? m[h] : ''))];
  sh.getRange(1, 1, rows.length, MASTER_HEADERS.length).setValues(rows);
  return { ok: true, count: master.length };
}

function actionListMaster({ _user }) {
  const sh   = getSheet(CONFIG.SHEETS.MASTER);
  ensureHeaders(sh, MASTER_HEADERS);
  let rows = sheetToObjects(sh);
  if (_user.role === 'leader' || _user.role === 'inspector') {
    rows = rows.filter(m => userCanAccessProject(_user, m.project));
  }
  return { ok: true, master: rows };
}

function actionGetProgress({ _user }) {
  const master  = sheetToObjects(getSheet(CONFIG.SHEETS.MASTER));
  const records = sheetToObjects(getSheet(CONFIG.SHEETS.RECORDS));
  const role    = _user.role;

  const projectMap = {};
  master.forEach(m => {
    if ((role === 'leader' || role === 'inspector') && !userCanAccessProject(_user, m.project)) return;
    if(!projectMap[m.project]) projectMap[m.project]={total:0,serials:new Set()};
    projectMap[m.project].total++;
    if(m.serial) projectMap[m.project].serials.add(m.serial);
  });

  let filteredRecords = records;
  if (role === 'leader' || role === 'inspector') {
    filteredRecords = records.filter(r => userCanAccessProject(_user, r.project));
  }

  const doneSerials = new Set(filteredRecords.map(r=>r.serial).filter(Boolean));

  const progress = Object.entries(projectMap).map(([project,info])=>({
    project,
    total: info.total,
    done:  [...info.serials].filter(s=>doneSerials.has(s)).length
  })).sort((a,b)=>a.project.localeCompare(b.project,'th'));

  return { ok:true, progress };
}

/* ================================================================
   SURVEY
   ================================================================ */
const SURVEY_HEADERS = [
  'id','project','system','location','sublocation','equipment',
  'brand','model','serial','inspector','surveyDate','note',
  'imgMain','thumbMain','imgSticker','thumbSticker',
  'createdBy','createdAt'
];

/* ================================================================
   TARGETS — เป้าหมายวันเสร็จต่อโครงการ (Leader/Admin/Manager)
   ✅ FIX — ย้ายออกมาเป็น top-level function (เดิมซ้อนอยู่ใน actionCreateSurvey
      โดยไม่ได้ตั้งใจ ทำให้ route() เรียก actionSaveTarget/actionListTargets
      ไม่ได้เลย เพราะเป็น local function ของ actionCreateSurvey)
   ================================================================ */
const TARGET_HEADERS = ['project','username','deadline','note','updatedAt'];

function actionSaveTarget({ project, username, deadline, note, _user }) {
  if (!['admin','manager','leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์' };
  if (!project || !deadline)
    return { ok: false, message: 'ต้องมีโครงการและวันเสร็จ' };

  // ถ้าไม่ได้ระบุ username ให้ใช้ username ของผู้เรียก
  const targetUser = username || _user.username;

  const sh   = getSheet('Targets');
  ensureHeaders(sh, TARGET_HEADERS);
  const data = sh.getDataRange().getValues();
  const pCol = data[0].indexOf('project');
  const uCol = data[0].indexOf('username');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][pCol]) === project && String(data[i][uCol]) === targetUser) {
      // project-level target (__project__) — เฉพาะ admin/manager เปลี่ยนได้หลังตั้งแล้ว
      if (targetUser === '__project__' && !['admin','manager'].includes(_user.role))
        return { ok: false, message: 'เฉพาะ admin/manager เท่านั้นเปลี่ยน project target ได้' };
      sh.getRange(i+1, 1, 1, TARGET_HEADERS.length).setValues([[
        project, targetUser, deadline, note||'', new Date().toISOString()
      ]]);
      return { ok: true, action: 'updated' };
    }
  }
  appendRow(sh, TARGET_HEADERS, {
    project, username: targetUser,
    deadline, note: note||'',
    updatedAt: new Date().toISOString()
  });
  return { ok: true, action: 'created' };
}

function actionListTargets({ _user }) {
  if (!['admin','manager','leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์' };

  const sh   = getSheet('Targets');
  ensureHeaders(sh, TARGET_HEADERS);
  let rows = sheetToObjects(sh);

  if (_user.role === 'leader') {
    const userProjs = (_user.project||'').split(',').map(p=>p.trim()).filter(Boolean);
    // leader เห็น: target ของตัวเอง + project-level targets ของโครงการตัวเอง
    rows = rows.filter(r => r.username === _user.username ||
      (r.username === '__project__' && userProjs.includes(r.project)));
  }
  return { ok: true, targets: rows };
}

function actionGetAssignStats({ _user }) {
  const role = _user.role, uname = _user.username;
  const userProjs = (_user.project||'').split(',').map(p=>p.trim()).filter(Boolean);

  // Load assignments filtered by role
  const assignSh = getSheet(CONFIG.SHEETS.ASSIGNMENTS);
  ensureHeaders(assignSh, ASSIGN_HEADERS);
  let assigns = sheetToObjects(assignSh).filter(a => a.id);
  if (role === 'inspector') {
    assigns = assigns.filter(a => a.assignedTo === uname);
  } else if (role === 'leader') {
    assigns = assigns.filter(a => userProjs.includes(a.project) || a.assignedBy === uname || a.assignedTo === uname);
  }

  // Load project-level targets
  const tSh = getSheet('Targets');
  ensureHeaders(tSh, TARGET_HEADERS);
  const projTargets = sheetToObjects(tSh).filter(t => t.username === '__project__');

  // Load user display names
  const userSh = getSheet(CONFIG.SHEETS.USERS);
  const usersData = sheetToObjects(userSh);
  const nameMap = {};
  usersData.forEach(u => { nameMap[u.username] = u.name || u.username; });

  // Group by project → inspector
  const projMap = {};
  assigns.forEach(a => {
    if (!a.assignedTo || !a.project) return;
    if (!projMap[a.project]) projMap[a.project] = {};
    const ins = a.assignedTo;
    if (!projMap[a.project][ins]) projMap[a.project][ins] = { total:0, done:0, dates:[] };
    projMap[a.project][ins].total++;
    if (a.status === 'done') projMap[a.project][ins].done++;
    if (a.targetDate) projMap[a.project][ins].dates.push(String(a.targetDate));
  });

  const stats = Object.entries(projMap).map(([project, insMap]) => {
    const pt = projTargets.find(t => t.project === project);
    return {
      project,
      projectDeadline: pt ? String(pt.deadline) : '',
      inspectors: Object.entries(insMap).map(([u, d]) => ({
        username: u,
        name: nameMap[u] || u,
        total: d.total,
        done: d.done,
        remaining: d.total - d.done,
        earliestTargetDate: d.dates.length ? d.dates.sort()[0] : ''
      }))
    };
  });

  return { ok: true, stats };
}

/* ================================================================
   PREVENTIVE MAINTENANCE (PM)
   — PmSchedules: ตารางรอบบำรุงรักษาต่ออุปกรณ์ (admin/manager ตั้งเท่านั้น)
   — PmWorkOrders: ใบงานที่เกิดจากตารางเมื่อใกล้ครบกำหนด (สร้างอัตโนมัติตอน
     เปิดหน้า "ใบงานที่รอดำเนินการ" — ไม่ใช้ time-trigger เพื่อลดความซับซ้อน)
   ================================================================ */
const PM_SCHEDULE_HEADERS = ['id','project','system','locName','subName','equipment','serial','intervalDays','lastDoneAt','nextDueAt','checklist','templateId','active','createdBy','createdAt'];
const PM_WO_HEADERS = ['id','scheduleId','project','system','locName','subName','equipment','serial','dueDate','status','checklistResult','note','imgMain','completedBy','completedAt','createdAt','workerSignatureUrl','customerName','customerSignatureUrl','assignedTo','assignedBy','assignedAt','notifiedAt','acknowledgedAt'];
const PM_LEAD_DAYS = 14; // สร้างใบงานล่วงหน้าก่อนถึงกำหนดกี่วัน

function actionListPmSchedules({ _user }) {
  const sh = getSheet(CONFIG.SHEETS.PM_SCHEDULES);
  ensureHeaders(sh, PM_SCHEDULE_HEADERS);
  let rows = sheetToObjects(sh);
  if (_user.role === 'leader' || _user.role === 'inspector') {
    rows = rows.filter(r => userCanAccessProject(_user, r.project));
  }
  rows = rows.map(r => ({ ...r, checklist: safeParseJson(r.checklist, []) }));
  return { ok: true, schedules: rows };
}

function actionSavePmSchedule({ schedule, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้นที่ตั้งตารางบำรุงรักษาได้' };
  if (!schedule || !schedule.project || !schedule.equipment || !schedule.intervalDays)
    return { ok: false, message: 'ต้องมีโครงการ, อุปกรณ์ และรอบบำรุงรักษา' };

  const sh = getSheet(CONFIG.SHEETS.PM_SCHEDULES);
  ensureHeaders(sh, PM_SCHEDULE_HEADERS);
  const checklist = JSON.stringify(schedule.checklist || []);

  if (schedule.id) {
    const rows = sheetToObjects(sh);
    const existing = rows.find(s => s.id === schedule.id);
    if (existing) {
      updateRowById(sh, PM_SCHEDULE_HEADERS, schedule.id, {
        ...existing,
        project: schedule.project, system: schedule.system || '',
        locName: schedule.locName || '', subName: schedule.subName || '',
        equipment: schedule.equipment, serial: schedule.serial || '',
        intervalDays: schedule.intervalDays, checklist,
        templateId: schedule.templateId || '',
        active: schedule.active !== undefined ? String(schedule.active) : existing.active
      });
      return { ok: true, action: 'updated' };
    }
  }

  const id = genId();
  const nextDueAt = schedule.nextDueAt || new Date(Date.now() + Number(schedule.intervalDays) * 86400000).toISOString().slice(0, 10);
  appendRow(sh, PM_SCHEDULE_HEADERS, {
    id, project: schedule.project, system: schedule.system || '',
    locName: schedule.locName || '', subName: schedule.subName || '',
    equipment: schedule.equipment, serial: schedule.serial || '',
    intervalDays: schedule.intervalDays, lastDoneAt: '', nextDueAt,
    checklist, templateId: schedule.templateId || '', active: 'true',
    createdBy: _user.username, createdAt: new Date().toISOString()
  });
  return { ok: true, action: 'created', id };
}

function actionDeletePmSchedule({ id, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้น' };
  const sh = getSheet(CONFIG.SHEETS.PM_SCHEDULES);
  const ok = deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

// นำเข้าแผน PM หลายรายการพร้อมกัน (จากไฟล์ Excel ที่ frontend parse มาให้แล้วเป็น array of object)
// จับคู่ system/locName/subName/serial จาก Master Data อัตโนมัติด้วย project+equipment
// และจับคู่ templateName กับคลัง ChecklistTemplates ถ้าระบุมา
function actionBulkSavePmSchedules({ rows, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้นที่นำเข้าแผน PM ได้' };
  if (!Array.isArray(rows)) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };

  const sh = getSheet(CONFIG.SHEETS.PM_SCHEDULES);
  ensureHeaders(sh, PM_SCHEDULE_HEADERS);
  const masterRows = sheetToObjects(getSheet(CONFIG.SHEETS.MASTER));
  const tSh = getSheet(CONFIG.SHEETS.CHECKLIST_TEMPLATES);
  ensureHeaders(tSh, CHECKLIST_TEMPLATE_HEADERS);
  const templates = sheetToObjects(tSh);

  let created = 0, skipped = 0;
  rows.forEach(r => {
    const project = String(r.project || '').trim();
    const equipment = String(r.equipment || '').trim();
    const intervalDays = Number(r.intervalDays);
    if (!project || !equipment || !intervalDays) { skipped++; return; }

    const mrow = masterRows.find(m => m.project === project && m.equipment === equipment) || {};
    const tmplName = String(r.templateName || '').trim();
    const tmpl = tmplName ? templates.find(t => t.name === tmplName) : null;
    const nextDueAt = r.nextDueAt || new Date(Date.now() + intervalDays * 86400000).toISOString().slice(0, 10);

    appendRow(sh, PM_SCHEDULE_HEADERS, {
      id: genId(), project,
      system: mrow.system || '', locName: mrow.locName || '', subName: mrow.subName || '',
      equipment, serial: mrow.serial || '',
      intervalDays, lastDoneAt: '', nextDueAt,
      checklist: JSON.stringify([]), templateId: tmpl ? tmpl.id : '', active: 'true',
      createdBy: _user.username, createdAt: new Date().toISOString()
    });
    created++;
  });
  return { ok: true, created, skipped };
}

// คืนรายการใบงาน PM — สร้างใบงานใหม่อัตโนมัติให้ตารางที่ใกล้/ถึงกำหนดแล้วยังไม่มีใบงานค้างอยู่
function actionListPmWorkOrders({ _user }) {
  const shS = getSheet(CONFIG.SHEETS.PM_SCHEDULES);
  ensureHeaders(shS, PM_SCHEDULE_HEADERS);
  const schedules = sheetToObjects(shS).filter(s => String(s.active).toLowerCase() !== 'false');

  const shW = getSheet(CONFIG.SHEETS.PM_WORKORDERS);
  ensureHeaders(shW, PM_WO_HEADERS);
  let workOrders = sheetToObjects(shW);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const leadCutoff = new Date(today.getTime() + PM_LEAD_DAYS * 86400000);

  schedules.forEach(s => {
    if (!s.nextDueAt) return;
    const due = new Date(s.nextDueAt);
    if (isNaN(due) || due > leadCutoff) return;
    const hasOpen = workOrders.some(w => w.scheduleId === s.id && w.status === 'pending');
    if (hasOpen) return;
    const id = genId();
    appendRow(shW, PM_WO_HEADERS, {
      id, scheduleId: s.id, project: s.project, system: s.system || '',
      locName: s.locName || '', subName: s.subName || '',
      equipment: s.equipment, serial: s.serial || '',
      dueDate: s.nextDueAt, status: 'pending',
      checklistResult: '', note: '', imgMain: '',
      completedBy: '', completedAt: '', createdAt: new Date().toISOString()
    });
    workOrders.push({ id, scheduleId: s.id, project: s.project, dueDate: s.nextDueAt, status: 'pending' });
  });

  if (_user.role === 'leader' || _user.role === 'inspector') {
    workOrders = workOrders.filter(w => userCanAccessProject(_user, w.project));
  }
  workOrders = workOrders.map(w => ({ ...w, checklistResult: safeParseJson(w.checklistResult, []) }));
  return { ok: true, workOrders };
}

function actionCompletePmWorkOrder({ id, checklistResult, note, image, workerSignature, customerSignature, customerName, _user }) {
  if (_user.role === 'observer') return { ok: false, message: 'ไม่มีสิทธิ์บันทึกผล' };
  if (!id) return { ok: false, message: 'ไม่พบใบงาน' };

  const shW = getSheet(CONFIG.SHEETS.PM_WORKORDERS);
  ensureHeaders(shW, PM_WO_HEADERS);
  const rows = sheetToObjects(shW);
  const wo = rows.find(w => w.id === id);
  if (!wo) return { ok: false, message: 'ไม่พบใบงาน' };

  const safeEquip = String(wo.equipment || 'img').replace(/[/\\:*?"<>|]/g, '_');
  let imgUrl = '';
  if (image) {
    const folder = getOrCreateDynamicFolder('AMR Inspection Images', wo.project, wo.locName, wo.subName, wo.equipment, 'PM Photos');
    imgUrl = saveImageToFolder(image, `PM_${safeEquip}_${Date.now()}.jpg`, folder);
  }
  let workerSigUrl = wo.workerSignatureUrl || '';
  let customerSigUrl = wo.customerSignatureUrl || '';
  if (workerSignature || customerSignature) {
    const sigFolder = getOrCreateFolder(getRootFolder(), 'PM Signatures');
    if (workerSignature) workerSigUrl = saveImageToFolder(workerSignature, `PM_${safeEquip}_worker_${Date.now()}.png`, sigFolder);
    if (customerSignature) customerSigUrl = saveImageToFolder(customerSignature, `PM_${safeEquip}_customer_${Date.now()}.png`, sigFolder);
  }

  const nowIso = new Date().toISOString();
  updateRowById(shW, PM_WO_HEADERS, id, {
    ...wo,
    status: 'done',
    checklistResult: JSON.stringify(checklistResult || []),
    note: note || '',
    imgMain: imgUrl,
    completedBy: _user.username,
    completedAt: nowIso,
    workerSignatureUrl: workerSigUrl,
    customerName: customerName || wo.customerName || '',
    customerSignatureUrl: customerSigUrl
  });

  // เลื่อนกำหนดครั้งถัดไปในตาราง schedule ตามรอบที่ตั้งไว้
  if (wo.scheduleId) {
    const shS = getSheet(CONFIG.SHEETS.PM_SCHEDULES);
    ensureHeaders(shS, PM_SCHEDULE_HEADERS);
    const schedules = sheetToObjects(shS);
    const sc = schedules.find(s => s.id === wo.scheduleId);
    if (sc) {
      const interval = Number(sc.intervalDays) || 90;
      const nextDueAt = new Date(Date.now() + interval * 86400000).toISOString().slice(0, 10);
      updateRowById(shS, PM_SCHEDULE_HEADERS, sc.id, { ...sc, lastDoneAt: nowIso.slice(0, 10), nextDueAt });
    }
  }
  return { ok: true };
}

function safeParseJson(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

// มอบหมายผู้ปฏิบัติงานให้ใบงาน PM หนึ่งใบ — เฉพาะ admin/manager/leader
// (แยกสิทธิ์นี้ออกจาก "แก้ไขตารางบำรุงรักษา" ซึ่งจำกัดเฉพาะ admin/manager เท่านั้น
//  เพื่อให้หัวหน้างาน (leader) มอบหมายคนในทีมได้โดยไม่ต้องให้สิทธิ์แก้โครงสร้าง PM)
/* ================================================================
   แจ้งเตือนการมอบหมายงานทางอีเมล + รับทราบในระบบ (Section D)
   — ใช้ MailApp ในตัว GAS ส่งอีเมลตรงถึงผู้ถูกมอบหมาย (ถ้ามีอีเมลในระบบ)
   — เนื่องจาก LINE Notify ยกเลิกไปแล้ว และอีเมลอ่านตอบรับ (read-receipt)
     ไม่น่าเชื่อถือ จึงใช้วิธี "รับทราบในระบบ" แทน: ผู้ถูกมอบหมายกดรับทราบ
     ในแอปหลังเห็นงาน แล้วผู้มอบหมาย/หัวหน้าจะเห็นสถานะรับทราบชัดเจน
   ================================================================ */
function findUserRow(username) {
  const sh = getSheet(CONFIG.SHEETS.USERS);
  ensureHeaders(sh, USER_HEADERS);
  return sheetToObjects(sh).find(r => r.username === username);
}
function findUserEmail(username) { const u = findUserRow(username); return u ? (u.email || '') : ''; }
function findUserName(username)  { const u = findUserRow(username); return u ? (u.name || u.username) : username; }

// ส่งอีเมลแจ้งมอบหมายงาน — คืน true ถ้าส่งสำเร็จ (มีอีเมลในระบบและส่งไม่ error)
// ห่อด้วย try/catch เพื่อไม่ให้การมอบหมายงานล้มเหลวถ้าส่งอีเมลไม่สำเร็จ (โควตาเต็ม/อีเมลผิดรูปแบบ)
function sendAssignmentEmail(username, kindLabel, detail, assignedByUsername) {
  const email = findUserEmail(username);
  if (!email) return false;
  const name = findUserName(username);
  const assignedByName = findUserName(assignedByUsername);
  const subject = `🔧 มอบหมายงาน${kindLabel}: ${detail.equipment} (${detail.project})`;
  const body =
    `เรียน ${name},\n\n` +
    `คุณได้รับมอบหมายงาน${kindLabel} ดังนี้\n\n` +
    `โครงการ: ${detail.project}\n` +
    `อุปกรณ์: ${detail.equipment}\n` +
    (detail.locName ? `สถานที่: ${detail.locName}\n` : '') +
    (detail.extra ? `${detail.extra}\n` : '') +
    `มอบหมายโดย: ${assignedByName}\n\n` +
    `กรุณาเข้าสู่ระบบ AMR Inspection System เพื่อดูรายละเอียดและกดรับทราบงาน\n\n` +
    `— ระบบ AMR Inspection System (อีเมลนี้ส่งอัตโนมัติ กรุณาอย่าตอบกลับ)`;
  try {
    MailApp.sendEmail(email, subject, body);
    return true;
  } catch (err) {
    console.error('sendAssignmentEmail error:', err);
    return false;
  }
}

function actionAssignPmWorkOrder({ id, assignedTo, _user }) {
  if (!['admin', 'manager', 'leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์มอบหมายงาน' };
  if (!id) return { ok: false, message: 'ไม่พบใบงาน' };

  const shW = getSheet(CONFIG.SHEETS.PM_WORKORDERS);
  ensureHeaders(shW, PM_WO_HEADERS);
  const rows = sheetToObjects(shW);
  const wo = rows.find(w => w.id === id);
  if (!wo) return { ok: false, message: 'ไม่พบใบงาน' };

  // leader มอบหมายได้เฉพาะใบงานในโครงการที่ตัวเองดูแล
  if (_user.role === 'leader' && !userCanAccessProject(_user, wo.project))
    return { ok: false, message: 'ไม่มีสิทธิ์มอบหมายงานในโครงการนี้' };

  const newAssignedTo = assignedTo || '';
  const isReassign = newAssignedTo && newAssignedTo !== wo.assignedTo;
  let notified = false;
  if (isReassign) {
    notified = sendAssignmentEmail(newAssignedTo, 'บำรุงรักษาเชิงป้องกัน (PM)', {
      project: wo.project, equipment: wo.equipment, locName: wo.locName,
      extra: wo.dueDate ? `กำหนดบำรุงรักษา: ${wo.dueDate}` : ''
    }, _user.username);
  }

  updateRowById(shW, PM_WO_HEADERS, id, {
    ...wo,
    assignedTo: newAssignedTo,
    assignedBy: _user.username,
    assignedAt: new Date().toISOString(),
    notifiedAt: isReassign ? new Date().toISOString() : (wo.notifiedAt || ''),
    acknowledgedAt: isReassign ? '' : (wo.acknowledgedAt || '')
  });
  return { ok: true, notified };
}

// ผู้ถูกมอบหมายกดรับทราบงานเอง — เฉพาะเจ้าของงาน (assignedTo) เท่านั้นที่กดได้
function actionAcknowledgePmWorkOrder({ id, _user }) {
  const shW = getSheet(CONFIG.SHEETS.PM_WORKORDERS);
  ensureHeaders(shW, PM_WO_HEADERS);
  const rows = sheetToObjects(shW);
  const wo = rows.find(w => w.id === id);
  if (!wo) return { ok: false, message: 'ไม่พบใบงาน' };
  if (wo.assignedTo !== _user.username) return { ok: false, message: 'รับทราบได้เฉพาะงานที่มอบหมายให้ตัวเองเท่านั้น' };
  updateRowById(shW, PM_WO_HEADERS, id, { ...wo, acknowledgedAt: new Date().toISOString() });
  return { ok: true };
}

// รายชื่อผู้ใช้แบบย่อ (ไม่มีรหัสผ่าน) สำหรับ dropdown มอบหมายงาน — เปิดให้ admin/manager/leader ใช้ได้
// (ต่างจาก actionListUsers ที่เป็นหน้าจัดการผู้ใช้งานเต็มรูปแบบ จำกัดเฉพาะ admin)
function actionListUserRoster({ _user }) {
  if (!['admin', 'manager', 'leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์' };
  const sh = getSheet(CONFIG.SHEETS.USERS);
  ensureHeaders(sh, USER_HEADERS);
  let rows = sheetToObjects(sh).filter(r => String(r.active).toLowerCase() !== 'false');
  if (_user.role === 'leader') {
    const userProjs = (_user.project || '').split(',').map(p => p.trim()).filter(Boolean);
    rows = rows.filter(r => {
      const rProjs = (r.project || '').split(',').map(p => p.trim()).filter(Boolean);
      return rProjs.some(p => userProjs.includes(p)) || r.username === _user.username;
    });
  }
  return {
    ok: true,
    roster: rows.map(r => ({ username: r.username, name: r.name, role: r.role, project: r.project, hasEmail: !!r.email }))
  };
}

/* ================================================================
   CHECKLIST / WI TEMPLATE LIBRARY
   — คลังแม่แบบเช็คลิสต์ + เอกสารคู่มือ (Work Instruction, PDF) กลาง
     ให้ PM Schedule เลือกใช้แทนพิมพ์ checklist เองทุกครั้ง
   — แก้ไข/ลบได้เฉพาะ admin/manager (ลดความเสี่ยงให้ role อื่นไปยุ่ง
     กับ "โครงสร้าง" ได้ — role อื่นดู/ใช้ได้อย่างเดียว)
   ================================================================ */
const CHECKLIST_TEMPLATE_HEADERS = ['id', 'name', 'checklist', 'wiFileUrl', 'wiFileName', 'active', 'createdBy', 'createdAt'];

function actionListChecklistTemplates({ _user }) {
  const sh = getSheet(CONFIG.SHEETS.CHECKLIST_TEMPLATES);
  ensureHeaders(sh, CHECKLIST_TEMPLATE_HEADERS);
  const rows = sheetToObjects(sh).map(r => ({ ...r, checklist: safeParseJson(r.checklist, []) }));
  return { ok: true, templates: rows };
}

function actionSaveChecklistTemplate({ template, wiFile, wiFileName, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้นที่จัดการคลังเช็คลิสต์/WI ได้' };
  if (!template || !template.name)
    return { ok: false, message: 'ต้องมีชื่อแม่แบบ' };

  const sh = getSheet(CONFIG.SHEETS.CHECKLIST_TEMPLATES);
  ensureHeaders(sh, CHECKLIST_TEMPLATE_HEADERS);
  const checklist = JSON.stringify(template.checklist || []);

  let wiFileUrl = template.wiFileUrl || '';
  let wiName = template.wiFileName || '';
  if (wiFile) {
    const folder = getOrCreateFolder(getRootFolder(), 'WI Documents');
    const safeName = String(wiFileName || 'WI').replace(/[/\\:*?"<>|]/g, '_');
    wiFileUrl = saveImageToFolder(wiFile, `${safeName}_${Date.now()}.pdf`, folder);
    wiName = wiFileName || '';
  }

  if (template.id) {
    const rows = sheetToObjects(sh);
    const existing = rows.find(t => t.id === template.id);
    if (existing) {
      updateRowById(sh, CHECKLIST_TEMPLATE_HEADERS, template.id, {
        ...existing,
        name: template.name, checklist,
        wiFileUrl, wiFileName: wiName,
        active: template.active !== undefined ? String(template.active) : existing.active
      });
      return { ok: true, action: 'updated' };
    }
  }

  const id = genId();
  appendRow(sh, CHECKLIST_TEMPLATE_HEADERS, {
    id, name: template.name, checklist,
    wiFileUrl, wiFileName: wiName, active: 'true',
    createdBy: _user.username, createdAt: new Date().toISOString()
  });
  return { ok: true, action: 'created', id };
}

function actionDeleteChecklistTemplate({ id, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้น' };
  const sh = getSheet(CONFIG.SHEETS.CHECKLIST_TEMPLATES);
  const ok = deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

/* ================================================================
   EQUIPMENT DOCUMENTS — เอกสาร/ข้อมูลแนบของอุปกรณ์แต่ละชิ้น
   (คู่มือ, สเปค, ใบรับประกัน, รูปแผงวงจร ฯลฯ — ไฟล์ประเภทใดก็ได้ ไม่จำกัดแค่ PDF)
   — แนบ/ลบได้เฉพาะ admin เท่านั้น ตามที่ระบุไว้ ("ให้ admin แนบข้อมูลในระบบได้")
     ส่วน role อื่นดู/ดาวน์โหลดได้อย่างเดียว (scope ตามสิทธิ์เข้าถึงโครงการเดิม)
   ================================================================ */
const EQUIPMENT_DOC_HEADERS = ['id', 'project', 'system', 'locName', 'subName', 'equipment', 'docName', 'fileUrl', 'fileName', 'note', 'uploadedBy', 'uploadedAt'];

function actionListEquipmentDocs({ _user }) {
  const sh = getSheet(CONFIG.SHEETS.EQUIPMENT_DOCS);
  ensureHeaders(sh, EQUIPMENT_DOC_HEADERS);
  let rows = sheetToObjects(sh).filter(r => r.id);
  if (_user.role === 'leader' || _user.role === 'inspector') {
    rows = rows.filter(r => userCanAccessProject(_user, r.project));
  }
  return { ok: true, docs: rows };
}

function actionSaveEquipmentDoc({ doc, file, fileName, _user }) {
  if (_user.role !== 'admin')
    return { ok: false, message: 'เฉพาะ admin เท่านั้นที่แนบเอกสารอุปกรณ์ได้' };
  if (!doc || !doc.project || !doc.equipment || !doc.docName)
    return { ok: false, message: 'ต้องมีโครงการ, อุปกรณ์ และชื่อเอกสาร' };
  if (!doc.id && !file)
    return { ok: false, message: 'ต้องแนบไฟล์' };

  const sh = getSheet(CONFIG.SHEETS.EQUIPMENT_DOCS);
  ensureHeaders(sh, EQUIPMENT_DOC_HEADERS);

  let fileUrl = doc.fileUrl || '';
  let savedFileName = doc.fileName || '';
  if (file) {
    const folder = getOrCreateDynamicFolder('AMR Equipment Documents', doc.project, doc.locName, doc.subName, doc.equipment, 'Documents');
    const extMatch = String(fileName || '').match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch ? extMatch[0] : '';
    const safeName = String(doc.docName || fileName || 'doc').replace(/[/\\:*?"<>|]/g, '_');
    fileUrl = saveImageToFolder(file, `${safeName}_${Date.now()}${ext}`, folder);
    savedFileName = fileName || '';
  }

  if (doc.id) {
    const rows = sheetToObjects(sh);
    const existing = rows.find(d => d.id === doc.id);
    if (existing) {
      updateRowById(sh, EQUIPMENT_DOC_HEADERS, doc.id, {
        ...existing,
        project: doc.project, system: doc.system || '', locName: doc.locName || '', subName: doc.subName || '',
        equipment: doc.equipment, docName: doc.docName, fileUrl, fileName: savedFileName, note: doc.note || ''
      });
      return { ok: true, action: 'updated' };
    }
  }

  const id = genId();
  appendRow(sh, EQUIPMENT_DOC_HEADERS, {
    id, project: doc.project, system: doc.system || '', locName: doc.locName || '', subName: doc.subName || '',
    equipment: doc.equipment, docName: doc.docName, fileUrl, fileName: savedFileName, note: doc.note || '',
    uploadedBy: _user.username, uploadedAt: new Date().toISOString()
  });
  return { ok: true, action: 'created', id };
}

function actionDeleteEquipmentDoc({ id, _user }) {
  if (_user.role !== 'admin')
    return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  const sh = getSheet(CONFIG.SHEETS.EQUIPMENT_DOCS);
  const ok = deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

/* ================================================================
   STORE CONTROL — คลังอะไหล่ (แยกออกจาก Equipment Control)
   ระบบสต็อกเต็มรูปแบบ: รายการอะไหล่ + บัญชีเดินสต็อก (ledger) + workflow
   เบิก/คืน ต้องผ่านการอนุมัติจากหัวหน้า/manager/admin ก่อนตัด/คืนสต็อกจริง
   ส่วนเพิ่ม/ย้าย/นำออก เป็นสิทธิ์ admin/manager (จัดการ "โครงสร้าง" สต็อก
   โดยตรง จึงไม่ต้องผ่านขั้นตอนอนุมัติซ้ำ — ตามหลักการเดิมของระบบที่ให้
   admin/manager เท่านั้นแก้ไขโครงสร้าง ส่วน role อื่นทำได้แค่ "ทำรายการ")
   สต็อกคงเหลือคำนวณสดจากผลรวมของ transaction ที่ status='approved'
   เท่านั้น (ไม่มีตัวเลขสต็อกแยกเก็บต่างหาก) เพื่อไม่ให้ข้อมูลเพี้ยน/ไม่ตรงกัน

   สำคัญ: "รายการอะไหล่" (StoreParts) เป็นแค็ตตาล็อกกลาง ไม่ผูกกับโครงการ
   ใดโครงการหนึ่ง (เหมือนรหัสสินค้า/SKU กลาง) ส่วน "สต็อกคงเหลือ" เป็นเรื่อง
   ต่อโครงการเสมอ (คำนวณจาก ledger ต่อคู่ project+partId) — ออกแบบแบบนี้
   เพื่อให้ "ย้ายอะไหล่ไปอีกโครงการ" ใช้งานได้จริง โดยไม่เกิดยอดสต็อกที่ไป
   โผล่ในโครงการปลายทางแต่ไม่มีรายการแค็ตตาล็อกรองรับ
   ================================================================ */
const STORE_PART_HEADERS = ['id', 'partNo', 'partName', 'unit', 'minStock', 'note', 'active', 'createdBy', 'createdAt'];
const STORE_TX_HEADERS = [
  'id', 'partId', 'partNo', 'partName', 'project', 'toProject', 'moveRefId',
  'type', 'qty', 'reason', 'status',
  'requestedBy', 'requestedAt', 'approvedBy', 'approvedAt', 'rejectReason',
  'refWorkOrderId', 'createdAt'
];
// ประเภท transaction ที่ "เพิ่ม" สต็อกเข้า project ของแถวนั้น
const STORE_TX_IN_TYPES = ['return', 'add', 'move_in'];
// ที่เหลือ (withdraw, remove, move_out) คือ "ตัด" สต็อกออก

function getStoreStockMap() {
  const sh = getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  ensureHeaders(sh, STORE_TX_HEADERS);
  const rows = sheetToObjects(sh).filter(t => t.id && t.status === 'approved');
  const map = {}; // key: project + '||' + partId  → qty
  rows.forEach(t => {
    const key = t.project + '||' + t.partId;
    const delta = STORE_TX_IN_TYPES.includes(t.type) ? Number(t.qty) : -Number(t.qty);
    map[key] = (map[key] || 0) + delta;
  });
  return map;
}

// โครงการทั้งหมดที่ user คนนี้มองเห็นได้ (ใช้กรองยอดสต็อกรวมของ leader/inspector)
function getVisibleProjectsForUser(_user) {
  if (_user.role === 'admin' || _user.role === 'manager') return null; // null = ไม่กรอง เห็นทุกโครงการ
  return (_user.project || '').split(',').map(p => p.trim()).filter(Boolean);
}

// รายการอะไหล่ (แค็ตตาล็อกกลาง) พร้อมยอดสต็อก
// - ถ้าระบุ project มา: คืนสต็อกเฉพาะโครงการนั้น
// - ถ้าไม่ระบุ: คืนผลรวมสต็อกจากทุกโครงการที่ user มองเห็น (admin/manager เห็นทุกโครงการ)
function actionListStoreParts({ project, _user }) {
  const sh = getSheet(CONFIG.SHEETS.STORE_PARTS);
  ensureHeaders(sh, STORE_PART_HEADERS);
  const parts = sheetToObjects(sh).filter(p => p.id);
  const stockMap = getStoreStockMap();
  const visibleProjs = getVisibleProjectsForUser(_user); // null = ทุกโครงการ

  const rows = parts.map(p => {
    let stock = 0;
    if (project) {
      stock = stockMap[project + '||' + p.id] || 0;
    } else {
      Object.keys(stockMap).forEach(key => {
        if (!key.endsWith('||' + p.id)) return;
        const proj = key.slice(0, key.length - ('||' + p.id).length);
        if (visibleProjs && !visibleProjs.includes(proj)) return;
        stock += stockMap[key];
      });
    }
    return { ...p, stock };
  });
  return { ok: true, parts: rows };
}

function actionSaveStorePart({ part, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้นที่จัดการรายการอะไหล่ได้' };
  if (!part || !part.partName || !part.unit)
    return { ok: false, message: 'ต้องมีชื่ออะไหล่ และหน่วยนับ' };

  const sh = getSheet(CONFIG.SHEETS.STORE_PARTS);
  ensureHeaders(sh, STORE_PART_HEADERS);

  if (part.id) {
    const rows = sheetToObjects(sh);
    const existing = rows.find(p => p.id === part.id);
    if (existing) {
      updateRowById(sh, STORE_PART_HEADERS, part.id, {
        ...existing,
        partNo: part.partNo || '', partName: part.partName,
        unit: part.unit, minStock: part.minStock || 0, note: part.note || '',
        active: part.active !== undefined ? String(part.active) : existing.active
      });
      return { ok: true, action: 'updated' };
    }
  }

  const id = genId();
  appendRow(sh, STORE_PART_HEADERS, {
    id, partNo: part.partNo || '', partName: part.partName,
    unit: part.unit, minStock: part.minStock || 0, note: part.note || '', active: 'true',
    createdBy: _user.username, createdAt: new Date().toISOString()
  });
  return { ok: true, action: 'created', id };
}

function actionDeleteStorePart({ id, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้น' };
  const sh = getSheet(CONFIG.SHEETS.STORE_PARTS);
  const ok = deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

function actionListStoreTransactions({ _user }) {
  const sh = getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  ensureHeaders(sh, STORE_TX_HEADERS);
  let rows = sheetToObjects(sh).filter(t => t.id);
  const role = _user.role, uname = _user.username;
  if (role === 'leader') {
    rows = rows.filter(t => userCanAccessProject(_user, t.project) || t.requestedBy === uname);
  } else if (!['admin', 'manager'].includes(role)) {
    // inspector และ role ปฏิบัติงานอื่น เห็นเฉพาะรายการที่ตัวเองทำรายการไว้
    rows = rows.filter(t => t.requestedBy === uname);
  }
  return { ok: true, transactions: rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) };
}

function findStorePart(id) {
  const sh = getSheet(CONFIG.SHEETS.STORE_PARTS);
  ensureHeaders(sh, STORE_PART_HEADERS);
  return sheetToObjects(sh).find(p => p.id === id);
}

// เบิกอะไหล่ — ทุก role ยกเว้น observer ทำรายการได้ แต่สต็อกจะยังไม่ถูกตัดจนกว่าจะได้รับอนุมัติ
function actionRequestStoreWithdraw({ partId, project, qty, reason, refWorkOrderId, _user }) {
  if (_user.role === 'observer') return { ok: false, message: 'ไม่มีสิทธิ์เบิกอะไหล่' };
  const part = findStorePart(partId);
  if (!part) return { ok: false, message: 'ไม่พบรายการอะไหล่' };
  if (!project) return { ok: false, message: 'ต้องระบุโครงการ' };
  const q = Number(qty);
  if (!q || q <= 0) return { ok: false, message: 'ระบุจำนวนที่ต้องการเบิก' };
  if ((_user.role === 'leader' || _user.role === 'inspector') && !userCanAccessProject(_user, project))
    return { ok: false, message: 'ไม่มีสิทธิ์เบิกอะไหล่โครงการนี้' };

  const stockMap = getStoreStockMap();
  const available = stockMap[project + '||' + part.id] || 0;
  if (q > available) return { ok: false, message: `สต็อกคงเหลือไม่พอ (เหลือ ${available} ${part.unit})` };

  const sh = getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  ensureHeaders(sh, STORE_TX_HEADERS);
  const id = genId();
  appendRow(sh, STORE_TX_HEADERS, {
    id, partId: part.id, partNo: part.partNo || '', partName: part.partName,
    project, toProject: '', moveRefId: '',
    type: 'withdraw', qty: q, reason: reason || '', status: 'pending',
    requestedBy: _user.username, requestedAt: new Date().toISOString(),
    approvedBy: '', approvedAt: '', rejectReason: '',
    refWorkOrderId: refWorkOrderId || '', createdAt: new Date().toISOString()
  });
  return { ok: true, id };
}

// คืนอะไหล่ — เช่นเดียวกับเบิก ต้องรอหัวหน้า/manager/admin อนุมัติก่อนจึงจะบวกกลับเข้าสต็อกจริง
// (กันไม่ให้อ้างคืนเท็จเพื่อกลบยอดที่เบิกเกิน/ทำหาย)
function actionRequestStoreReturn({ partId, project, qty, reason, refWorkOrderId, _user }) {
  if (_user.role === 'observer') return { ok: false, message: 'ไม่มีสิทธิ์คืนอะไหล่' };
  const part = findStorePart(partId);
  if (!part) return { ok: false, message: 'ไม่พบรายการอะไหล่' };
  if (!project) return { ok: false, message: 'ต้องระบุโครงการ' };
  const q = Number(qty);
  if (!q || q <= 0) return { ok: false, message: 'ระบุจำนวนที่ต้องการคืน' };
  if ((_user.role === 'leader' || _user.role === 'inspector') && !userCanAccessProject(_user, project))
    return { ok: false, message: 'ไม่มีสิทธิ์คืนอะไหล่โครงการนี้' };

  const sh = getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  ensureHeaders(sh, STORE_TX_HEADERS);
  const id = genId();
  appendRow(sh, STORE_TX_HEADERS, {
    id, partId: part.id, partNo: part.partNo || '', partName: part.partName,
    project, toProject: '', moveRefId: '',
    type: 'return', qty: q, reason: reason || '', status: 'pending',
    requestedBy: _user.username, requestedAt: new Date().toISOString(),
    approvedBy: '', approvedAt: '', rejectReason: '',
    refWorkOrderId: refWorkOrderId || '', createdAt: new Date().toISOString()
  });
  return { ok: true, id };
}

// อนุมัติรายการเบิก/คืน — admin/manager/leader (leader จำกัดเฉพาะโครงการที่ดูแล)
function actionApproveStoreTx({ id, _user }) {
  if (!['admin', 'manager', 'leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์อนุมัติ' };
  const sh = getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  ensureHeaders(sh, STORE_TX_HEADERS);
  const rows = sheetToObjects(sh);
  const tx = rows.find(t => t.id === id);
  if (!tx) return { ok: false, message: 'ไม่พบรายการ' };
  if (tx.status !== 'pending') return { ok: false, message: 'รายการนี้ถูกดำเนินการไปแล้ว' };
  if (_user.role === 'leader' && !userCanAccessProject(_user, tx.project))
    return { ok: false, message: 'ไม่มีสิทธิ์อนุมัติรายการโครงการนี้' };

  // เช็คสต็อกอีกครั้ง ณ เวลาอนุมัติจริง กันกรณีมีรายการอื่นตัดสต็อกไปก่อนระหว่างที่รออนุมัติ
  if (tx.type === 'withdraw') {
    const stockMap = getStoreStockMap();
    const available = stockMap[tx.project + '||' + tx.partId] || 0;
    if (Number(tx.qty) > available)
      return { ok: false, message: `สต็อกคงเหลือไม่พอในตอนนี้ (เหลือ ${available}) กรุณาปฏิเสธหรือรอเติมสต็อก` };
  }

  updateRowById(sh, STORE_TX_HEADERS, id, {
    ...tx, status: 'approved', approvedBy: _user.username, approvedAt: new Date().toISOString()
  });
  return { ok: true };
}

function actionRejectStoreTx({ id, rejectReason, _user }) {
  if (!['admin', 'manager', 'leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์' };
  const sh = getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  ensureHeaders(sh, STORE_TX_HEADERS);
  const rows = sheetToObjects(sh);
  const tx = rows.find(t => t.id === id);
  if (!tx) return { ok: false, message: 'ไม่พบรายการ' };
  if (tx.status !== 'pending') return { ok: false, message: 'รายการนี้ถูกดำเนินการไปแล้ว' };
  if (_user.role === 'leader' && !userCanAccessProject(_user, tx.project))
    return { ok: false, message: 'ไม่มีสิทธิ์ปฏิเสธรายการโครงการนี้' };

  updateRowById(sh, STORE_TX_HEADERS, id, {
    ...tx, status: 'rejected', approvedBy: _user.username, approvedAt: new Date().toISOString(),
    rejectReason: rejectReason || ''
  });
  return { ok: true };
}

// เพิ่ม/นำออก/ย้าย สต็อกโดยตรง — admin/manager เท่านั้น อนุมัติอัตโนมัติในตัว (ไม่ผ่านขั้นตอนขออนุมัติซ้ำ)
function actionAdjustStoreStock({ mode, partId, project, qty, toProject, reason, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้นที่ปรับสต็อกโดยตรงได้' };
  const part = findStorePart(partId);
  if (!part) return { ok: false, message: 'ไม่พบรายการอะไหล่' };
  if (!project) return { ok: false, message: 'ต้องระบุโครงการ' };
  const q = Number(qty);
  if (!q || q <= 0) return { ok: false, message: 'ระบุจำนวนให้ถูกต้อง' };

  const sh = getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  ensureHeaders(sh, STORE_TX_HEADERS);
  const now = new Date().toISOString();

  function makeTx(type, proj, extra) {
    const id = genId();
    appendRow(sh, STORE_TX_HEADERS, {
      id, partId: part.id, partNo: part.partNo || '', partName: part.partName,
      project: proj, toProject: extra.toProject || '', moveRefId: extra.moveRefId || '',
      type, qty: q, reason: reason || '', status: 'approved',
      requestedBy: _user.username, requestedAt: now, approvedBy: _user.username, approvedAt: now,
      rejectReason: '', refWorkOrderId: '', createdAt: now
    });
    return id;
  }

  if (mode === 'add') {
    makeTx('add', project, {});
    return { ok: true };
  }
  if (mode === 'remove') {
    const stockMap = getStoreStockMap();
    const available = stockMap[project + '||' + part.id] || 0;
    if (q > available) return { ok: false, message: `สต็อกคงเหลือไม่พอ (เหลือ ${available} ${part.unit})` };
    makeTx('remove', project, {});
    return { ok: true };
  }
  if (mode === 'move') {
    if (!toProject || toProject === project) return { ok: false, message: 'ต้องระบุโครงการปลายทางที่ต่างจากต้นทาง' };
    const stockMap = getStoreStockMap();
    const available = stockMap[project + '||' + part.id] || 0;
    if (q > available) return { ok: false, message: `สต็อกคงเหลือไม่พอ (เหลือ ${available} ${part.unit})` };
    const outId = makeTx('move_out', project, { toProject });
    makeTx('move_in', toProject, { toProject: project, moveRefId: outId });
    return { ok: true };
  }
  return { ok: false, message: 'ไม่รู้จักประเภทการปรับสต็อก' };
}

/* ================================================================
   CORRECTIVE MAINTENANCE (CM) — งานซ่อมบำรุงเชิงแก้ไข
   ต่างจาก PM ตรงที่ไม่มี "ตารางล่วงหน้า" — เกิดจากการแจ้งซ่อมเมื่อมีปัญหาจริง
   ไหลงาน: แจ้งซ่อม (ทุก role ยกเว้น observer) → มอบหมายผู้ปฏิบัติงาน
   (admin/manager/leader — โครงสร้างสิทธิ์เดียวกับ PM) → บันทึกผลปิดงาน
   (ทุก role ยกเว้น observer) พร้อมสาเหตุ/วิธีแก้/Downtime/อะไหล่ที่ใช้/
   ชิ้นส่วนที่ถอดออก (ส่งซ่อม/ทำลายทิ้ง/เก็บไว้) ซึ่งเป็นข้อมูลที่ PM ยังเก็บ
   แบบดิจิทัลไม่ได้ (ต้องกรอกมือ) — CM เก็บได้จริงเพราะเป็นเนื้องานโดยตรง
   ================================================================ */
const CM_HEADERS = [
  'id', 'project', 'system', 'locName', 'subName', 'equipment', 'serial',
  'priority', 'problemDescription', 'status',
  'reportedBy', 'reportedAt', 'assignedTo', 'assignedBy', 'assignedAt',
  'causeOfFailure', 'actionTaken', 'downtimeMinutes', 'note', 'partsUsed', 'removedParts',
  'imgBefore', 'imgAfter', 'completedBy', 'completedAt',
  'workerSignatureUrl', 'customerName', 'customerSignatureUrl', 'createdAt',
  'notifiedAt', 'acknowledgedAt'
];

function actionListCmTickets({ _user }) {
  const sh = getSheet(CONFIG.SHEETS.CM_TICKETS);
  ensureHeaders(sh, CM_HEADERS);
  let rows = sheetToObjects(sh).filter(t => t.id);
  if (_user.role === 'leader' || _user.role === 'inspector') {
    rows = rows.filter(t => userCanAccessProject(_user, t.project));
  }
  rows = rows.map(t => ({
    ...t,
    partsUsed: safeParseJson(t.partsUsed, []),
    removedParts: safeParseJson(t.removedParts, [])
  }));
  return { ok: true, tickets: rows };
}

// แจ้งซ่อม — ทุก role ยกเว้น observer แจ้งได้ (สร้าง ticket สถานะ pending รอมอบหมาย)
function actionReportCmTicket({ ticket, image, _user }) {
  if (_user.role === 'observer') return { ok: false, message: 'ไม่มีสิทธิ์แจ้งซ่อม' };
  if (!ticket || !ticket.project || !ticket.equipment || !ticket.problemDescription)
    return { ok: false, message: 'ต้องมีโครงการ, อุปกรณ์ และรายละเอียดปัญหา' };
  if ((_user.role === 'leader' || _user.role === 'inspector') && !userCanAccessProject(_user, ticket.project))
    return { ok: false, message: 'ไม่มีสิทธิ์แจ้งซ่อมโครงการนี้' };

  const sh = getSheet(CONFIG.SHEETS.CM_TICKETS);
  ensureHeaders(sh, CM_HEADERS);

  let imgUrl = '';
  if (image) {
    const safeEquip = String(ticket.equipment || 'img').replace(/[/\\:*?"<>|]/g, '_');
    const folder = getOrCreateDynamicFolder('AMR Inspection Images', ticket.project, ticket.locName, ticket.subName, ticket.equipment, 'CM Photos');
    imgUrl = saveImageToFolder(image, `CM_${safeEquip}_report_${Date.now()}.jpg`, folder);
  }

  const id = genId();
  appendRow(sh, CM_HEADERS, {
    id, project: ticket.project, system: ticket.system || '', locName: ticket.locName || '',
    subName: ticket.subName || '', equipment: ticket.equipment, serial: ticket.serial || '',
    priority: ticket.priority || 'normal', problemDescription: ticket.problemDescription, status: 'pending',
    reportedBy: _user.username, reportedAt: new Date().toISOString(),
    assignedTo: '', assignedBy: '', assignedAt: '',
    causeOfFailure: '', actionTaken: '', downtimeMinutes: '', note: '', partsUsed: '[]', removedParts: '[]',
    imgBefore: imgUrl, imgAfter: '', completedBy: '', completedAt: '',
    workerSignatureUrl: '', customerName: '', customerSignatureUrl: '', createdAt: new Date().toISOString()
  });
  return { ok: true, id };
}

// มอบหมายผู้ปฏิบัติงาน — admin/manager/leader (โครงสร้างสิทธิ์เดียวกับ actionAssignPmWorkOrder)
function actionAssignCmTicket({ id, assignedTo, _user }) {
  if (!['admin', 'manager', 'leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์มอบหมายงาน' };
  if (!id) return { ok: false, message: 'ไม่พบใบแจ้งซ่อม' };

  const sh = getSheet(CONFIG.SHEETS.CM_TICKETS);
  ensureHeaders(sh, CM_HEADERS);
  const rows = sheetToObjects(sh);
  const t = rows.find(x => x.id === id);
  if (!t) return { ok: false, message: 'ไม่พบใบแจ้งซ่อม' };
  if (_user.role === 'leader' && !userCanAccessProject(_user, t.project))
    return { ok: false, message: 'ไม่มีสิทธิ์มอบหมายงานในโครงการนี้' };

  const newAssignedTo = assignedTo || '';
  const isReassign = newAssignedTo && newAssignedTo !== t.assignedTo;
  let notified = false;
  if (isReassign) {
    notified = sendAssignmentEmail(newAssignedTo, 'ซ่อมบำรุงเชิงแก้ไข (CM)', {
      project: t.project, equipment: t.equipment, locName: t.locName,
      extra: t.problemDescription ? `ปัญหา: ${t.problemDescription}` : ''
    }, _user.username);
  }

  updateRowById(sh, CM_HEADERS, id, {
    ...t,
    assignedTo: newAssignedTo, assignedBy: _user.username, assignedAt: new Date().toISOString(),
    status: t.status === 'pending' && newAssignedTo ? 'in_progress' : t.status,
    notifiedAt: isReassign ? new Date().toISOString() : (t.notifiedAt || ''),
    acknowledgedAt: isReassign ? '' : (t.acknowledgedAt || '')
  });
  return { ok: true, notified };
}

// ผู้ถูกมอบหมายกดรับทราบงานเอง — เฉพาะเจ้าของงาน (assignedTo) เท่านั้นที่กดได้
function actionAcknowledgeCmTicket({ id, _user }) {
  const sh = getSheet(CONFIG.SHEETS.CM_TICKETS);
  ensureHeaders(sh, CM_HEADERS);
  const rows = sheetToObjects(sh);
  const t = rows.find(x => x.id === id);
  if (!t) return { ok: false, message: 'ไม่พบใบแจ้งซ่อม' };
  if (t.assignedTo !== _user.username) return { ok: false, message: 'รับทราบได้เฉพาะงานที่มอบหมายให้ตัวเองเท่านั้น' };
  updateRowById(sh, CM_HEADERS, id, { ...t, acknowledgedAt: new Date().toISOString() });
  return { ok: true };
}

function actionCompleteCmTicket({ id, causeOfFailure, actionTaken, downtimeMinutes, note, partsUsed, removedParts,
  imageBefore, imageAfter, workerSignature, customerSignature, customerName, _user }) {
  if (_user.role === 'observer') return { ok: false, message: 'ไม่มีสิทธิ์บันทึกผล' };
  if (!id) return { ok: false, message: 'ไม่พบใบแจ้งซ่อม' };

  const sh = getSheet(CONFIG.SHEETS.CM_TICKETS);
  ensureHeaders(sh, CM_HEADERS);
  const rows = sheetToObjects(sh);
  const t = rows.find(x => x.id === id);
  if (!t) return { ok: false, message: 'ไม่พบใบแจ้งซ่อม' };

  const safeEquip = String(t.equipment || 'img').replace(/[/\\:*?"<>|]/g, '_');
  let imgBeforeUrl = t.imgBefore || '';
  let imgAfterUrl = t.imgAfter || '';
  if (imageBefore) {
    const folder = getOrCreateDynamicFolder('AMR Inspection Images', t.project, t.locName, t.subName, t.equipment, 'CM Photos');
    imgBeforeUrl = saveImageToFolder(imageBefore, `CM_${safeEquip}_before_${Date.now()}.jpg`, folder);
  }
  if (imageAfter) {
    const folder = getOrCreateDynamicFolder('AMR Inspection Images', t.project, t.locName, t.subName, t.equipment, 'CM Photos');
    imgAfterUrl = saveImageToFolder(imageAfter, `CM_${safeEquip}_after_${Date.now()}.jpg`, folder);
  }
  let workerSigUrl = t.workerSignatureUrl || '';
  let customerSigUrl = t.customerSignatureUrl || '';
  if (workerSignature || customerSignature) {
    const sigFolder = getOrCreateFolder(getRootFolder(), 'CM Signatures');
    if (workerSignature) workerSigUrl = saveImageToFolder(workerSignature, `CM_${safeEquip}_worker_${Date.now()}.png`, sigFolder);
    if (customerSignature) customerSigUrl = saveImageToFolder(customerSignature, `CM_${safeEquip}_customer_${Date.now()}.png`, sigFolder);
  }

  updateRowById(sh, CM_HEADERS, id, {
    ...t,
    status: 'done',
    causeOfFailure: causeOfFailure || '', actionTaken: actionTaken || '',
    downtimeMinutes: downtimeMinutes || '', note: note || '',
    partsUsed: JSON.stringify(partsUsed || []), removedParts: JSON.stringify(removedParts || []),
    imgBefore: imgBeforeUrl, imgAfter: imgAfterUrl,
    completedBy: _user.username, completedAt: new Date().toISOString(),
    workerSignatureUrl: workerSigUrl, customerName: customerName || t.customerName || '', customerSignatureUrl: customerSigUrl
  });
  return { ok: true };
}

function actionCreateSurvey({ record, images, _user }) {
  const sh = getSheet(CONFIG.SHEETS.SURVEY);
  ensureHeaders(sh, SURVEY_HEADERS);

  let imgMain='', thumbMain='', imgSticker='', thumbSticker='';
  const ts   = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const equip = (record.equipment || 'survey').replace(/[/\\:*?"<>|]/g, '_');
  const ser   = (record.serial   || '').replace(/[/\\:*?"<>|]/g, '_');
  const fname = (suffix) => `${equip}_${ser}_${ts}_${suffix}.jpg`;
  const equipFolder = getOrCreateDynamicFolder(
    'AMR Onsite Inspection Images',
    record.project, record.location, record.sublocation, record.equipment,
    'Equipment Photos'
  );
  const stickerFolder = getOrCreateDynamicFolder(
    'AMR Onsite Inspection Images',
    record.project, record.location, record.sublocation, record.equipment,
    'Sticker Photos'
  );
  if (images && images.main) {
    imgMain = saveImageToFolder(images.main, fname('main'), equipFolder);
    thumbMain = getThumbnailUrl(imgMain);
  }
  if (images && images.sticker) {
    imgSticker = saveImageToFolder(images.sticker, fname('sticker'), stickerFolder);
    thumbSticker = getThumbnailUrl(imgSticker);
  }

  appendRow(sh, SURVEY_HEADERS, { ...record, imgMain, thumbMain, imgSticker, thumbSticker, createdBy: _user.username });
  exportSurveyExcelToDrive(record.project);
  return { ok: true, serverId: record.id };
}

function actionListSurvey({ _user }) {
  const sh   = getSheet(CONFIG.SHEETS.SURVEY);
  ensureHeaders(sh, SURVEY_HEADERS);
  let rows = sheetToObjects(sh);

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

function actionUpdateSurvey({ record, images, _user }) {
  const sh   = getSheet(CONFIG.SHEETS.SURVEY);
  const rows = sheetToObjects(sh);
  const old  = rows.find(r => r.id === record.id);
  if (!old) return { ok: false, message: 'ไม่พบรายการ' };

  const role = _user.role;
  if ((role === 'leader' || role === 'inspector') && !userCanAccessProject(_user, old.project)) {
    return { ok: false, message: 'ไม่มีสิทธิ์แก้ไขรายการของโครงการนี้' };
  }

  let imgMain    = old.imgMain    || '';
  let thumbMain  = old.thumbMain  || '';
  let imgSticker = old.imgSticker || '';
  let thumbSticker = old.thumbSticker || '';
  const ts   = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const base = (record.serial || record.equipment || 'survey').replace(/[^\w\u0E00-\u0E7F]/g,'_');

  if (images && images.main && images.main.startsWith('data:')) {
    const folder = getFolder([CONFIG.FOLDERS.ONSITE_IMAGES, CONFIG.FOLDERS.ONSITE_IMG_EQUIP]);
    imgMain   = saveImageToFolder(images.main, `${base}_main_${ts}.jpg`, folder);
    thumbMain = getThumbnailUrl(imgMain);
  }
  if (images && images.sticker && images.sticker.startsWith('data:')) {
    const folder = getFolder([CONFIG.FOLDERS.ONSITE_IMAGES, CONFIG.FOLDERS.ONSITE_IMG_STICK]);
    imgSticker   = saveImageToFolder(images.sticker, `${base}_sticker_${ts}.jpg`, folder);
    thumbSticker = getThumbnailUrl(imgSticker);
  }

  const updated = { ...record, imgMain, thumbMain, imgSticker, thumbSticker, createdBy: old.createdBy };
  const ok = updateRowById(sh, SURVEY_HEADERS, record.id, updated);
  if (ok) exportSurveyExcelToDrive(record.project);
  return { ok, message: ok ? 'แก้ไขแล้ว' : 'ไม่พบรายการ' };
}

function actionDeleteSurvey({ id, _user }) {
  const sh   = getSheet(CONFIG.SHEETS.SURVEY);
  const rows = sheetToObjects(sh);
  const old  = rows.find(r => r.id === id);
  if (!old) return { ok: false, message: 'ไม่พบรายการ' };

  const role = _user.role;
  if (role !== 'admin' && !getPagePermissions(role).includes('delete')) {
    return { ok: false, message: 'ไม่มีสิทธิ์ลบ' };
  }
  if ((role === 'leader' || role === 'inspector') && !userCanAccessProject(_user, old.project)) {
    return { ok: false, message: 'ไม่มีสิทธิ์ลบรายการของโครงการนี้' };
  }

  const ok = deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

function exportSurveyExcelToDrive(project) {
  try {
    const sh   = getSheet(CONFIG.SHEETS.SURVEY);
    const rows = sheetToObjects(sh);
    const list = project ? rows.filter(r => r.project === project) : rows;
    if (!list.length) return;

    const tmpSS = SpreadsheetApp.create(`Survey_${project || 'All'}_tmp`);
    const tmpSh = tmpSS.getActiveSheet();
    const cols  = ['project','system','location','sublocation','equipment','brand','model',
                   'serial','inspector','surveyDate','note','createdBy','createdAt'];
    tmpSh.appendRow(cols);
    list.forEach(r => tmpSh.appendRow(cols.map(c => r[c] || '')));

    const ssId  = tmpSS.getId();
    const url   = `https://docs.google.com/spreadsheets/d/${ssId}/export?format=xlsx`;
    const token = ScriptApp.getOAuthToken();
    const resp  = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) { DriveApp.getFileById(ssId).setTrashed(true); return; }

    const safeName = (project || 'All').replace(/[^\w\u0E00-\u0E7F]/g, '_');
    const dateStr  = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd_HHmm');
    const blob     = resp.getBlob().setName(`Survey_${safeName}_${dateStr}.xlsx`);
    const folder   = getFolder([CONFIG.FOLDERS.ONSITE_MASTER, CONFIG.FOLDERS.ONSITE_EXCEL]);

    // ลบไฟล์เก่าของโครงการนี้ก่อน
    const prefix = `Survey_${safeName}_`;
    const files  = folder.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      if (f.getName().startsWith(prefix)) f.setTrashed(true);
    }

    folder.createFile(blob);
    DriveApp.getFileById(ssId).setTrashed(true);
  } catch (err) {
    console.error('exportSurveyExcelToDrive error:', err);
  }
}

/* ================================================================
   PAGE PERMISSIONS
   ================================================================ */
const PERM_HEADERS = ['role','pages'];
const DEFAULT_PAGES = {
  manager:   ['overview','add','records','survey','import','delete','wi','eqdocs','store'],
  leader:    ['overview','add','records','survey','delete','wi','eqdocs','store'],
  inspector: ['add','records','survey','wi','eqdocs','store'],
  observer:  ['records','survey','wi','eqdocs','store']
};
// 'delete' ไม่ใช่หน้าจริง แต่เป็น feature toggle (ปุ่มลบ)
// ที่ admin กำหนดสิทธิ์แยกได้ในตารางเดียวกับ page permission
// 'pm'/'cm' ไม่อยู่ใน DEFAULT_PAGES โดยตั้งใจ → ค่าเริ่มต้นคือ "ซ่อน" สำหรับทุก role
// ที่ไม่ใช่ admin จนกว่า admin จะเข้ามาเปิดเองผ่านหน้า Page Permissions
// 'wi'/'eqdocs'/'store' อยู่ใน DEFAULT_PAGES ของทุก role โดยตั้งใจ (ตรงข้ามกับ pm/cm) เพื่อคง
// พฤติกรรมเดิมไว้ก่อน (ทุกคนเห็นได้) — admin ปิดเป็นรายตำแหน่งทีหลังได้ผ่านหน้า Page Permissions เช่นกัน
const ALL_PAGES = ['overview','add','records','survey','import','master','users','delete','pm','cm','wi','eqdocs','store'];

function getPagePermissions(role) {
  if (role === 'admin') return ALL_PAGES;
  const sh   = getSheet('PagePerms');
  ensureHeaders(sh, PERM_HEADERS);
  const rows = sheetToObjects(sh);
  const rec  = rows.find(r => r.role === role);
  if (rec && rec.pages) return String(rec.pages).split(',').map(p => p.trim()).filter(Boolean);
  return DEFAULT_PAGES[role] || [];
}

function actionGetPagePerms({ _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin' };
  const sh   = getSheet('PagePerms');
  ensureHeaders(sh, PERM_HEADERS);
  const rows = sheetToObjects(sh);
  const result = {};
  ['manager','leader','inspector','observer'].forEach(role => {
    const rec = rows.find(r => r.role === role);
    result[role] = rec && rec.pages
      ? String(rec.pages).split(',').map(p => p.trim()).filter(Boolean)
      : (DEFAULT_PAGES[role] || []);
  });
  return { ok: true, perms: result, allPages: ALL_PAGES };
}

function actionSetPagePerms({ perms, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin' };
  const sh = getSheet('PagePerms');
  sh.clearContents();
  ensureHeaders(sh, PERM_HEADERS);
  Object.entries(perms).forEach(([role, pages]) => {
    sh.appendRow([role, Array.isArray(pages) ? pages.join(',') : pages]);
  });
  return { ok: true };
}

/* ================================================================
   REPORT TEMPLATES — เลือก Word/PDF template (Drive file ID) จากเว็บ
   ================================================================ */
var REPORT_TEMPLATES_HEADERS = ['id', 'name', 'fileId', 'createdAt'];

function actionListReportTemplates({ _user }) {
  const sh = getSheet('ReportTemplates');
  ensureHeaders(sh, REPORT_TEMPLATES_HEADERS);
  const rows = sheetToObjects(sh);
  return { ok: true, templates: rows };
}

function actionSaveReportTemplate({ name, fileId, _user }) {
  if (_user.role !== 'admin' && _user.role !== 'manager') {
    return { ok: false, message: 'เฉพาะ Admin/Manager เท่านั้น' };
  }
  name = String(name || '').trim();
  fileId = String(fileId || '').trim();
  if (!name || !fileId) return { ok: false, message: 'ต้องกรอกชื่อและ File ID' };
  // กันซ้ำ: ตรวจสอบว่ามีไฟล์นี้อยู่จริงและเข้าถึงได้
  try { DriveApp.getFileById(fileId).getName(); }
  catch (e) { return { ok: false, message: 'ไม่พบไฟล์ หรือไม่มีสิทธิ์เข้าถึง File ID นี้' }; }

  const sh = getSheet('ReportTemplates');
  ensureHeaders(sh, REPORT_TEMPLATES_HEADERS);
  const rows = sheetToObjects(sh);
  if (rows.some(r => r.fileId === fileId)) return { ok: false, message: 'Template นี้มีอยู่แล้ว' };
  appendRow(sh, REPORT_TEMPLATES_HEADERS, {
    id: genId(), name, fileId, createdAt: new Date().toISOString()
  });
  return { ok: true };
}

function actionDeleteReportTemplate({ id, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  const sh = getSheet('ReportTemplates');
  const ok = deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

/* ================================================================
   REPORT FIELD PRESETS — จำค่าที่เคยกรอกไว้ (autocomplete)
   ================================================================ */
var REPORT_PRESETS_HEADERS = ['field', 'value', 'lastUsedAt'];

function actionListReportPresets({ _user }) {
  const sh = getSheet('ReportPresets');
  ensureHeaders(sh, REPORT_PRESETS_HEADERS);
  const rows = sheetToObjects(sh);
  const byField = {};
  rows.forEach(r => {
    if (!r.field || !r.value) return;
    if (!byField[r.field]) byField[r.field] = [];
    if (!byField[r.field].includes(r.value)) byField[r.field].push(r.value);
  });
  return { ok: true, presets: byField };
}

// บันทึกค่าที่กรอกไว้ใช้ autocomplete ครั้งหน้า — เรียกจาก frontend ทุกครั้งที่กด "สร้างรายงาน" สำเร็จ
// fields: { contractName: '...', contractNo: '...', clause: '...', submittedTo: '...', logoCustomer: '...', reportTitle: '...' }
function actionSaveReportPreset({ fields, _user }) {
  if (!fields || typeof fields !== 'object') return { ok: false, message: 'ไม่มีข้อมูล' };
  const sh = getSheet('ReportPresets');
  ensureHeaders(sh, REPORT_PRESETS_HEADERS);
  const rows = sheetToObjects(sh);
  const now = new Date().toISOString();
  Object.keys(fields).forEach(field => {
    const value = String(fields[field] || '').trim();
    if (!value) return;
    const existingRow = findRowByFieldValue_(sh, rows, field, value);
    if (existingRow > 0) {
      sh.getRange(existingRow, REPORT_PRESETS_HEADERS.indexOf('lastUsedAt') + 1).setValue(now);
    } else {
      appendRow(sh, REPORT_PRESETS_HEADERS, { field, value, lastUsedAt: now });
    }
  });
  return { ok: true };
}

// helper: หาแถวที่ field+value ตรงกัน (ไม่ใช้ id เพราะ key คือ field+value คู่กัน)
function findRowByFieldValue_(sh, rows, field, value) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].field === field && rows[i].value === value) return i + 2; // +2: header row + 1-index
  }
  return -1;
}

/* ================================================================
   REPORT INFO — ข้อมูลสัญญาผูกกับชื่อโครงการ (key เดียวต่อโครงการ)
   ต่อสัญญาใหม่ = เขียนทับของเดิม ไม่ใช่สะสมเป็น list เหมือน ReportPresets
   ================================================================ */
const REPORT_INFO_HEADERS = ['project','contractName','contractNo','contractDate','client','clause','submittedTo','logoCustomer','updatedAt'];

// Google Sheets แอบแปลงข้อความที่หน้าตาเหมือนวันที่ (เช่น "25/06/2570") เป็นเซลล์ชนิดวันที่จริงให้เอง
// พอ getValues() อ่านกลับมาจะได้ JS Date object แทน string แล้ว JSON.stringify จะกลายเป็น ISO timestamp ดิบๆ
// ฟังก์ชันนี้แปลง Date ที่หลงเหลือกลับเป็น string dd/MM/yyyy ก่อนส่งออกไปให้ frontend เสมอ
function normalizeDateFields_(rows) {
  return rows.map(r => {
    const out = {};
    Object.keys(r).forEach(k => {
      out[k] = (r[k] instanceof Date) ? Utilities.formatDate(r[k], 'Asia/Bangkok', 'dd/MM/yyyy') : r[k];
    });
    return out;
  });
}

function actionListReportInfo({ _user }) {
  const sh = getSheet('ReportInfo');
  ensureHeaders(sh, REPORT_INFO_HEADERS);
  return { ok: true, info: normalizeDateFields_(sheetToObjects(sh)) };
}

// upsert ตาม project — โครงการเดิมจะถูกเขียนทับทั้งแถว ไม่สะสมของเก่าไว้
function actionSaveReportInfo({ row, _user }) {
  if (!row || !String(row.project || '').trim()) return { ok: false, message: 'ต้องมีชื่อโครงการ' };
  const sh = getSheet('ReportInfo');
  ensureHeaders(sh, REPORT_INFO_HEADERS);
  const data = sh.getDataRange().getValues();
  const hdrs = data[0];
  const pCol = hdrs.indexOf('project');
  row.updatedAt = new Date().toISOString();
  for (let i = 1; i < data.length; i++) {
    if (data[i][pCol] === row.project) {
      hdrs.forEach((h, ci) => { if (row[h] !== undefined) sh.getRange(i + 1, ci + 1).setValue(row[h]); });
      return { ok: true };
    }
  }
  appendRow(sh, REPORT_INFO_HEADERS, row);
  return { ok: true };
}

function actionBulkSaveReportInfo({ rows, _user }) {
  if (!Array.isArray(rows)) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };
  let count = 0;
  rows.forEach(row => {
    if (row && String(row.project || '').trim()) { actionSaveReportInfo({ row, _user }); count++; }
  });
  return { ok: true, count };
}

// คืน URL ของโฟลเดอร์เก็บรูปโลโก้บริษัทลูกค้า (สร้างให้ถ้ายังไม่มี) — ให้ admin อัปโหลดรูปแล้ว Share เป็นลิงก์
// เอาไปใส่ในคอลัมน์ logoCustomer ของ Excel (ต้อง share เป็น "Anyone with link" ถึงจะดึงรูปไปฝัง Word ได้)
function actionGetCustomerLogoFolderUrl({ _user }) {
  const folder = getFolder([CONFIG.FOLDERS.AMR_IMAGES, CONFIG.FOLDERS.CUSTOMER_LOGOS]);
  return { ok: true, url: folder.getUrl() };
}

/* ================================================================
   USER MANAGEMENT
   ✅ FIX #4 — เพิ่ม actionSetUserActive + แก้ actionDeleteUser
   ================================================================ */
// นำเข้าผู้ใช้หลายคนพร้อมกันจาก Excel — username ซ้ำของเดิมจะข้ามไป (ไม่ทับ เพื่อกันรหัสผ่านเดิมหาย)
function actionBulkCreateUsers({ rows, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  if (!Array.isArray(rows)) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };
  const sh = getSheet(CONFIG.SHEETS.USERS);
  ensureHeaders(sh, USER_HEADERS);
  const existing = sheetToObjects(sh).map(r => r.username);
  let created = 0, skipped = 0;
  rows.forEach(r => {
    const username = String(r.username || '').trim();
    const password = String(r.password || '').trim();
    if (!username || !password || existing.includes(username)) { skipped++; return; }
    appendRow(sh, USER_HEADERS, {
      id: genId(), username, password: hashPw(password), plainPwd: password,
      name: r.name || username, role: r.role || 'inspector',
      project: r.project || '', email: r.email || '', active: 'true',
      createdAt: new Date().toISOString()
    });
    existing.push(username);
    created++;
  });
  return { ok: true, created, skipped };
}

function actionCreateUser({ username, password, name, role, project, email, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  if (!username || !password)  return { ok: false, message: 'ต้องมี username และ password' };

  const sh   = getSheet(CONFIG.SHEETS.USERS);
  ensureHeaders(sh, USER_HEADERS);
  const rows = sheetToObjects(sh);
  if (rows.find(r => r.username === username))
    return { ok: false, message: `username "${username}" มีอยู่แล้ว` };

  appendRow(sh, USER_HEADERS, {
    id: genId(), username, password: hashPw(password),
    plainPwd: password,
    name: name || username, role: role || 'inspector',
    project: project || '', email: email || '', active: 'true',
    createdAt: new Date().toISOString()
  });
  return { ok: true };
}

function actionUpdateUser({ username, updates, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  const sh   = getSheet(CONFIG.SHEETS.USERS);
  const data = sh.getDataRange().getValues();
  const hdrs = data[0];
  const uCol = hdrs.indexOf('username');
  for (let i = 1; i < data.length; i++) {
    if (data[i][uCol] === username) {
      hdrs.forEach((h, ci) => {
        if (h === 'password' && updates.password) {
          sh.getRange(i+1, ci+1).setValue(hashPw(updates.password));
        } else if (h === 'plainPwd' && updates.password) {
          sh.getRange(i+1, ci+1).setValue(updates.password);
        } else if (updates[h] !== undefined && h !== 'id' && h !== 'createdAt' && h !== 'username') {
          sh.getRange(i+1, ci+1).setValue(updates[h]);
        }
      });
      return { ok: true };
    }
  }
  return { ok: false, message: 'ไม่พบ username' };
}

// ✅ FIX — เพิ่มฟังก์ชันใหม่ที่หายไปจาก router
function actionSetUserActive({ username, active, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  const sh   = getSheet(CONFIG.SHEETS.USERS);
  const data = sh.getDataRange().getValues();
  const hdrs = data[0];
  const uCol = hdrs.indexOf('username');
  const aCol = hdrs.indexOf('active');
  if (uCol < 0 || aCol < 0) return { ok: false, message: 'ไม่พบคอลัมน์ที่ต้องการ' };
  for (let i = 1; i < data.length; i++) {
    if (data[i][uCol] === username) {
      sh.getRange(i+1, aCol+1).setValue(active ? 'true' : 'false');
      return { ok: true };
    }
  }
  return { ok: false, message: 'ไม่พบ username' };
}

// ✅ FIX — แก้ actionDeleteUser ให้หา by username column ตรง ๆ (ไม่ผ่าน findRowById ที่หา by id)
function actionDeleteUser({ username, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  if (username === 'admin')   return { ok: false, message: 'ไม่สามารถลบ admin หลักได้' };

  const sh   = getSheet(CONFIG.SHEETS.USERS);
  const data = sh.getDataRange().getValues();
  const uCol = data[0].indexOf('username');
  if (uCol < 0) return { ok: false, message: 'ไม่พบคอลัมน์ username' };
  for (let i = 1; i < data.length; i++) {
    if (data[i][uCol] === username) {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, message: 'ไม่พบ username' };
}


function actionListUsers({ _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  const sh   = getSheet(CONFIG.SHEETS.USERS);
  ensureHeaders(sh, USER_HEADERS);
  const rows = sheetToObjects(sh);
  return {
    ok: true,
    users: rows.map(r => ({
      username:  r.username,
      plainPwd:  r.plainPwd,
      name:      r.name,
      role:      r.role,
      project:   r.project,
      email:     r.email || '',
      active:    String(r.active).toLowerCase() !== 'false',
      createdAt: r.createdAt
    }))
  };
}

/* ================================================================
   LOGS
   ================================================================ */
const LOG_HEADERS = ['ts','action','username','device','browser','ip'];

function writeLog(action, username, ctx) {
  try {
    const sh = getSheet(CONFIG.SHEETS.LOGS);
    ensureHeaders(sh, LOG_HEADERS);
    sh.appendRow([
      new Date().toISOString(), action, username,
      ctx.device  || '',
      ctx.browser ? ctx.browser.slice(0,80) : '',
      ctx.ip      || ''
    ]);
  } catch(e) { /* ไม่ให้ log crash งาน */ }
}

function testDocumentAccess() {
  var doc = DocumentApp.openById('1cs3aZNeU-TTJegfyQH9nyY5fVFlNfanBYNXoPCCe028');
  Logger.log('OK: ' + doc.getName());
}

/* ================================================================
   FIX TOOLS — รันจาก GAS Editor เมื่อมีปัญหา
   ================================================================ */

/** รันครั้งเดียวเพื่อ reset Users sheet headers (แก้ปัญหา column shift) */
function fixUsersSheet() {
  const sh = getSheet(CONFIG.SHEETS.USERS);
  const data = sh.getDataRange().getValues();
  if (data.length < 1) { Logger.log('Sheet empty'); return; }

  const currentHeaders = data[0].map(h => String(h).trim());
  Logger.log('Current headers: ' + JSON.stringify(currentHeaders));

  // ถ้ามี plainPwd ใน header → ต้องเอาออก
  if (currentHeaders.includes('plainPwd')) {
    Logger.log('Found plainPwd column - fixing...');
    const pIdx = currentHeaders.indexOf('plainPwd');
    // สร้าง data ใหม่โดยตัด plainPwd column ออก
    const newData = data.map(row => {
      const newRow = [...row];
      newRow.splice(pIdx, 1);
      return newRow;
    });
    sh.clearContents();
    sh.getRange(1, 1, newData.length, newData[0].length).setValues(newData);
    Logger.log('✅ Removed plainPwd column. New headers: ' + JSON.stringify(newData[0]));
  } else {
    Logger.log('✅ Headers OK: ' + JSON.stringify(currentHeaders));
  }
}

/** ทดสอบ login ว่า API ทำงานหรือไม่ */
function testLogin() {
  const result = actionLogin({ username: 'admin', password: 'admin1234' });
  Logger.log('Login test result: ' + JSON.stringify(result));
}

/** ดู Users ที่มีอยู่ทั้งหมด */
function listAllUsers() {
  const sh = getSheet(CONFIG.SHEETS.USERS);
  const data = sh.getDataRange().getValues();
  Logger.log('Headers: ' + JSON.stringify(data[0]));
  Logger.log('Rows: ' + (data.length - 1));
  if (data.length > 1) Logger.log('First user: ' + JSON.stringify(data[1]));
}

/* ================================================================
   SETUP — รันครั้งแรกเพื่อ Init ทุกอย่าง
   ================================================================ */
function setupFolders() {
  const paths = [
    [CONFIG.FOLDERS.AMR_IMAGES,    CONFIG.FOLDERS.AMR_IMG_EQUIP],
    [CONFIG.FOLDERS.AMR_IMAGES,    CONFIG.FOLDERS.AMR_IMG_STICKER],
    [CONFIG.FOLDERS.ONSITE_IMAGES, CONFIG.FOLDERS.ONSITE_IMG_EQUIP],
    [CONFIG.FOLDERS.ONSITE_IMAGES, CONFIG.FOLDERS.ONSITE_IMG_STICK],
    [CONFIG.FOLDERS.ONSITE_MASTER, CONFIG.FOLDERS.ONSITE_EXCEL],
    [CONFIG.FOLDERS.AMR_IMAGES,    CONFIG.FOLDERS.CUSTOMER_LOGOS]
  ];
  paths.forEach(p => getFolder(p));
  Logger.log('✅ สร้าง folder structure ใน Drive เรียบร้อย');
}

function setupSheets() {
  Object.values(CONFIG.SHEETS).forEach(name => getSheet(name));
  Logger.log('✅ สร้าง Sheet tabs เรียบร้อย');
}

function initialize() {
  setupSheets();
  setupFolders();
  Logger.log('✅ AMR Inspection Backend พร้อมใช้งาน');
}
// ฟังก์ชันสร้างหรือดึง Folder ลึกตาม Path
function getOrCreateDynamicFolder(baseFolderName, project, loc, subloc, equip, typeFolder) {
  const rootId = DriveApp.getFolderById(CONFIG.DRIVE_ROOT_ID);
  const base = getOrCreateFolderObj(rootId, baseFolderName);
  const pFolder = getOrCreateFolderObj(base, project || 'ไม่ระบุโครงการ');
  const lFolder = getOrCreateFolderObj(pFolder, loc || 'ไม่ระบุสถานที่');
  const slFolder = getOrCreateFolderObj(lFolder, subloc || 'ไม่ระบุสถานที่ย่อย');
  const eqFolder = getOrCreateFolderObj(slFolder, equip || 'ไม่ระบุอุปกรณ์');
  return getOrCreateFolderObj(eqFolder, typeFolder);
}

function getOrCreateFolderObj(parentFolder, folderName) {
  if (!folderName) return parentFolder;
  const folders = parentFolder.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return parentFolder.createFolder(folderName);
}
function checkFunctions() {
  const required = [
    'login','verifyToken','createRecord','listRecords','deleteRecord',
    'createUser','listUsers','saveMaster','listMaster','getProgress',
    'createSurvey','listSurvey','listTargets','saveTarget',
    'getPdpaStatus','acceptPdpa','bulkCreateUsers','updateUser','deleteUser'
  ];

  // GAS ใช้ globalThis แทน this
  required.forEach(fn => {
    const exists = typeof globalThis[fn] === 'function';
    Logger.log((exists ? '✅' : '❌') + ' ' + fn);
  });
}
function testAllActions() {
  // ทดสอบ login จริงๆ
  const r = actionLogin({ username: 'admin', password: 'admin1234' });
  Logger.log('Login: ' + JSON.stringify(r));

  // ถ้า login ได้ → แสดงว่า GAS backend พร้อมใช้งานจริง
}
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ================================================================
   ASSIGNMENTS
   ================================================================ */
const ASSIGN_HEADERS = [
  'id','project','scopeType','locName','subName','equipment',
  'masterId','missingFields','assignedTo','assignedBy','note',
  'status','createdAt','doneAt','doneData','targetDate'
];

function actionSaveAssignment({ assignment, _user }) {
  if (!assignment || !assignment.id) return { ok: false, message: 'No assignment' };
  const sh = getSheet(CONFIG.SHEETS.ASSIGNMENTS);
  ensureHeaders(sh, ASSIGN_HEADERS);
  // Overwrite if exists, else append
  const data = sh.getDataRange().getValues();
  const hdr = data[0] || [];
  const idCol = hdr.indexOf('id');
  let found = false;
  for (let r = 1; r < data.length; r++) {
    if (data[r][idCol] === assignment.id) {
      ASSIGN_HEADERS.forEach((h, i) => {
        let v = assignment[h];
        if (h === 'missingFields' || h === 'doneData') v = JSON.stringify(v || (h === 'doneData' ? {} : []));
        sh.getRange(r + 1, i + 1).setValue(v == null ? '' : v);
      });
      found = true; break;
    }
  }
  if (!found) {
    const row = ASSIGN_HEADERS.map(h => {
      let v = assignment[h];
      if (h === 'missingFields' || h === 'doneData') v = JSON.stringify(v || (h === 'doneData' ? {} : []));
      return v == null ? '' : v;
    });
    sh.appendRow(row);
  }
  return { ok: true };
}

function actionListAssignments({ _user }) {
  const role = (_user && _user.role) || '';
  const username = (_user && _user.username) || '';
  const userProjs = (_user && _user.project ? _user.project.split(',').map(p => p.trim()).filter(Boolean) : []);
  const sh = getSheet(CONFIG.SHEETS.ASSIGNMENTS);
  ensureHeaders(sh, ASSIGN_HEADERS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, assignments: [] };
  const hdr = data[0];
  const rows = data.slice(1).map(r => {
    const obj = {};
    hdr.forEach((h, i) => {
      let v = r[i];
      if (h === 'missingFields' || h === 'doneData') { try { v = JSON.parse(v || (h === 'doneData' ? '{}' : '[]')); } catch(e) { v = h === 'doneData' ? {} : []; } }
      obj[h] = v;
    });
    return obj;
  }).filter(a => a.id);
  // Filter by role
  if (role === 'admin' || role === 'manager') return { ok: true, assignments: rows };
  if (role === 'leader') return { ok: true, assignments: rows.filter(a => userProjs.includes(a.project) || a.assignedBy === username || a.assignedTo === username) };
  return { ok: true, assignments: rows.filter(a => a.assignedTo === username) };
}

function actionCompleteAssignment({ id, doneData, _user }) {
  if (!id) return { ok: false, message: 'No id' };
  const sh = getSheet(CONFIG.SHEETS.ASSIGNMENTS);
  const data = sh.getDataRange().getValues();
  const hdr = data[0] || [];
  const idCol = hdr.indexOf('id');
  const statusCol = hdr.indexOf('status');
  const doneAtCol = hdr.indexOf('doneAt');
  const doneDataCol = hdr.indexOf('doneData');
  for (let r = 1; r < data.length; r++) {
    if (data[r][idCol] === id) {
      sh.getRange(r + 1, statusCol + 1).setValue('done');
      sh.getRange(r + 1, doneAtCol + 1).setValue(Date.now());
      sh.getRange(r + 1, doneDataCol + 1).setValue(JSON.stringify(doneData || {}));
      return { ok: true };
    }
  }
  return { ok: false, message: 'Not found' };
}

/* ================================================================
   SURVEY ASSIGNMENTS — แยกจาก Assignments (รายการบันทึก)
   ================================================================ */
function actionSaveSurveyAssignment({ assignment, _user }) {
  if (!assignment || !assignment.id) return { ok: false, message: 'No assignment' };
  const sh = getSheet(CONFIG.SHEETS.SURVEY_ASSIGNMENTS);
  ensureHeaders(sh, ASSIGN_HEADERS);
  const data = sh.getDataRange().getValues();
  const hdr = data[0] || [];
  const idCol = hdr.indexOf('id');
  let found = false;
  for (let r = 1; r < data.length; r++) {
    if (data[r][idCol] === assignment.id) {
      ASSIGN_HEADERS.forEach((h, i) => {
        let v = assignment[h];
        if (h === 'missingFields' || h === 'doneData') v = JSON.stringify(v || (h === 'doneData' ? {} : []));
        sh.getRange(r + 1, i + 1).setValue(v == null ? '' : v);
      });
      found = true; break;
    }
  }
  if (!found) {
    const row = ASSIGN_HEADERS.map(h => {
      let v = assignment[h];
      if (h === 'missingFields' || h === 'doneData') v = JSON.stringify(v || (h === 'doneData' ? {} : []));
      return v == null ? '' : v;
    });
    sh.appendRow(row);
  }
  return { ok: true };
}

function actionListSurveyAssignments({ _user }) {
  const role = (_user && _user.role) || '';
  const username = (_user && _user.username) || '';
  const userProjs = (_user && _user.project ? _user.project.split(',').map(p => p.trim()).filter(Boolean) : []);
  const sh = getSheet(CONFIG.SHEETS.SURVEY_ASSIGNMENTS);
  ensureHeaders(sh, ASSIGN_HEADERS);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, assignments: [] };
  const hdr = data[0];
  const rows = data.slice(1).map(r => {
    const obj = {};
    hdr.forEach((h, i) => {
      let v = r[i];
      if (h === 'missingFields' || h === 'doneData') { try { v = JSON.parse(v || (h === 'doneData' ? '{}' : '[]')); } catch(e) { v = h === 'doneData' ? {} : []; } }
      obj[h] = v;
    });
    return obj;
  }).filter(a => a.id);
  if (role === 'admin' || role === 'manager') return { ok: true, assignments: rows };
  if (role === 'leader') return { ok: true, assignments: rows.filter(a => userProjs.includes(a.project) || a.assignedBy === username || a.assignedTo === username) };
  return { ok: true, assignments: rows.filter(a => a.assignedTo === username) };
}

function actionCompleteSurveyAssignment({ id, doneData, _user }) {
  if (!id) return { ok: false, message: 'No id' };
  const sh = getSheet(CONFIG.SHEETS.SURVEY_ASSIGNMENTS);
  const data = sh.getDataRange().getValues();
  const hdr = data[0] || [];
  const idCol = hdr.indexOf('id');
  const statusCol = hdr.indexOf('status');
  const doneAtCol = hdr.indexOf('doneAt');
  const doneDataCol = hdr.indexOf('doneData');
  for (let r = 1; r < data.length; r++) {
    if (data[r][idCol] === id) {
      sh.getRange(r + 1, statusCol + 1).setValue('done');
      sh.getRange(r + 1, doneAtCol + 1).setValue(Date.now());
      sh.getRange(r + 1, doneDataCol + 1).setValue(JSON.stringify(doneData || {}));
      return { ok: true };
    }
  }
  return { ok: false, message: 'Not found' };
}
