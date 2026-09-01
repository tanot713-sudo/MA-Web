# MA-Web — AMR Inspection System

Google Apps Script web app (backend `Code.gs` + HTML frontend). This repo is the
source of truth — a GitHub Actions workflow (`.github/workflows/deploy.yml`)
pushes every commit on `main` straight to the live Apps Script deployment, so
you never need to open the Apps Script editor to ship a change.

## Files

| File | Purpose |
|---|---|
| `Code.gs` | Backend (routes, sheet access, business logic) |
| `index.html` | Page shell — includes `style`, `i18n`, `script` |
| `script.html` | Frontend JS |
| `style.html` | CSS |
| `i18n.html` | TH/EN translation dictionary + language switcher |
| `appsscript.json` | Project manifest (scopes, timezone, web app config) |

## One-time setup (do this once, on your own computer)

The Actions workflow needs your Google credentials and your project's IDs
before it can deploy anything — GitHub can't get these on its own.

1. **Install Node.js** (if you don't have it): https://nodejs.org

2. **Install `clasp`** (Google's Apps Script CLI):
   ```bash
   npm install -g @google/clasp
   ```

3. **Turn on the Apps Script API** for your Google account:
   open https://script.google.com/home/usersettings and toggle it **On**.

4. **Log in** with the Google account that owns the AMR OMA project:
   ```bash
   clasp login
   ```
   This opens a browser sign-in and creates a file at `~/.clasprc.json`
   (on Windows: `C:\Users\<you>\.clasprc.json`).

5. **Get your Script ID**: in the Apps Script editor, click the gear icon
   ("การตั้งค่าโปรเจกต์" / Project Settings) on the left → copy **"Script ID"**.

6. **Get your Deployment ID**: it's the segment in your live web app URL —
   ```
   https://script.google.com/macros/s/DEPLOYMENT_ID/exec
   ```
   For the current deployment that's:
   ```
   AKfycbz3-XmS8YjzoOwQFz3LS44WIfrXxfWdfuDJKRM5moFClq_yUYsmKCaFg1zBpiq78-md
   ```

7. **Add 3 secrets to this GitHub repo**: go to
   **Settings → Secrets and variables → Actions → New repository secret**,
   and add:

   | Secret name | Value |
   |---|---|
   | `CLASP_CREDENTIALS` | the entire contents of `~/.clasprc.json` from step 4 |
   | `SCRIPT_ID` | the Script ID from step 5 |
   | `DEPLOYMENT_ID` | the Deployment ID from step 6 |

## Using it

From then on, every push to `main` (or **Actions → Deploy to Google Apps
Script → Run workflow** for a manual run) automatically:

1. Pushes the 6 project files to the Apps Script project
2. Creates a new version
3. Points the existing deployment (same live URL) at that new version

Check the **Actions** tab on GitHub to see whether a deploy succeeded or
failed, with full logs.
