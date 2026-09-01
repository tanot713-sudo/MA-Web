/* ================================================================
   DRIVE — replaces the Apps Script DriveApp-based helpers in the old
   Code.gs, now backed by the Drive API v3 through a service account.
   Folders/files are addressed by their Drive file ID (a plain string)
   rather than GAS's rich Folder/File objects.
   ================================================================ */
const { getDriveClient } = require('./googleAuth');
const { CONFIG } = require('./config');

function getRootFolder() {
  return CONFIG.DRIVE_ROOT_ID; // just an ID here, no network call needed
}

async function getOrCreateFolder(parentId, name) {
  const drive = getDriveClient();
  const safeName = String(name).replace(/'/g, "\\'");
  const q = `'${parentId}' in parents and name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id,name)', pageSize: 1 });
  if (res.data.files && res.data.files.length) return res.data.files[0].id;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    },
    fields: 'id'
  });
  return created.data.id;
}

async function getFolder(pathParts) {
  let folderId = getRootFolder();
  for (const part of pathParts) folderId = await getOrCreateFolder(folderId, part);
  return folderId;
}

// alias kept for parity with the old getOrCreateFolderObj() name used in a
// couple of call sites in the original Code.gs
const getOrCreateFolderObj = getOrCreateFolder;

async function getNestedFolder(rootFolderName, record, subfolder) {
  const safe = s => String(s || 'Unknown').replace(/[/\\:*?"<>|]/g, '_').trim() || 'Unknown';
  let folderId = await getOrCreateFolder(getRootFolder(), rootFolderName);
  folderId = await getOrCreateFolder(folderId, safe(record.project));
  folderId = await getOrCreateFolder(folderId, safe(record.location || record.locName || 'Unknown'));
  folderId = await getOrCreateFolder(folderId, safe(record.sublocation || record.subName || 'Unknown'));
  if (subfolder) folderId = await getOrCreateFolder(folderId, subfolder);
  return folderId;
}

// project/location/sublocation/equipment/type-scoped folder, used by
// equipment-doc and store-part attachments — mirrors the old
// getOrCreateDynamicFolder() in Code.gs
async function getOrCreateDynamicFolder(baseFolderName, project, loc, subloc, equip, typeFolder) {
  const safe = s => String(s || 'Unknown').replace(/[/\\:*?"<>|]/g, '_').trim() || 'Unknown';
  let folderId = await getOrCreateFolder(getRootFolder(), baseFolderName);
  folderId = await getOrCreateFolder(folderId, safe(project));
  if (loc) folderId = await getOrCreateFolder(folderId, safe(loc));
  if (subloc) folderId = await getOrCreateFolder(folderId, safe(subloc));
  if (equip) folderId = await getOrCreateFolder(folderId, safe(equip));
  if (typeFolder) folderId = await getOrCreateFolder(folderId, typeFolder);
  return folderId;
}

// base64Data must be a data: URI ("data:image/png;base64,...."). Returns a
// public (anyone-with-link) view/download URL for the uploaded file, in the
// same `https://drive.google.com/uc?id=FILEID` shape the old
// file.getDownloadUrl() (with &export=download stripped) produced, so the
// frontend's existing Drive-URL/thumbnail regex handling keeps working.
async function saveImageToFolder(base64Data, filename, folderId) {
  if (!base64Data || !base64Data.startsWith('data:')) return '';
  try {
    const [meta, b64] = base64Data.split(',');
    const mimeMatch = meta.match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const buffer = Buffer.from(b64, 'base64');

    const drive = getDriveClient();
    const { Readable } = require('stream');
    const created = await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id'
    });
    const fileId = created.data.id;

    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' }
    });

    return `https://drive.google.com/uc?id=${fileId}`;
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

module.exports = {
  getRootFolder, getOrCreateFolder, getOrCreateFolderObj, getFolder,
  getNestedFolder, getOrCreateDynamicFolder, saveImageToFolder, getThumbnailUrl
};
