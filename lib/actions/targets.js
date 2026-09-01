/* ================================================================
   TARGETS + ASSIGN STATS — ported from Code.gs
   ================================================================ */
const { CONFIG } = require('../config');
const { getSheet, sheetToObjects, ensureHeaders, getAllValues, setRange, appendRow } = require('../sheets');
const { ASSIGN_HEADERS } = require('./assignments');

const TARGET_HEADERS = ['project', 'username', 'deadline', 'note', 'updatedAt'];

async function actionSaveTarget({ project, username, deadline, note, _user }) {
  if (!['admin', 'manager', 'leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์' };
  if (!project || !deadline)
    return { ok: false, message: 'ต้องมีโครงการและวันเสร็จ' };

  const targetUser = username || _user.username;

  const sh = await getSheet('Targets');
  await ensureHeaders(sh, TARGET_HEADERS);
  const data = await getAllValues(sh);
  const pCol = data[0].indexOf('project');
  const uCol = data[0].indexOf('username');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][pCol]) === project && String(data[i][uCol]) === targetUser) {
      if (targetUser === '__project__' && !['admin', 'manager'].includes(_user.role))
        return { ok: false, message: 'เฉพาะ admin/manager เท่านั้นเปลี่ยน project target ได้' };
      await setRange(sh, i + 1, 1, [[project, targetUser, deadline, note || '', new Date().toISOString()]]);
      return { ok: true, action: 'updated' };
    }
  }
  await appendRow(sh, TARGET_HEADERS, {
    project, username: targetUser,
    deadline, note: note || '',
    updatedAt: new Date().toISOString()
  });
  return { ok: true, action: 'created' };
}

async function actionListTargets({ _user }) {
  if (!['admin', 'manager', 'leader'].includes(_user.role))
    return { ok: false, message: 'ไม่มีสิทธิ์' };

  const sh = await getSheet('Targets');
  await ensureHeaders(sh, TARGET_HEADERS);
  let rows = await sheetToObjects(sh);

  if (_user.role === 'leader') {
    const userProjs = (_user.project || '').split(',').map(p => p.trim()).filter(Boolean);
    rows = rows.filter(r => r.username === _user.username ||
      (r.username === '__project__' && userProjs.includes(r.project)));
  }
  return { ok: true, targets: rows };
}

async function actionGetAssignStats({ _user }) {
  const role = _user.role, uname = _user.username;
  const userProjs = (_user.project || '').split(',').map(p => p.trim()).filter(Boolean);

  const assignSh = await getSheet(CONFIG.SHEETS.ASSIGNMENTS);
  await ensureHeaders(assignSh, ASSIGN_HEADERS);
  let assigns = (await sheetToObjects(assignSh)).filter(a => a.id);
  if (role === 'inspector') {
    assigns = assigns.filter(a => a.assignedTo === uname);
  } else if (role === 'leader') {
    assigns = assigns.filter(a => userProjs.includes(a.project) || a.assignedBy === uname || a.assignedTo === uname);
  }

  const tSh = await getSheet('Targets');
  await ensureHeaders(tSh, TARGET_HEADERS);
  const projTargets = (await sheetToObjects(tSh)).filter(t => t.username === '__project__');

  const userSh = await getSheet(CONFIG.SHEETS.USERS);
  const usersData = await sheetToObjects(userSh);
  const nameMap = {};
  usersData.forEach(u => { nameMap[u.username] = u.name || u.username; });

  const projMap = {};
  assigns.forEach(a => {
    if (!a.assignedTo || !a.project) return;
    if (!projMap[a.project]) projMap[a.project] = {};
    const ins = a.assignedTo;
    if (!projMap[a.project][ins]) projMap[a.project][ins] = { total: 0, done: 0, dates: [] };
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

module.exports = { TARGET_HEADERS, actionSaveTarget, actionListTargets, actionGetAssignStats };
