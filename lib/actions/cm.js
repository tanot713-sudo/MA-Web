/* ================================================================
   CORRECTIVE MAINTENANCE (CM) — ported from Code.gs
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, sheetToObjects, ensureHeaders, appendRow, updateRowById } = require('../sheets');
const { getOrCreateDynamicFolder, getOrCreateFolder, getRootFolder, saveImageToFolder } = require('../drive');
const { userCanAccessProject } = require('../common');
const { genId, safeParseJson } = require('../utils');
const { sendAssignmentEmail } = require('./notify');

const CM_HEADERS = [
  'id', 'project', 'system', 'locName', 'subName', 'equipment', 'serial',
  'priority', 'problemDescription', 'status',
  'reportedBy', 'reportedAt', 'assignedTo', 'assignedBy', 'assignedAt',
  'causeOfFailure', 'actionTaken', 'downtimeMinutes', 'note', 'partsUsed', 'removedParts',
  'imgBefore', 'imgAfter', 'completedBy', 'completedAt',
  'workerSignatureUrl', 'customerName', 'customerSignatureUrl', 'createdAt',
  'notifiedAt', 'acknowledgedAt'
];

async function actionListCmTickets({ _user }) {
  const sh = await getSheet(CONFIG.SHEETS.CM_TICKETS);
  await ensureHeaders(sh, CM_HEADERS);
  let rows = (await sheetToObjects(sh)).filter(t => t.id);
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

async function actionReportCmTicket({ ticket, image, _user }) {
  if (_user.role === 'observer') return { ok: false, message: 'ไม่มีสิทธิ์แจ้งซ่อม' };
  if (!ticket || !ticket.project || !ticket.equipment || !ticket.problemDescription)
    return { ok: false, message: 'ต้องมีโครงการ, อุปกรณ์ และรายละเอียดปัญหา' };
  if ((_user.role === 'leader' || _user.role === 'inspector') && !userCanAccessProject(_user, ticket.project))
    return { ok: false, message: 'ไม่มีสิทธิ์แจ้งซ่อมโครงการนี้' };

  const sh = await getSheet(CONFIG.SHEETS.CM_TICKETS);
  await ensureHeaders(sh, CM_HEADERS);

  let imgUrl = '';
  if (image) {
    const safeEquip = String(ticket.equipment || 'img').replace(/[/\\:*?"<>|]/g, '_');
    const folder = await getOrCreateDynamicFolder('AMR Inspection Images', ticket.project, ticket.locName, ticket.subName, ticket.equipment, 'CM Photos');
    imgUrl = await saveImageToFolder(image, `CM_${safeEquip}_report_${Date.now()}.jpg`, folder);
  }

  const id = genId();
  await appendRow(sh, CM_HEADERS, {
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

async function actionAssignCmTicket({ id, assignedTo, _user }) {
  if (!['admin', 'manager', 'leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์มอบหมายงาน' };
  if (!id) return { ok: false, message: 'ไม่พบใบแจ้งซ่อม' };

  const sh = await getSheet(CONFIG.SHEETS.CM_TICKETS);
  await ensureHeaders(sh, CM_HEADERS);
  const rows = await sheetToObjects(sh);
  const t = rows.find(x => x.id === id);
  if (!t) return { ok: false, message: 'ไม่พบใบแจ้งซ่อม' };
  if (_user.role === 'leader' && !userCanAccessProject(_user, t.project))
    return { ok: false, message: 'ไม่มีสิทธิ์มอบหมายงานในโครงการนี้' };

  const newAssignedTo = assignedTo || '';
  const isReassign = newAssignedTo && newAssignedTo !== t.assignedTo;
  let notified = false;
  if (isReassign) {
    notified = await sendAssignmentEmail(newAssignedTo, 'ซ่อมบำรุงเชิงแก้ไข (CM)', {
      project: t.project, equipment: t.equipment, locName: t.locName,
      extra: t.problemDescription ? `ปัญหา: ${t.problemDescription}` : ''
    }, _user.username);
  }

  await updateRowById(sh, CM_HEADERS, id, {
    ...t,
    assignedTo: newAssignedTo, assignedBy: _user.username, assignedAt: new Date().toISOString(),
    status: t.status === 'pending' && newAssignedTo ? 'in_progress' : t.status,
    notifiedAt: isReassign ? new Date().toISOString() : (t.notifiedAt || ''),
    acknowledgedAt: isReassign ? '' : (t.acknowledgedAt || '')
  });
  return { ok: true, notified };
}

async function actionAcknowledgeCmTicket({ id, _user }) {
  const sh = await getSheet(CONFIG.SHEETS.CM_TICKETS);
  await ensureHeaders(sh, CM_HEADERS);
  const rows = await sheetToObjects(sh);
  const t = rows.find(x => x.id === id);
  if (!t) return { ok: false, message: 'ไม่พบใบแจ้งซ่อม' };
  if (t.assignedTo !== _user.username) return { ok: false, message: 'รับทราบได้เฉพาะงานที่มอบหมายให้ตัวเองเท่านั้น' };
  await updateRowById(sh, CM_HEADERS, id, { ...t, acknowledgedAt: new Date().toISOString() });
  return { ok: true };
}

async function actionCompleteCmTicket({
  id, causeOfFailure, actionTaken, downtimeMinutes, note, partsUsed, removedParts,
  imageBefore, imageAfter, workerSignature, customerSignature, customerName, _user
}) {
  if (_user.role === 'observer') return { ok: false, message: 'ไม่มีสิทธิ์บันทึกผล' };
  if (!id) return { ok: false, message: 'ไม่พบใบแจ้งซ่อม' };

  const sh = await getSheet(CONFIG.SHEETS.CM_TICKETS);
  await ensureHeaders(sh, CM_HEADERS);
  const rows = await sheetToObjects(sh);
  const t = rows.find(x => x.id === id);
  if (!t) return { ok: false, message: 'ไม่พบใบแจ้งซ่อม' };

  const safeEquip = String(t.equipment || 'img').replace(/[/\\:*?"<>|]/g, '_');
  let imgBeforeUrl = t.imgBefore || '';
  let imgAfterUrl = t.imgAfter || '';
  if (imageBefore) {
    const folder = await getOrCreateDynamicFolder('AMR Inspection Images', t.project, t.locName, t.subName, t.equipment, 'CM Photos');
    imgBeforeUrl = await saveImageToFolder(imageBefore, `CM_${safeEquip}_before_${Date.now()}.jpg`, folder);
  }
  if (imageAfter) {
    const folder = await getOrCreateDynamicFolder('AMR Inspection Images', t.project, t.locName, t.subName, t.equipment, 'CM Photos');
    imgAfterUrl = await saveImageToFolder(imageAfter, `CM_${safeEquip}_after_${Date.now()}.jpg`, folder);
  }
  let workerSigUrl = t.workerSignatureUrl || '';
  let customerSigUrl = t.customerSignatureUrl || '';
  if (workerSignature || customerSignature) {
    const sigFolder = await getOrCreateFolder(getRootFolder(), 'CM Signatures');
    if (workerSignature) workerSigUrl = await saveImageToFolder(workerSignature, `CM_${safeEquip}_worker_${Date.now()}.png`, sigFolder);
    if (customerSignature) customerSigUrl = await saveImageToFolder(customerSignature, `CM_${safeEquip}_customer_${Date.now()}.png`, sigFolder);
  }

  await updateRowById(sh, CM_HEADERS, id, {
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

module.exports = {
  CM_HEADERS, actionListCmTickets, actionReportCmTicket, actionAssignCmTicket,
  actionAcknowledgeCmTicket, actionCompleteCmTicket
};
