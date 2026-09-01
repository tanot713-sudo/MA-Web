/* ================================================================
   IMAGE PROXY + GENERATE REPORT — ported from Code.gs
   ================================================================
   actionFetchImageAsBase64 / actionFetchImagesAsBase64Batch: replace
   Apps Script's UrlFetchApp (server-to-server, no CORS) with Node's
   built-in fetch — same idea, same reason (the browser can't fetch
   drive.google.com directly because of CORS).

   actionGenerateReport (the old Word/PDF report built via
   DocumentApp — copying a Google Docs template, inserting headings/
   tables/images, exporting as PDF) is NOT ported yet. It relied
   entirely on Apps Script's DocumentApp, which has no equivalent in
   this stack; a real port means driving the Google Docs API v1
   batchUpdate calls directly, which is a separate, sizeable follow-up.
   The app already has a client-side Word export (the `docx` library
   in script.html — "ดึงรายงาน Word" / "สร้างรายงาน Word Template")
   that covers most of the same need in the meantime, so this is
   stubbed with a clear message rather than silently failing.
   ================================================================ */

async function actionFetchImageAsBase64({ url, _user }) {
  if (!url || !/^https:\/\/drive\.google\.com\//.test(url)) return { ok: false };
  try {
    const resp = await fetch(url);
    if (!resp.ok) return { ok: false };
    const buffer = Buffer.from(await resp.arrayBuffer());
    return {
      ok: true,
      base64: buffer.toString('base64'),
      mimeType: resp.headers.get('content-type') || 'image/jpeg'
    };
  } catch (e) {
    return { ok: false };
  }
}

async function actionFetchImagesAsBase64Batch({ urls, _user }) {
  if (!Array.isArray(urls) || !urls.length) return { ok: false, results: [] };
  try {
    const results = await Promise.all(urls.map(async url => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) return { ok: false, url };
        const buffer = Buffer.from(await resp.arrayBuffer());
        return {
          ok: true,
          url,
          base64: buffer.toString('base64'),
          mimeType: resp.headers.get('content-type') || 'image/jpeg'
        };
      } catch (e) {
        return { ok: false, url };
      }
    }));
    return { ok: true, results };
  } catch (e) {
    return { ok: false, results: [], message: e.message };
  }
}

async function actionGenerateReport(payload, _user) {
  return {
    ok: false,
    message: 'สร้างรายงาน PDF จากฝั่งเซิร์ฟเวอร์ยังไม่รองรับในระบบใหม่นี้ — ใช้ปุ่ม "ดึงรายงาน Word" (สร้างจากเบราว์เซอร์โดยตรง) ไปก่อนได้ครับ ระบบนี้จะตามมาทีหลัง'
  };
}

module.exports = { actionFetchImageAsBase64, actionFetchImagesAsBase64Batch, actionGenerateReport };
