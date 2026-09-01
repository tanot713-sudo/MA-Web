/* ================================================================
   SHEETS — replaces the Apps Script SpreadsheetApp-based helpers in
   the old Code.gs (getSheet/sheetToObjects/ensureHeaders/appendRow/
   findRowById/updateRowById/deleteRowById), now backed by the
   Sheets API v4 through a service account.

   Every function here is async (network calls) — the Apps Script
   originals were synchronous, so every call site now needs `await`.
   Behavior is kept as close to the originals as possible so the
   ported action functions barely need to change beyond adding
   async/await.
   ================================================================ */
const { getSheetsClient } = require('./googleAuth');
const { CONFIG } = require('./config');

// column-index (0-based) -> A1 letter, e.g. 0->A, 25->Z, 26->AA
function colLetter(idx) {
  let s = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Returns { title, sheetId } for the named tab, creating it if it doesn't
// exist yet — equivalent of Apps Script's getSheet(name).
async function getSheet(name) {
  const sheets = getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: CONFIG.SHEET_ID,
    fields: 'sheets(properties(sheetId,title))'
  });
  const found = (meta.data.sheets || []).find(s => s.properties.title === name);
  if (found) return { title: name, sheetId: found.properties.sheetId };

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: CONFIG.SHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title: name } } }] }
  });
  const newProps = res.data.replies[0].addSheet.properties;
  return { title: name, sheetId: newProps.sheetId };
}

// Full-sheet raw values (equivalent of sh.getDataRange().getValues())
async function getAllValues(sh) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CONFIG.SHEET_ID,
    range: `'${sh.title}'`
  });
  return res.data.values || [];
}

async function sheetToObjects(sh) {
  const data = await getAllValues(sh);
  if (data.length < 2) return [];
  const headers = data[0].map(h => String(h).trim());
  return data.slice(1)
    .filter(r => r.some(v => v !== '' && v !== undefined && v !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
      return obj;
    });
}

// Adds any headers[] not already present as new trailing columns — never
// reorders or overwrites existing columns (same guarantee as the original).
async function ensureHeaders(sh, headers) {
  const sheets = getSheetsClient();
  const data = await getAllValues(sh);
  const existing = (data[0] || []).map(String);
  if (!existing.length || !existing[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SHEET_ID,
      range: `'${sh.title}'!A1:${colLetter(headers.length - 1)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] }
    });
    return;
  }
  const missing = headers.filter(h => existing.indexOf(h) === -1);
  if (missing.length) {
    const startCol = existing.length; // 0-based index of first free column
    await sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SHEET_ID,
      range: `'${sh.title}'!${colLetter(startCol)}1:${colLetter(startCol + missing.length - 1)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [missing] }
    });
  }
}

async function getPhysicalHeaders(sh) {
  const data = await getAllValues(sh);
  return (data[0] || []).map(String);
}

// Writes values by matching the sheet's *actual* header row (not the
// headers[] array's order) — same anti-column-drift guarantee as before.
async function appendRow(sh, headers, obj) {
  await ensureHeaders(sh, headers);
  const physicalHeaders = await getPhysicalHeaders(sh);
  const row = physicalHeaders.map(h => (obj[h] !== undefined ? obj[h] : ''));
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.SHEET_ID,
    range: `'${sh.title}'!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

// 1-indexed sheet row number (row 1 = header row), or -1 if not found —
// same convention as the Apps Script original.
async function findRowById(sh, id) {
  const data = await getAllValues(sh);
  if (data.length < 2) return -1;
  const idCol = data[0].indexOf('id');
  if (idCol < 0) return -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) return i + 1;
  }
  return -1;
}

async function updateRowById(sh, headers, id, obj) {
  const row = await findRowById(sh, id);
  if (row < 0) return false;
  await ensureHeaders(sh, headers);
  const physicalHeaders = await getPhysicalHeaders(sh);
  const vals = physicalHeaders.map(h => (obj[h] !== undefined ? obj[h] : ''));
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SHEET_ID,
    range: `'${sh.title}'!A${row}:${colLetter(vals.length - 1)}${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [vals] }
  });
  return true;
}

async function deleteRowById(sh, id) {
  const row = await findRowById(sh, id);
  if (row < 0) return false;
  const sheets = getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: CONFIG.SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sh.sheetId,
            dimension: 'ROWS',
            startIndex: row - 1, // API is 0-indexed
            endIndex: row
          }
        }
      }]
    }
  });
  return true;
}

// Blind array append in literal column order — equivalent of the raw
// sh.appendRow([...]) calls scattered through the old Code.gs (as opposed
// to the object-keyed appendRow() above, which matches by header name).
async function appendRawRow(sh, values) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: CONFIG.SHEET_ID,
    range: `'${sh.title}'!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] }
  });
}

// sh.getRange(row, col).setValue(v) equivalent — row/col are 1-indexed.
async function setCell(sh, row, col, value) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SHEET_ID,
    range: `'${sh.title}'!${colLetter(col - 1)}${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] }
  });
}

// sh.getRange(row, col, numRows, numCols).setValues([[...]]) equivalent.
async function setRange(sh, row, col, values2D) {
  const sheets = getSheetsClient();
  const numRows = values2D.length;
  const numCols = Math.max(...values2D.map(r => r.length));
  await sheets.spreadsheets.values.update({
    spreadsheetId: CONFIG.SHEET_ID,
    range: `'${sh.title}'!${colLetter(col - 1)}${row}:${colLetter(col - 1 + numCols - 1)}${row + numRows - 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: values2D }
  });
}

// sh.clearContents() equivalent — clears all values but keeps the sheet/tab.
async function clearContents(sh) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: CONFIG.SHEET_ID,
    range: `'${sh.title}'`
  });
}

// sh.deleteRow(rowNum) equivalent — rowNum is 1-indexed, same convention
// findRowById()/deleteRowById() already use.
async function deleteRow(sh, rowNum) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: CONFIG.SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId: sh.sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum }
        }
      }]
    }
  });
}

// Writes several individual cells in ONE API round trip — used wherever the
// old code did several sequential sh.getRange(r,c).setValue(v) calls (e.g.
// updating status + doneAt + doneData together). updates: [{row,col,value}].
async function batchSetCells(sh, updates) {
  if (!updates.length) return;
  const sheets = getSheetsClient();
  const data = updates.map(({ row, col, value }) => ({
    range: `'${sh.title}'!${colLetter(col - 1)}${row}`,
    values: [[value]]
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: CONFIG.SHEET_ID,
    requestBody: { valueInputOption: 'RAW', data }
  });
}

module.exports = {
  getSheet, sheetToObjects, ensureHeaders, appendRow,
  findRowById, updateRowById, deleteRowById, getAllValues, getPhysicalHeaders,
  appendRawRow, setCell, setRange, clearContents, deleteRow, colLetter, batchSetCells
};
