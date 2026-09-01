/* In-memory fake of the tiny slice of the `googleapis` Sheets v4 / Drive v3
   surface that lib/sheets.js and lib/drive.js actually call, used to
   smoke-test the ported business logic without real Google credentials.
   Installed into require.cache under the 'googleapis' module id BEFORE
   any of the app's lib/ modules are required. */
const crypto = require('crypto');

// ---- in-memory "spreadsheet" state ----
// sheets: { [title]: { sheetId, rows: string[][] } }  (rows[0] = header row when present)
const state = { sheets: {}, nextSheetId: 1, driveFiles: {} };

function colLetterToIndex(letters) {
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function parseA1(range) {
  // supports "'Title'", "'Title'!A1", "'Title'!A1:C5", "'Title'!A1:B"
  const m = range.match(/^'([^']+)'(?:!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?)?$/);
  if (!m) throw new Error('mock parseA1 could not parse: ' + range);
  const [, title, c1, r1, c2, r2] = m;
  return {
    title,
    startCol: c1 ? colLetterToIndex(c1) : 0,
    startRow: r1 ? parseInt(r1, 10) - 1 : 0,
    endCol: c2 ? colLetterToIndex(c2) : (c1 ? colLetterToIndex(c1) : null),
    endRow: r2 ? parseInt(r2, 10) - 1 : (r1 ? parseInt(r1, 10) - 1 : null)
  };
}

function ensureSheet(title) {
  if (!state.sheets[title]) {
    state.sheets[title] = { sheetId: state.nextSheetId++, rows: [] };
  }
  return state.sheets[title];
}

function padRow(row, len) {
  const r = row.slice();
  while (r.length < len) r.push('');
  return r;
}

const sheetsMock = {
  spreadsheets: {
    async get({ fields }) {
      return { data: { sheets: Object.entries(state.sheets).map(([title, s]) => ({ properties: { sheetId: s.sheetId, title } })) } };
    },
    async batchUpdate({ requestBody }) {
      const replies = [];
      for (const req of requestBody.requests) {
        if (req.addSheet) {
          const s = ensureSheet(req.addSheet.properties.title);
          replies.push({ addSheet: { properties: { sheetId: s.sheetId, title: req.addSheet.properties.title } } });
        } else if (req.deleteDimension) {
          const sheet = Object.values(state.sheets).find(s => s.sheetId === req.deleteDimension.range.sheetId);
          const { startIndex, endIndex } = req.deleteDimension.range;
          sheet.rows.splice(startIndex, endIndex - startIndex);
          replies.push({});
        }
      }
      return { data: { replies } };
    },
    values: {
      async get({ range }) {
        const { title } = parseA1(range);
        const s = ensureSheet(title);
        return { data: { values: s.rows.map(r => r.slice()) } };
      },
      async update({ range, requestBody }) {
        const { title, startCol, startRow } = parseA1(range);
        const s = ensureSheet(title);
        requestBody.values.forEach((rowVals, ri) => {
          const rIdx = startRow + ri;
          while (s.rows.length <= rIdx) s.rows.push([]);
          rowVals.forEach((val, ci) => {
            const cIdx = startCol + ci;
            while (s.rows[rIdx].length <= cIdx) s.rows[rIdx].push('');
            s.rows[rIdx][cIdx] = val;
          });
        });
        return { data: {} };
      },
      async append({ range, requestBody }) {
        const { title } = parseA1(range);
        const s = ensureSheet(title);
        const width = s.rows[0] ? s.rows[0].length : (requestBody.values[0] || []).length;
        requestBody.values.forEach(row => s.rows.push(padRow(row, width)));
        return { data: {} };
      },
      async clear({ range }) {
        const { title } = parseA1(range);
        const s = ensureSheet(title);
        s.rows = [];
        return { data: {} };
      },
      async batchUpdate({ requestBody }) {
        for (const d of requestBody.data) {
          const { title, startCol, startRow } = parseA1(d.range);
          const s = ensureSheet(title);
          while (s.rows.length <= startRow) s.rows.push([]);
          const row = s.rows[startRow];
          while (row.length <= startCol) row.push('');
          row[startCol] = d.values[0][0];
        }
        return { data: {} };
      }
    }
  },
  async create({ requestBody }) {
    const title = requestBody.properties.title;
    const id = 'mockss_' + crypto.randomBytes(6).toString('hex');
    state.driveFiles[id] = { id, name: title, kind: 'spreadsheet', sheetTitle: title, trashed: false };
    ensureSheet(title);
    return { spreadsheetId: id };
  }
};

// wrap so `sheets.spreadsheets.create` (top-level `create`) matches how the
// real client nests it under spreadsheets too
sheetsMock.spreadsheets.create = async ({ requestBody, fields }) => {
  const title = requestBody.properties.title;
  const id = 'mockss_' + crypto.randomBytes(6).toString('hex');
  state.driveFiles[id] = { id, name: title, kind: 'spreadsheet', sheetTitle: title, trashed: false };
  ensureSheet(title);
  return { data: { spreadsheetId: id } };
};

const driveMock = {
  files: {
    async list({ q, fields }) {
      // very small subset: supports "'parentId' in parents and name='X' and mimeType='...folder' and trashed=false"
      // and "'parentId' in parents and trashed=false and name contains 'prefix'"
      const parentMatch = q.match(/'([^']+)' in parents/);
      const parent = parentMatch ? parentMatch[1] : null;
      const nameEqMatch = q.match(/name='([^']*)'/);
      const nameContainsMatch = q.match(/name contains '([^']*)'/);
      const isFolder = q.includes("mimeType='application/vnd.google-apps.folder'");
      const files = Object.values(state.driveFiles).filter(f => {
        if (f.trashed) return false;
        if (parent && f.parent !== parent) return false;
        if (isFolder && f.kind !== 'folder') return false;
        if (nameEqMatch && f.name !== nameEqMatch[1]) return false;
        if (nameContainsMatch && !f.name.startsWith(nameContainsMatch[1])) return false;
        return true;
      });
      return { data: { files: files.map(f => ({ id: f.id, name: f.name })) } };
    },
    async create({ requestBody, media }) {
      const id = 'mockfile_' + crypto.randomBytes(6).toString('hex');
      state.driveFiles[id] = {
        id, name: requestBody.name,
        kind: requestBody.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
        parent: (requestBody.parents || [])[0] || null,
        trashed: false
      };
      return { data: { id } };
    },
    async get({ fileId }) {
      const f = state.driveFiles[fileId];
      if (!f) { const e = new Error('File not found'); e.code = 404; throw e; }
      return { data: { id: f.id } };
    },
    async update({ fileId, requestBody }) {
      const f = state.driveFiles[fileId];
      if (f && requestBody.trashed !== undefined) f.trashed = requestBody.trashed;
      return { data: {} };
    },
    async export({ fileId, mimeType }) {
      return { data: Buffer.from('fake-xlsx-bytes') };
    }
  },
  permissions: {
    async create({ fileId, requestBody }) {
      return { data: {} };
    }
  }
};

class FakeGoogleAuth {
  constructor() {}
}

const google = {
  auth: { GoogleAuth: FakeGoogleAuth },
  sheets: () => sheetsMock,
  drive: () => driveMock
};

module.exports = { google, __mockState: state };
