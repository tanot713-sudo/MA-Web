/* ================================================================
   PROJECT SCOPING — shared by many action modules
   Ported from Code.gs userProjectList / userCanAccessProject
   ================================================================ */
function userProjectList(_user) {
  return (_user.project || '').split(',').map(p => p.trim()).filter(Boolean);
}

// true if _user can access `project` — admin/manager always see every
// project; leader/inspector with no project bound at all (empty list) are
// treated as unrestricted too.
function userCanAccessProject(_user, project) {
  if (['admin', 'manager'].includes(_user.role)) return true;
  const list = userProjectList(_user);
  return list.length === 0 || list.includes(project);
}

module.exports = { userProjectList, userCanAccessProject };
