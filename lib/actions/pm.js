/* ================================================================
   PREVENTIVE MAINTENANCE (PM) — ported from Code.gs
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, sheetToObjects, ensureHeaders, appendRow, updateRowById, deleteRowById } = require('../sheets');
const { getOrCreateDynamicFolder, getOrCreateFolder, getRootFolder, saveImageToFolder } = require('../drive');
const { userCanAccessProject } = require('../common');
const { genId, safeParseJson } = require('../utils');
const { USER_HEADERS } = require('./auth');
const { sendAssignmentEmail } = require('./notify');
const { CHECKLIST_TEMPLATE_HEADERS } = require('./checklist');

const PM_SCHEDULE_HEADERS = ['id', 'project', 'system', 'locName', 'subName', 'equipment', 'serial', 'intervalDays', 'lastDoneAt', 'nextDueAt', 'checklist', 'templateId', 'active', 'createdBy', 'createdAt'];
const PM_WO_HEADERS = ['id', 'scheduleId', 'project', 'system', 'locName', 'subName', 'equipment', 'serial', 'dueDate', 'status', 'checklistResult', 'note', 'imgMain', 'completedBy', 'completedAt', 'createdAt', 'workerSignatureUrl', 'customerName', 'customerSignatureUrl', 'assignedTo', 'assignedBy', 'assignedAt', 'notifiedAt', 'acknowledgedAt'];
const PM_LEAD_DAYS = 14;

async function actionListPmSchedules({ _user }) {
  const sh = await getSheet(CONFIG.SHEETS.PM_SCHEDULES);
  await ensureHeaders(sh, PM_SCHEDULE_HEADERS);
  let rows = await sheetToObjects(sh);
  if (_user.role === 'leader' || _user.role === 'inspector') {
    rows = rows.filter(r => userCanAccessProject(_user, r.project));
  }
  rows = rows.map(r => ({ ...r, checklist: safeParseJson(r.checklist, []) }));
  return { ok: true, schedules: rows };
}

async function actionSavePmSchedule({ schedule, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้นที่ตั้งตารางบำรุงรักษาได้' };
  if (!schedule || !schedule.project || !schedule.equipment || !schedule.intervalDays)
    return { ok: false, message: 'ต้องมีโครงการ, อุปกรณ์ และรอบบำรุงรักษา' };

  const sh = await getSheet(CONFIG.SHEETS.PM_SCHEDULES);
  await ensureHeaders(sh, PM_SCHEDULE_HEADERS);
  const checklist = JSON.stringify(schedule.checklist || []);

  if (schedule.id) {
    const rows = await sheetToObjects(sh);
    const existing = rows.find(s => s.id === schedule.id);
    if (existing) {
      await updateRowById(sh, PM_SCHEDULE_HEADERS, schedule.id, {
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
  await appendRow(sh, PM_SCHEDULE_HEADERS, {
    id, project: schedule.project, system: schedule.system || '',
    locName: schedule.locName || '', subName: schedule.subName || '',
    equipment: schedule.equipment, serial: schedule.serial || '',
    intervalDays: schedule.intervalDays, lastDoneAt: '', nextDueAt,
    checklist, templateId: schedule.templateId || '', active: 'true',
    createdBy: _user.username, createdAt: new Date().toISOString()
  });
  return { ok: true, action: 'created', id };
}

async function actionDeletePmSchedule({ id, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้น' };
  const sh = await getSheet(CONFIG.SHEETS.PM_SCHEDULES);
  const ok = await deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

async function actionBulkSavePmSchedules({ rows, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้นที่นำเข้าแผน PM ได้' };
  if (!Array.isArray(rows)) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };

  const sh = await getSheet(CONFIG.SHEETS.PM_SCHEDULES);
  await ensureHeaders(sh, PM_SCHEDULE_HEADERS);
  const masterRows = await sheetToObjects(await getSheet(CONFIG.SHEETS.MASTER));
  const tSh = await getSheet(CONFIG.SHEETS.CHECKLIST_TEMPLATES);
  await ensureHeaders(tSh, CHECKLIST_TEMPLATE_HEADERS);
  const templates = await sheetToObjects(tSh);

  let created = 0, skipped = 0;
  for (const r of rows) {
    const project = String(r.project || '').trim();
    const equipment = String(r.equipment || '').trim();
    const intervalDays = Number(r.intervalDays);
    if (!project || !equipment || !intervalDays) { skipped++; continue; }

    const mrow = masterRows.find(m => m.project === project && m.equipment === equipment) || {};
    const tmplName = String(r.templateName || '').trim();
    const tmpl = tmplName ? templates.find(t => t.name === tmplName) : null;
    const nextDueAt = r.nextDueAt || new Date(Date.now() + intervalDays * 86400000).toISOString().slice(0, 10);

    await appendRow(sh, PM_SCHEDULE_HEADERS, {
      id: genId(), project,
      system: mrow.system || '', locName: mrow.locName || '', subName: mrow.subName || '',
      equipment, serial: mrow.serial || '',
      intervalDays, lastDoneAt: '', nextDueAt,
      checklist: JSON.stringify([]), templateId: tmpl ? tmpl.id : '', active: 'true',
      createdBy: _user.username, createdAt: new Date().toISOString()
    });
    created++;
  }
  return { ok: true, created, skipped };
}

async function actionListPmWorkOrders({ _user }) {
  const shS = await getSheet(CONFIG.SHEETS.PM_SCHEDULES);
  await ensureHeaders(shS, PM_SCHEDULE_HEADERS);
  const schedules = (await sheetToObjects(shS)).filter(s => String(s.active).toLowerCase() !== 'false');

  const shW = await getSheet(CONFIG.SHEETS.PM_WORKORDERS);
  await ensureHeaders(shW, PM_WO_HEADERS);
  let workOrders = await sheetToObjects(shW);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const leadCutoff = new Date(today.getTime() + PM_LEAD_DAYS * 86400000);

  for (const s of schedules) {
    if (!s.nextDueAt) continue;
    const due = new Date(s.nextDueAt);
    if (isNaN(due) || due > leadCutoff) continue;
    const hasOpen = workOrders.some(w => w.scheduleId === s.id && w.status === 'pending');
    if (hasOpen) continue;
    const id = genId();
    await appendRow(shW, PM_WO_HEADERS, {
      id, scheduleId: s.id, project: s.project, system: s.system || '',
      locName: s.locName || '', subName: s.subName || '',
      equipment: s.equipment, serial: s.serial || '',
      dueDate: s.nextDueAt, status: 'pending',
      checklistResult: '', note: '', imgMain: '',
      completedBy: '', completedAt: '', createdAt: new Date().toISOString()
    });
    workOrders.push({ id, scheduleId: s.id, project: s.project, dueDate: s.nextDueAt, status: 'pending' });
  }

  if (_user.role === 'leader' || _user.role === 'inspector') {
    workOrders = workOrders.filter(w => userCanAccessProject(_user, w.project));
  }
  workOrders = workOrders.map(w => ({ ...w, checklistResult: safeParseJson(w.checklistResult, []) }));
  return { ok: true, workOrders };
}

async function actionCompletePmWorkOrder({ id, checklistResult, note, image, workerSignature, customerSignature, customerName, _user }) {
  if (_user.role === 'observer') return { ok: false, message: 'ไม่มีสิทธิ์บันทึกผล' };
  if (!id) return { ok: false, message: 'ไม่พบใบงาน' };

  const shW = await getSheet(CONFIG.SHEETS.PM_WORKORDERS);
  await ensureHeaders(shW, PM_WO_HEADERS);
  const rows = await sheetToObjects(shW);
  const wo = rows.find(w => w.id === id);
  if (!wo) return { ok: false, message: 'ไม่พบใบงาน' };

  const safeEquip = String(wo.equipment || 'img').replace(/[/\\:*?"<>|]/g, '_');
  let imgUrl = '';
  if (image) {
    const folder = await getOrCreateDynamicFolder('AMR Inspection Images', wo.project, wo.locName, wo.subName, wo.equipment, 'PM Photos');
    imgUrl = await saveImageToFolder(image, `PM_${safeEquip}_${Date.now()}.jpg`, folder);
  }
  let workerSigUrl = wo.workerSignatureUrl || '';
  let customerSigUrl = wo.customerSignatureUrl || '';
  if (workerSignature || customerSignature) {
    const sigFolder = await getOrCreateFolder(getRootFolder(), 'PM Signatures');
    if (workerSignature) workerSigUrl = await saveImageToFolder(workerSignature, `PM_${safeEquip}_worker_${Date.now()}.png`, sigFolder);
    if (customerSignature) customerSigUrl = await saveImageToFolder(customerSignature, `PM_${safeEquip}_customer_${Date.now()}.png`, sigFolder);
  }

  const nowIso = new Date().toISOString();
  await updateRowById(shW, PM_WO_HEADERS, id, {
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

  if (wo.scheduleId) {
    const shS = await getSheet(CONFIG.SHEETS.PM_SCHEDULES);
    await ensureHeaders(shS, PM_SCHEDULE_HEADERS);
    const schedules = await sheetToObjects(shS);
    const sc = schedules.find(s => s.id === wo.scheduleId);
    if (sc) {
      const interval = Number(sc.intervalDays) || 90;
      const nextDueAt = new Date(Date.now() + interval * 86400000).toISOString().slice(0, 10);
      await updateRowById(shS, PM_SCHEDULE_HEADERS, sc.id, { ...sc, lastDoneAt: nowIso.slice(0, 10), nextDueAt });
    }
  }
  return { ok: true };
}

async function actionAssignPmWorkOrder({ id, assignedTo, _user }) {
  if (!['admin', 'manager', 'leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์มอบหมายงาน' };
  if (!id) return { ok: false, message: 'ไม่พบใบงาน' };

  const shW = await getSheet(CONFIG.SHEETS.PM_WORKORDERS);
  await ensureHeaders(shW, PM_WO_HEADERS);
  const rows = await sheetToObjects(shW);
  const wo = rows.find(w => w.id === id);
  if (!wo) return { ok: false, message: 'ไม่พบใบงาน' };

  if (_user.role === 'leader' && !userCanAccessProject(_user, wo.project))
    return { ok: false, message: 'ไม่มีสิทธิ์มอบหมายงานในโครงการนี้' };

  const newAssignedTo = assignedTo || '';
  const isReassign = newAssignedTo && newAssignedTo !== wo.assignedTo;
  let notified = false;
  if (isReassign) {
    notified = await sendAssignmentEmail(newAssignedTo, 'บำรุงรักษาเชิงป้องกัน (PM)', {
      project: wo.project, equipment: wo.equipment, locName: wo.locName,
      extra: wo.dueDate ? `กำหนดบำรุงรักษา: ${wo.dueDate}` : ''
    }, _user.username);
  }

  await updateRowById(shW, PM_WO_HEADERS, id, {
    ...wo,
    assignedTo: newAssignedTo,
    assignedBy: _user.username,
    assignedAt: new Date().toISOString(),
    notifiedAt: isReassign ? new Date().toISOString() : (wo.notifiedAt || ''),
    acknowledgedAt: isReassign ? '' : (wo.acknowledgedAt || '')
  });
  return { ok: true, notified };
}

async function actionAcknowledgePmWorkOrder({ id, _user }) {
  const shW = await getSheet(CONFIG.SHEETS.PM_WORKORDERS);
  await ensureHeaders(shW, PM_WO_HEADERS);
  const rows = await sheetToObjects(shW);
  const wo = rows.find(w => w.id === id);
  if (!wo) return { ok: false, message: 'ไม่พบใบงาน' };
  if (wo.assignedTo !== _user.username) return { ok: false, message: 'รับทราบได้เฉพาะงานที่มอบหมายให้ตัวเองเท่านั้น' };
  await updateRowById(shW, PM_WO_HEADERS, id, { ...wo, acknowledgedAt: new Date().toISOString() });
  return { ok: true };
}

async function actionListUserRoster({ _user }) {
  if (!['admin', 'manager', 'leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์' };
  const sh = await getSheet(CONFIG.SHEETS.USERS);
  await ensureHeaders(sh, USER_HEADERS);
  let rows = (await sheetToObjects(sh)).filter(r => String(r.active).toLowerCase() !== 'false');
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

module.exports = {
  PM_SCHEDULE_HEADERS, PM_WO_HEADERS, safeParseJson,
  actionListPmSchedules, actionSavePmSchedule, actionDeletePmSchedule, actionBulkSavePmSchedules,
  actionListPmWorkOrders, actionCompletePmWorkOrder, actionAssignPmWorkOrder, actionAcknowledgePmWorkOrder,
  actionListUserRoster
};
