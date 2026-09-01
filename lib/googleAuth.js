/* ================================================================
   GOOGLE AUTH — service-account client shared by Sheets + Drive
   ================================================================
   Reads credentials from the GOOGLE_SERVICE_ACCOUNT_KEY env var (the
   full JSON key file content, as one string — set it in Vercel's
   project settings, see README.md for the exact steps).
   ================================================================ */
const { google } = require('googleapis');

let _authClient = null;

function loadCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY is not set. Paste the full service-account JSON key ' +
      '(as one line) into a Vercel environment variable with that name — see README.md.'
    );
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON: ' + e.message);
  }
}

function getAuthClient() {
  if (_authClient) return _authClient;
  const credentials = loadCredentials();
  _authClient = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive'
    ]
  });
  return _authClient;
}

let _sheetsClient = null;
function getSheetsClient() {
  if (_sheetsClient) return _sheetsClient;
  _sheetsClient = google.sheets({ version: 'v4', auth: getAuthClient() });
  return _sheetsClient;
}

let _driveClient = null;
function getDriveClient() {
  if (_driveClient) return _driveClient;
  _driveClient = google.drive({ version: 'v3', auth: getAuthClient() });
  return _driveClient;
}

module.exports = { getAuthClient, getSheetsClient, getDriveClient };
