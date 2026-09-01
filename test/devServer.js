/* Minimal local server that mimics what Vercel does in production (serve
   public/index.html for GET, route POST /api/exec to the same handler
   used in prod) — with the Sheets/Drive APIs swapped for the in-memory
   mock, so the whole stack can be exercised end-to-end with Playwright
   without any real Google credentials. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const mock = require('./mockGoogleapis');
const gpath = require.resolve('googleapis');
require.cache[gpath] = { id: gpath, filename: gpath, loaded: true, exports: { google: mock.google } };
process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: 'test@test', private_key: 'x' });

const handler = require('../api/exec.js');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'));

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/exec') {
    let chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body = {};
      try { body = JSON.parse(raw); } catch (e) {}
      const fakeRes = {
        setHeader: (k, v) => res.setHeader(k, v),
        status(code) { this._code = code; return this; },
        json(obj) { res.writeHead(this._code || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); },
        end() { res.writeHead(this._code || 200); res.end(); }
      };
      await handler({ method: 'POST', body }, fakeRes);
    });
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(indexHtml);
});

const PORT = process.env.PORT || 3311;
server.listen(PORT, () => console.log('dev server on http://localhost:' + PORT));
