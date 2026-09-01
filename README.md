# MA-Web — AMR Inspection System

Node.js web app on Vercel. This replaces the old Google Apps Script backend
entirely — **no more Apps Script editor, no more manual "Deploy" clicks.**
It still uses the exact same **Google Sheet** (as the database) and
**Google Drive folder** (for photos/files) as before, now accessed directly
through the Sheets API + Drive API via a service account, instead of
through Apps Script's `SpreadsheetApp`/`DriveApp`.

Push to `main` → Vercel deploys automatically. That's the whole workflow
from here on.

The old Apps Script source is kept for reference in `legacy-apps-script/`
(no longer deployed anywhere — safe to ignore, or delete once you're
confident the new backend fully replaces it).

## Architecture

```
public/index.html   — the entire frontend (bundled from the old index/style/i18n/script.html)
api/exec.js          — one Vercel serverless function, replaces Code.gs's doPost()
lib/route.js          — the action-name → handler switch, replaces Code.gs's route()
lib/actions/*.js       — the ported business logic, one file per feature area
lib/sheets.js            — Sheets API v4 helpers, replaces SpreadsheetApp
lib/drive.js              — Drive API v3 helpers, replaces DriveApp
lib/googleAuth.js          — service-account auth shared by both
lib/config.js                — Sheet ID / Drive folder ID / sheet & folder names
lib/common.js                  — project-access scoping (userCanAccessProject)
lib/utils.js                    — id/token generation, password hashing, date formatting
test/                             — smoke tests + a mock Google API for running them without real credentials
```

## One-time setup

### 1. Create a service account (in your existing GCP project)

1. Go to https://console.cloud.google.com/iam-admin/serviceaccounts (pick the
   same project you already used for Apps Script/Google Cloud).
2. **Create Service Account** → give it any name (e.g. `ma-web-backend`) →
   Create and Continue → Done (no roles needed at the project level — access
   is granted by sharing the Sheet/Drive folder directly, see step 3).
3. Open the new service account → **Keys** tab → **Add Key** → **Create new
   key** → JSON → download it. This file's content is what goes into the
   `GOOGLE_SERVICE_ACCOUNT_KEY` environment variable in step 5. Keep it
   secret — treat it like a password.
4. Note the service account's **email address** (looks like
   `ma-web-backend@your-project.iam.gserviceaccount.com`) — you need it next.

### 2. Enable the APIs

In the same GCP project, go to **APIs & Services → Library** and enable:
- **Google Sheets API**
- **Google Drive API**

### 3. Share the Sheet and Drive folder with the service account

- Open the Google Sheet (same one the Apps Script version used) → **Share**
  → paste the service account's email → give it **Editor** access.
- Open the Drive root folder (same one Apps Script used,
  `CONFIG.DRIVE_ROOT_ID` in the old Code.gs) → **Share** → paste the same
  service account email → **Editor** access.

Without this the app can technically deploy, but every request will fail
with a permissions error the moment it touches the Sheet or Drive.

### 4. Connect Vercel to this GitHub repo

1. https://vercel.com → **Add New… → Project** → import `MA-Web` from
   GitHub (authorize Vercel's GitHub App on this repo if asked).
2. Framework preset: **Other** (there's no build step — leave build/output
   settings at their defaults).
3. Don't deploy yet — set the environment variable first (next step), then
   deploy.

### 5. Set the environment variable

In the Vercel project → **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | the **entire contents** of the JSON key file from step 1.3, pasted as-is |

Apply it to all environments (Production/Preview/Development). Leave
`SHEET_ID`/`DRIVE_ROOT_ID` unset unless you want to point at a different
Sheet/Drive folder than the Apps Script version used — they default to the
same IDs.

### 6. Deploy

Push to `main` (or click **Deploy** in the Vercel dashboard for the first
one). Vercel gives you a URL like `https://ma-web-xxxx.vercel.app` — open
it, you should see the same login page as before. Log in with the same
admin account you already use.

From here on, **every push to `main` auto-deploys** — nothing else to run.

## What's different from the Apps Script version

- **Email notifications on PM/CM assignment are not wired up yet.** The
  assign/acknowledge flow itself works exactly the same; the "send an
  email to the assignee" step is stubbed (`lib/actions/notify.js`) and
  always reports "not sent", same as it used to when a user had no email
  on file. Wire up a real provider there when you're ready.
- **Server-side PDF/Word report generation (`generateReport`, the old
  "สร้างรายงาน PDF" flow that used Google Docs templates) is not ported.**
  It relied entirely on Apps Script's `DocumentApp`, which has no
  equivalent here — porting it means driving the Google Docs API v1
  directly, a separate follow-up. The app's existing **client-side** Word
  export (the `docx` library already in the frontend — "ดึงรายงาน Word")
  covers most of the same need in the meantime; calling `generateReport`
  now just returns a clear "not supported yet" message instead of an error.

Everything else — Records, Master Data, Users, Page Permissions, PM, CM,
Store Control, Equipment Documents, Checklist/WI Library, Assignments,
Survey (+ its background Excel export), Targets, Report Templates/Presets/
Info, the TH/EN language switcher — is fully ported and behaves the same.

## Local development

```bash
npm install
cp .env.example .env   # fill in GOOGLE_SERVICE_ACCOUNT_KEY with your real key
npx vercel dev          # serves the app + api/exec locally, same as production
```

## Running the tests

```bash
npm test
```

This runs `test/smoke.test.js`, which exercises the ported action functions
(login, users, records, PM, CM, Store Control, Page Permissions, …) against
an in-memory fake of the Sheets/Drive API (`test/mockGoogleapis.js`) — no
real Google credentials needed. It checks that the *business logic*
survived the port; it doesn't touch your real Sheet/Drive (do that by
actually using the deployed app once your service account is set up).

`test/devServer.js` (`node test/devServer.js`) spins up a local server the
same way, serving the real `public/index.html` and routing to the real
`api/exec.js` — useful for driving the actual UI against the mock backend
without needing real credentials yet.
