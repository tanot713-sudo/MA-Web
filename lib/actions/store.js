/* ================================================================
   STORE CONTROL (คลังอะไหล่) — ported from Code.gs
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, sheetToObjects, ensureHeaders, appendRow, updateRowById, deleteRowById } = require('../sheets');
const { userCanAccessProject } = require('../common');
const { genId } = require('../utils');

const STORE_PART_HEADERS = ['id', 'partNo', 'partName', 'unit', 'minStock', 'note', 'active', 'createdBy', 'createdAt'];
const STORE_TX_HEADERS = [
  'id', 'partId', 'partNo', 'partName', 'project', 'toProject', 'moveRefId',
  'type', 'qty', 'reason', 'status',
  'requestedBy', 'requestedAt', 'approvedBy', 'approvedAt', 'rejectReason',
  'refWorkOrderId', 'createdAt'
];
const STORE_TX_IN_TYPES = ['return', 'add', 'move_in'];

async function getStoreStockMap() {
  const sh = await getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  await ensureHeaders(sh, STORE_TX_HEADERS);
  const rows = (await sheetToObjects(sh)).filter(t => t.id && t.status === 'approved');
  const map = {};
  rows.forEach(t => {
    const key = t.project + '||' + t.partId;
    const delta = STORE_TX_IN_TYPES.includes(t.type) ? Number(t.qty) : -Number(t.qty);
    map[key] = (map[key] || 0) + delta;
  });
  return map;
}

function getVisibleProjectsForUser(_user) {
  if (_user.role === 'admin' || _user.role === 'manager') return null;
  return (_user.project || '').split(',').map(p => p.trim()).filter(Boolean);
}

async function actionListStoreParts({ project, _user }) {
  const sh = await getSheet(CONFIG.SHEETS.STORE_PARTS);
  await ensureHeaders(sh, STORE_PART_HEADERS);
  const parts = (await sheetToObjects(sh)).filter(p => p.id);
  const stockMap = await getStoreStockMap();
  const visibleProjs = getVisibleProjectsForUser(_user);

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

async function actionSaveStorePart({ part, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้นที่จัดการรายการอะไหล่ได้' };
  if (!part || !part.partName || !part.unit)
    return { ok: false, message: 'ต้องมีชื่ออะไหล่ และหน่วยนับ' };

  const sh = await getSheet(CONFIG.SHEETS.STORE_PARTS);
  await ensureHeaders(sh, STORE_PART_HEADERS);

  if (part.id) {
    const rows = await sheetToObjects(sh);
    const existing = rows.find(p => p.id === part.id);
    if (existing) {
      await updateRowById(sh, STORE_PART_HEADERS, part.id, {
        ...existing,
        partNo: part.partNo || '', partName: part.partName,
        unit: part.unit, minStock: part.minStock || 0, note: part.note || '',
        active: part.active !== undefined ? String(part.active) : existing.active
      });
      return { ok: true, action: 'updated' };
    }
  }

  const id = genId();
  await appendRow(sh, STORE_PART_HEADERS, {
    id, partNo: part.partNo || '', partName: part.partName,
    unit: part.unit, minStock: part.minStock || 0, note: part.note || '', active: 'true',
    createdBy: _user.username, createdAt: new Date().toISOString()
  });
  return { ok: true, action: 'created', id };
}

async function actionDeleteStorePart({ id, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้น' };
  const sh = await getSheet(CONFIG.SHEETS.STORE_PARTS);
  const ok = await deleteRowById(sh, id);
  return { ok, message: ok ? 'ลบแล้ว' : 'ไม่พบรายการ' };
}

async function actionListStoreTransactions({ _user }) {
  const sh = await getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  await ensureHeaders(sh, STORE_TX_HEADERS);
  let rows = (await sheetToObjects(sh)).filter(t => t.id);
  const role = _user.role, uname = _user.username;
  if (role === 'leader') {
    rows = rows.filter(t => userCanAccessProject(_user, t.project) || t.requestedBy === uname);
  } else if (!['admin', 'manager'].includes(role)) {
    rows = rows.filter(t => t.requestedBy === uname);
  }
  return { ok: true, transactions: rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) };
}

async function findStorePart(id) {
  const sh = await getSheet(CONFIG.SHEETS.STORE_PARTS);
  await ensureHeaders(sh, STORE_PART_HEADERS);
  return (await sheetToObjects(sh)).find(p => p.id === id);
}

async function actionRequestStoreWithdraw({ partId, project, qty, reason, refWorkOrderId, _user }) {
  if (_user.role === 'observer') return { ok: false, message: 'ไม่มีสิทธิ์เบิกอะไหล่' };
  const part = await findStorePart(partId);
  if (!part) return { ok: false, message: 'ไม่พบรายการอะไหล่' };
  if (!project) return { ok: false, message: 'ต้องระบุโครงการ' };
  const q = Number(qty);
  if (!q || q <= 0) return { ok: false, message: 'ระบุจำนวนที่ต้องการเบิก' };
  if ((_user.role === 'leader' || _user.role === 'inspector') && !userCanAccessProject(_user, project))
    return { ok: false, message: 'ไม่มีสิทธิ์เบิกอะไหล่โครงการนี้' };

  const stockMap = await getStoreStockMap();
  const available = stockMap[project + '||' + part.id] || 0;
  if (q > available) return { ok: false, message: `สต็อกคงเหลือไม่พอ (เหลือ ${available} ${part.unit})` };

  const sh = await getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  await ensureHeaders(sh, STORE_TX_HEADERS);
  const id = genId();
  await appendRow(sh, STORE_TX_HEADERS, {
    id, partId: part.id, partNo: part.partNo || '', partName: part.partName,
    project, toProject: '', moveRefId: '',
    type: 'withdraw', qty: q, reason: reason || '', status: 'pending',
    requestedBy: _user.username, requestedAt: new Date().toISOString(),
    approvedBy: '', approvedAt: '', rejectReason: '',
    refWorkOrderId: refWorkOrderId || '', createdAt: new Date().toISOString()
  });
  return { ok: true, id };
}

async function actionRequestStoreReturn({ partId, project, qty, reason, refWorkOrderId, _user }) {
  if (_user.role === 'observer') return { ok: false, message: 'ไม่มีสิทธิ์คืนอะไหล่' };
  const part = await findStorePart(partId);
  if (!part) return { ok: false, message: 'ไม่พบรายการอะไหล่' };
  if (!project) return { ok: false, message: 'ต้องระบุโครงการ' };
  const q = Number(qty);
  if (!q || q <= 0) return { ok: false, message: 'ระบุจำนวนที่ต้องการคืน' };
  if ((_user.role === 'leader' || _user.role === 'inspector') && !userCanAccessProject(_user, project))
    return { ok: false, message: 'ไม่มีสิทธิ์คืนอะไหล่โครงการนี้' };

  const sh = await getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  await ensureHeaders(sh, STORE_TX_HEADERS);
  const id = genId();
  await appendRow(sh, STORE_TX_HEADERS, {
    id, partId: part.id, partNo: part.partNo || '', partName: part.partName,
    project, toProject: '', moveRefId: '',
    type: 'return', qty: q, reason: reason || '', status: 'pending',
    requestedBy: _user.username, requestedAt: new Date().toISOString(),
    approvedBy: '', approvedAt: '', rejectReason: '',
    refWorkOrderId: refWorkOrderId || '', createdAt: new Date().toISOString()
  });
  return { ok: true, id };
}

async function actionApproveStoreTx({ id, _user }) {
  if (!['admin', 'manager', 'leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์อนุมัติ' };
  const sh = await getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  await ensureHeaders(sh, STORE_TX_HEADERS);
  const rows = await sheetToObjects(sh);
  const tx = rows.find(t => t.id === id);
  if (!tx) return { ok: false, message: 'ไม่พบรายการ' };
  if (tx.status !== 'pending') return { ok: false, message: 'รายการนี้ถูกดำเนินการไปแล้ว' };
  if (_user.role === 'leader' && !userCanAccessProject(_user, tx.project))
    return { ok: false, message: 'ไม่มีสิทธิ์อนุมัติรายการโครงการนี้' };

  if (tx.type === 'withdraw') {
    const stockMap = await getStoreStockMap();
    const available = stockMap[tx.project + '||' + tx.partId] || 0;
    if (Number(tx.qty) > available)
      return { ok: false, message: `สต็อกคงเหลือไม่พอในตอนนี้ (เหลือ ${available}) กรุณาปฏิเสธหรือรอเติมสต็อก` };
  }

  await updateRowById(sh, STORE_TX_HEADERS, id, {
    ...tx, status: 'approved', approvedBy: _user.username, approvedAt: new Date().toISOString()
  });
  return { ok: true };
}

async function actionRejectStoreTx({ id, rejectReason, _user }) {
  if (!['admin', 'manager', 'leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์' };
  const sh = await getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  await ensureHeaders(sh, STORE_TX_HEADERS);
  const rows = await sheetToObjects(sh);
  const tx = rows.find(t => t.id === id);
  if (!tx) return { ok: false, message: 'ไม่พบรายการ' };
  if (tx.status !== 'pending') return { ok: false, message: 'รายการนี้ถูกดำเนินการไปแล้ว' };
  if (_user.role === 'leader' && !userCanAccessProject(_user, tx.project))
    return { ok: false, message: 'ไม่มีสิทธิ์ปฏิเสธรายการโครงการนี้' };

  await updateRowById(sh, STORE_TX_HEADERS, id, {
    ...tx, status: 'rejected', approvedBy: _user.username, approvedAt: new Date().toISOString(),
    rejectReason: rejectReason || ''
  });
  return { ok: true };
}

async function actionAdjustStoreStock({ mode, partId, project, qty, toProject, reason, _user }) {
  if (!['admin', 'manager'].includes(_user.role))
    return { ok: false, message: 'เฉพาะ admin/manager เท่านั้นที่ปรับสต็อกโดยตรงได้' };
  const part = await findStorePart(partId);
  if (!part) return { ok: false, message: 'ไม่พบรายการอะไหล่' };
  if (!project) return { ok: false, message: 'ต้องระบุโครงการ' };
  const q = Number(qty);
  if (!q || q <= 0) return { ok: false, message: 'ระบุจำนวนให้ถูกต้อง' };

  const sh = await getSheet(CONFIG.SHEETS.STORE_TRANSACTIONS);
  await ensureHeaders(sh, STORE_TX_HEADERS);
  const now = new Date().toISOString();

  async function makeTx(type, proj, extra) {
    const id = genId();
    await appendRow(sh, STORE_TX_HEADERS, {
      id, partId: part.id, partNo: part.partNo || '', partName: part.partName,
      project: proj, toProject: extra.toProject || '', moveRefId: extra.moveRefId || '',
      type, qty: q, reason: reason || '', status: 'approved',
      requestedBy: _user.username, requestedAt: now, approvedBy: _user.username, approvedAt: now,
      rejectReason: '', refWorkOrderId: '', createdAt: now
    });
    return id;
  }

  if (mode === 'add') {
    await makeTx('add', project, {});
    return { ok: true };
  }
  if (mode === 'remove') {
    const stockMap = await getStoreStockMap();
    const available = stockMap[project + '||' + part.id] || 0;
    if (q > available) return { ok: false, message: `สต็อกคงเหลือไม่พอ (เหลือ ${available} ${part.unit})` };
    await makeTx('remove', project, {});
    return { ok: true };
  }
  if (mode === 'move') {
    if (!toProject || toProject === project) return { ok: false, message: 'ต้องระบุโครงการปลายทางที่ต่างจากต้นทาง' };
    const stockMap = await getStoreStockMap();
    const available = stockMap[project + '||' + part.id] || 0;
    if (q > available) return { ok: false, message: `สต็อกคงเหลือไม่พอ (เหลือ ${available} ${part.unit})` };
    const outId = await makeTx('move_out', project, { toProject });
    await makeTx('move_in', toProject, { toProject: project, moveRefId: outId });
    return { ok: true };
  }
  return { ok: false, message: 'ไม่รู้จักประเภทการปรับสต็อก' };
}

module.exports = {
  STORE_PART_HEADERS, STORE_TX_HEADERS, getStoreStockMap, getVisibleProjectsForUser,
  actionListStoreParts, actionSaveStorePart, actionDeleteStorePart, actionListStoreTransactions,
  actionRequestStoreWithdraw, actionRequestStoreReturn, actionApproveStoreTx, actionRejectStoreTx,
  actionAdjustStoreStock
};
