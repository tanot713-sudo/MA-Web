/* ================================================================
   AUTH — login / token verification / PDPA
   Ported from Code.gs actionLogin / verifyToken / actionVerifyToken /
   getTokenUser / actionGetPdpaStatus / actionAcceptPdpa
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, sheetToObjects, ensureHeaders, appendRow, appendRawRow } = require('../sheets');
const { genToken, genId, hashPw } = require('../utils');
const { getPagePermissions } = require('./pagePerms');

const USER_HEADERS = ['id', 'username', 'password', 'plainPwd', 'name', 'role', 'project', 'email', 'active', 'createdAt'];
const PDPA_HEADERS = ['username', 'version', 'acceptedAt', 'ip'];

async function actionLogin({ username, password }) {
  if (!username || !password) return { ok: false, message: 'กรุณากรอก username และ password' };
  const sh = await getSheet(CONFIG.SHEETS.USERS);
  await ensureHeaders(sh, USER_HEADERS);

  const all = await sheetToObjects(sh);
  if (all.length === 0) {
    await appendRow(sh, USER_HEADERS, {
      id: genId(), username: 'admin', password: hashPw('admin1234'),
      name: 'Administrator', role: 'admin', project: '', active: 'true',
      createdAt: new Date().toISOString()
    });
  }

  const users = await sheetToObjects(sh);
  const byUsername = users.find(u => u.username === username);
  const byBoth = users.find(u =>
    u.username === username &&
    (u.password === hashPw(password) || u.password === password)
  );

  if (!byUsername) {
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
  const exp = new Date(Date.now() + CONFIG.TOKEN_TTL).toISOString();
  const tsh = await getSheet(CONFIG.SHEETS.TOKENS);
  await ensureHeaders(tsh, ['token', 'username', 'role', 'project', 'exp']);
  await appendRawRow(tsh, [token, user.username, user.role, user.project || '', exp]);

  const perms = await getPagePermissions(user.role);

  return {
    ok: true, token,
    user: {
      username: user.username,
      name: user.name,
      role: user.role,
      project: user.project || '',
      pagePerms: perms
    }
  };
}

async function verifyToken(token) {
  if (!token) return { ok: false };
  const tsh = await getSheet(CONFIG.SHEETS.TOKENS);
  const rows = await sheetToObjects(tsh);
  const t = rows.find(r => r.token === token);
  if (!t) return { ok: false };
  if (new Date(t.exp) < new Date()) return { ok: false };
  return { ok: true, user: { username: t.username, role: t.role, project: t.project } };
}

async function actionVerifyToken({ _user }) {
  return { ok: true, user: _user };
}

async function getTokenUser(token) {
  const tsh = await getSheet(CONFIG.SHEETS.TOKENS);
  const rows = await sheetToObjects(tsh);
  const t = rows.find(r => r.token === token);
  return t ? t.username : 'unknown';
}

async function actionGetPdpaStatus({ version, _user }) {
  const sh = await getSheet(CONFIG.SHEETS.PDPA);
  await ensureHeaders(sh, PDPA_HEADERS);
  const rows = await sheetToObjects(sh);
  const rec = rows.find(r =>
    r.username === _user.username &&
    r.version === (version || CONFIG.PDPA_VERSION)
  );
  return { ok: true, accepted: !!rec };
}

async function actionAcceptPdpa({ version, ctx, _user }) {
  const sh = await getSheet(CONFIG.SHEETS.PDPA);
  await ensureHeaders(sh, PDPA_HEADERS);
  await appendRow(sh, PDPA_HEADERS, {
    username: _user.username,
    version: version || CONFIG.PDPA_VERSION,
    acceptedAt: new Date().toISOString(),
    ip: ctx ? ctx.ip : ''
  });
  return { ok: true };
}

module.exports = {
  USER_HEADERS, PDPA_HEADERS,
  actionLogin, verifyToken, actionVerifyToken, getTokenUser,
  actionGetPdpaStatus, actionAcceptPdpa
};
