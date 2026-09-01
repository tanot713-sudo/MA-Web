/* Smoke test: exercises the ported route()/action functions against the
   in-memory mock Sheets/Drive API (test/mockGoogleapis.js) — no real
   Google credentials needed. Verifies the *logic* survived the port
   (Apps Script sync -> Node async, SpreadsheetApp/DriveApp -> API calls),
   not the real Sheets/Drive integration itself (that needs the user's own
   service account + a real Sheet/Drive folder, tested after deployment). */
const assert = require('node:assert/strict');
const { test } = require('node:test');

// Inject the mock BEFORE anything requires 'googleapis'
const mock = require('./mockGoogleapis');
const path = require.resolve('googleapis');
require.cache[path] = { id: path, filename: path, loaded: true, exports: { google: mock.google } };

process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: 'test@test', private_key: 'x' });

const { route } = require('../lib/route');

let adminUser, token;

test('login creates a default admin on first use and returns a token', async () => {
  const r = await route('login', { username: 'admin', password: 'admin1234' });
  assert.equal(r.ok, true);
  assert.equal(r.user.role, 'admin');
  assert.ok(r.token);
  token = r.token;
  adminUser = r.user;
});

test('login rejects wrong password with a specific code', async () => {
  const r = await route('login', { username: 'admin', password: 'wrong' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'WRONG_PASSWORD');
});

test('verifyToken accepts the issued token', async () => {
  const { verifyToken } = require('../lib/actions/auth');
  const r = await verifyToken(token);
  assert.equal(r.ok, true);
  assert.equal(r.user.username, 'admin');
});

test('createUser + listUsers + login as the new user', async () => {
  const _user = { username: 'admin', role: 'admin' };
  const r = await route('createUser', { username: 'inspector1', password: 'pw123', name: 'สมชาย ใจดี', role: 'inspector', project: 'Network', email: '', _user });
  assert.equal(r.ok, true);

  const list = await route('listUsers', { _user });
  assert.equal(list.ok, true);
  assert.ok(list.users.find(u => u.username === 'inspector1'));

  const loginR = await route('login', { username: 'inspector1', password: 'pw123' });
  assert.equal(loginR.ok, true);
  assert.equal(loginR.user.role, 'inspector');
});

test('saveMaster (batch) + listMaster + getProgress', async () => {
  const _user = { username: 'admin', role: 'admin' };
  const r = await route('saveMaster', {
    master: [
      { id: 'm1', project: 'Network', system: 'ไฟฟ้า', equipment: 'หม้อแปลง A', serial: 'SN1' },
      { id: 'm2', project: 'Network', system: 'ไฟฟ้า', equipment: 'หม้อแปลง B', serial: 'SN2' }
    ], _user
  });
  assert.equal(r.ok, true);
  assert.equal(r.count, 2);

  const list = await route('listMaster', { _user });
  assert.equal(list.master.length, 2);

  const progress = await route('getProgress', { _user });
  assert.equal(progress.ok, true);
  const netProg = progress.progress.find(p => p.project === 'Network');
  assert.equal(netProg.total, 2);
  assert.equal(netProg.done, 0);
});

test('createRecord + listRecords + deleteRecord round-trip', async () => {
  const _user = { username: 'admin', role: 'admin' };
  const created = await route('createRecord', {
    record: { id: 'r1', project: 'Network', equipment: 'หม้อแปลง A', serial: 'SN1', system: 'ไฟฟ้า' },
    images: {}, _user
  });
  assert.equal(created.ok, true);

  const list = await route('listRecords', { _user });
  assert.equal(list.records.length, 1);
  assert.equal(list.records[0].equipment, 'หม้อแปลง A');

  const del = await route('deleteRecord', { id: 'r1', _user });
  assert.equal(del.ok, true);
  const list2 = await route('listRecords', { _user });
  assert.equal(list2.records.length, 0);
});

test('PM: schedule -> work order auto-generation -> assign -> acknowledge -> complete', async () => {
  const admin = { username: 'admin', role: 'admin' };
  const sched = await route('savePmSchedule', {
    schedule: { project: 'Network', equipment: 'หม้อแปลง A', intervalDays: 90, nextDueAt: new Date().toISOString().slice(0, 10) },
    _user: admin
  });
  assert.equal(sched.ok, true);

  const wos = await route('listPmWorkOrders', { _user: admin });
  assert.equal(wos.ok, true);
  assert.equal(wos.workOrders.length, 1);
  const woId = wos.workOrders[0].id;

  const assignR = await route('assignPmWorkOrder', { id: woId, assignedTo: 'inspector1', _user: admin });
  assert.equal(assignR.ok, true);

  const inspector = { username: 'inspector1', role: 'inspector', project: 'Network' };
  const ackR = await route('acknowledgePmWorkOrder', { id: woId, _user: inspector });
  assert.equal(ackR.ok, true);

  const completeR = await route('completePmWorkOrder', {
    id: woId, checklistResult: [{ item: 'check oil', ok: true }], note: 'done', _user: inspector
  });
  assert.equal(completeR.ok, true);

  const wos2 = await route('listPmWorkOrders', { _user: admin });
  const done = wos2.workOrders.find(w => w.id === woId);
  assert.equal(done.status, 'done');
});

test('Store Control: add stock (admin) -> withdraw (inspector) -> approve (admin) -> stock reflects', async () => {
  const admin = { username: 'admin', role: 'admin' };
  const inspector = { username: 'inspector1', role: 'inspector', project: 'Network' };

  const part = await route('saveStorePart', { part: { partName: 'ตลับลูกปืน 6205', unit: 'ชิ้น' }, _user: admin });
  assert.equal(part.ok, true);
  const partId = part.id;

  const add = await route('adjustStoreStock', { mode: 'add', partId, project: 'Network', qty: 10, _user: admin });
  assert.equal(add.ok, true);

  let parts = await route('listStoreParts', { project: 'Network', _user: admin });
  assert.equal(parts.parts.find(p => p.id === partId).stock, 10);

  const withdrawR = await route('requestStoreWithdraw', { partId, project: 'Network', qty: 3, reason: 'PM', _user: inspector });
  assert.equal(withdrawR.ok, true);

  // stock unchanged until approved
  parts = await route('listStoreParts', { project: 'Network', _user: admin });
  assert.equal(parts.parts.find(p => p.id === partId).stock, 10);

  const approveR = await route('approveStoreTx', { id: withdrawR.id, _user: admin });
  assert.equal(approveR.ok, true);

  parts = await route('listStoreParts', { project: 'Network', _user: admin });
  assert.equal(parts.parts.find(p => p.id === partId).stock, 7);
});

test('CM: report -> assign -> acknowledge -> complete', async () => {
  const admin = { username: 'admin', role: 'admin' };
  const inspector = { username: 'inspector1', role: 'inspector', project: 'Network' };

  const report = await route('reportCmTicket', {
    ticket: { project: 'Network', equipment: 'หม้อแปลง A', problemDescription: 'มีเสียงดังผิดปกติ', priority: 'urgent' },
    _user: inspector
  });
  assert.equal(report.ok, true);

  const assignR = await route('assignCmTicket', { id: report.id, assignedTo: 'inspector1', _user: admin });
  assert.equal(assignR.ok, true);

  const ackR = await route('acknowledgeCmTicket', { id: report.id, _user: inspector });
  assert.equal(ackR.ok, true);

  const completeR = await route('completeCmTicket', {
    id: report.id, causeOfFailure: 'ลูกปืนสึก', actionTaken: 'เปลี่ยนลูกปืน', downtimeMinutes: 45,
    partsUsed: [{ name: 'ตลับลูกปืน 6205', qty: 1 }], removedParts: [], _user: inspector
  });
  assert.equal(completeR.ok, true);

  const tickets = await route('listCmTickets', { _user: admin });
  const t = tickets.tickets.find(x => x.id === report.id);
  assert.equal(t.status, 'done');
  assert.equal(t.partsUsed[0].name, 'ตลับลูกปืน 6205');
});

test('Page Permissions: default hides pm/cm, admin can turn them on', async () => {
  const admin = { username: 'admin', role: 'admin' };
  const before = await route('getPagePerms', { _user: admin });
  assert.equal(before.ok, true);
  assert.ok(!before.perms.inspector.includes('pm'));

  const setR = await route('setPagePerms', {
    _user: admin,
    perms: { ...before.perms, inspector: [...before.perms.inspector, 'pm'] }
  });
  assert.equal(setR.ok, true);

  const loginR = await route('login', { username: 'inspector1', password: 'pw123' });
  assert.ok(loginR.user.pagePerms.includes('pm'));
});

test('unknown action returns UNKNOWN_ACTION', async () => {
  const r = await route('doesNotExist', {});
  assert.equal(r.ok, false);
  assert.equal(r.error, 'UNKNOWN_ACTION');
});
