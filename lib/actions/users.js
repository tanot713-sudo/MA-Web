/* ================================================================
   USER MANAGEMENT — ported from Code.gs
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, sheetToObjects, ensureHeaders, appendRow, getAllValues, setCell, deleteRow } = require('../sheets');
const { genId, hashPw } = require('../utils');
const { USER_HEADERS } = require('./auth');

async function actionBulkCreateUsers({ rows, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  if (!Array.isArray(rows)) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };
  const sh = await getSheet(CONFIG.SHEETS.USERS);
  await ensureHeaders(sh, USER_HEADERS);
  const existing = (await sheetToObjects(sh)).map(r => r.username);
  let created = 0, skipped = 0;
  for (const r of rows) {
    const username = String(r.username || '').trim();
    const password = String(r.password || '').trim();
    if (!username || !password || existing.includes(username)) { skipped++; continue; }
    await appendRow(sh, USER_HEADERS, {
      id: genId(), username, password: hashPw(password), plainPwd: password,
      name: r.name || username, role: r.role || 'inspector',
      project: r.project || '', email: r.email || '', active: 'true',
      createdAt: new Date().toISOString()
    });
    existing.push(username);
    created++;
  }
  return { ok: true, created, skipped };
}

async function actionCreateUser({ username, password, name, role, project, email, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  if (!username || !password) return { ok: false, message: 'ต้องมี username และ password' };

  const sh = await getSheet(CONFIG.SHEETS.USERS);
  await ensureHeaders(sh, USER_HEADERS);
  const rows = await sheetToObjects(sh);
  if (rows.find(r => r.username === username))
    return { ok: false, message: `username "${username}" มีอยู่แล้ว` };

  await appendRow(sh, USER_HEADERS, {
    id: genId(), username, password: hashPw(password),
    plainPwd: password,
    name: name || username, role: role || 'inspector',
    project: project || '', email: email || '', active: 'true',
    createdAt: new Date().toISOString()
  });
  return { ok: true };
}

async function actionUpdateUser({ username, updates, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  const sh = await getSheet(CONFIG.SHEETS.USERS);
  const data = await getAllValues(sh);
  const hdrs = data[0];
  const uCol = hdrs.indexOf('username');
  for (let i = 1; i < data.length; i++) {
    if (data[i][uCol] === username) {
      for (let ci = 0; ci < hdrs.length; ci++) {
        const h = hdrs[ci];
        if (h === 'password' && updates.password) {
          await setCell(sh, i + 1, ci + 1, hashPw(updates.password));
        } else if (h === 'plainPwd' && updates.password) {
          await setCell(sh, i + 1, ci + 1, updates.password);
        } else if (updates[h] !== undefined && h !== 'id' && h !== 'createdAt' && h !== 'username') {
          await setCell(sh, i + 1, ci + 1, updates[h]);
        }
      }
      return { ok: true };
    }
  }
  return { ok: false, message: 'ไม่พบ username' };
}

async function actionSetUserActive({ username, active, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  const sh = await getSheet(CONFIG.SHEETS.USERS);
  const data = await getAllValues(sh);
  const hdrs = data[0];
  const uCol = hdrs.indexOf('username');
  const aCol = hdrs.indexOf('active');
  if (uCol < 0 || aCol < 0) return { ok: false, message: 'ไม่พบคอลัมน์ที่ต้องการ' };
  for (let i = 1; i < data.length; i++) {
    if (data[i][uCol] === username) {
      await setCell(sh, i + 1, aCol + 1, active ? 'true' : 'false');
      return { ok: true };
    }
  }
  return { ok: false, message: 'ไม่พบ username' };
}

async function actionDeleteUser({ username, _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  if (username === 'admin') return { ok: false, message: 'ไม่สามารถลบ admin หลักได้' };

  const sh = await getSheet(CONFIG.SHEETS.USERS);
  const data = await getAllValues(sh);
  const uCol = data[0].indexOf('username');
  if (uCol < 0) return { ok: false, message: 'ไม่พบคอลัมน์ username' };
  for (let i = 1; i < data.length; i++) {
    if (data[i][uCol] === username) {
      await deleteRow(sh, i + 1);
      return { ok: true };
    }
  }
  return { ok: false, message: 'ไม่พบ username' };
}

async function actionListUsers({ _user }) {
  if (_user.role !== 'admin') return { ok: false, message: 'เฉพาะ admin เท่านั้น' };
  const sh = await getSheet(CONFIG.SHEETS.USERS);
  await ensureHeaders(sh, USER_HEADERS);
  const rows = await sheetToObjects(sh);
  return {
    ok: true,
    users: rows.map(r => ({
      username: r.username,
      plainPwd: r.plainPwd,
      name: r.name,
      role: r.role,
      project: r.project,
      email: r.email || '',
      active: String(r.active).toLowerCase() !== 'false',
      createdAt: r.createdAt
    }))
  };
}

module.exports = {
  actionBulkCreateUsers, actionCreateUser, actionUpdateUser,
  actionSetUserActive, actionDeleteUser, actionListUsers
};
