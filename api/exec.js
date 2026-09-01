/* ================================================================
   API ENTRY POINT — Vercel serverless function
   Replaces Code.gs's doPost(). The frontend's api() function posts
   here (same origin) with a JSON body: { action, token, ctx, ...payload }.
   doGet() has no equivalent needed — Vercel serves public/index.html
   (the bundled frontend) directly as a static file for every other path.
   ================================================================ */
const { route } = require('../lib/route');
const { verifyToken, getTokenUser } = require('../lib/actions/auth');
const { writeLog } = require('../lib/actions/logs');

const PUBLIC_ACTIONS = ['login'];

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'object') return req.body; // Vercel already parsed JSON for us
  try { return JSON.parse(req.body); } catch (e) { return {}; }
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  try {
    const body = parseBody(req);
    const { action, token, ctx } = body;
    const payload = { ...body };
    delete payload.action;
    delete payload.token;
    delete payload.ctx;

    if (!PUBLIC_ACTIONS.includes(action)) {
      const authResult = await verifyToken(token);
      if (!authResult.ok) {
        res.status(200).json({ ok: false, error: 'UNAUTHORIZED', message: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' });
        return;
      }
      payload._user = authResult.user;
    }

    if (ctx) {
      const username = token ? await getTokenUser(token) : 'guest';
      writeLog(action, username, ctx).catch(() => {}); // best-effort, never block the response
    }

    const result = await route(action, payload);
    res.status(200).json(result);
  } catch (err) {
    console.error('api/exec error:', err);
    res.status(200).json({ ok: false, error: 'SERVER_ERROR', message: err.message });
  }
};
