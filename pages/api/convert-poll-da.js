// pages/api/convert-poll-da.js
// Verifică dacă jobs/<jobId>/da/result.pdf există în bucket; dacă da -> status: done (da)

const PROXY_BASE_URL = process.env.PROXY_BASE_URL;
const APS_BUCKET     = process.env.APS_BUCKET || process.env.BUCKET_NAME;
const REGION_HEADER  = { 'x-ads-region': 'US' };

async function getApsToken() {
  const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SCOPES } = process.env;
  if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) throw new Error('APS credentials missing');
  const scopes = APS_SCOPES || 'data:read data:write bucket:read bucket:create code:all';
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: scopes,
    client_id: APS_CLIENT_ID,
    client_secret: APS_CLIENT_SECRET
  });
  const r = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`APS token failed: ${t}`);
  return JSON.parse(t); // { access_token }
}

// citește status.json (via proxy download-sign)
async function readStatus(jobId) {
  const { access_token } = await getApsToken();
  const key = `jobs/${jobId}/status.json`;
  const sign = await fetch(`${PROXY_BASE_URL}/download-sign?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(key)}&token=${encodeURIComponent(access_token)}`, { headers: REGION_HEADER });
  if (sign.status === 404) return null;
  const sTxt = await sign.text();
  if (!sign.ok) throw new Error(`download-sign status.json failed: ${sTxt}`);
  const sj = sTxt ? JSON.parse(sTxt) : {};
  const url = sj.url || (Array.isArray(sj.urls) && sj.urls[0]) || sj.downloadUrl;
  if (!url) return null;
  const g = await fetch(url);
  if (!g.ok) return null;
  const text = await g.text();
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

// scrie status.json (via proxy upload)
async function writeStatus(jobId, data) {
  const key = `jobs/${jobId}/status.json`;
  const bodyStr = JSON.stringify({ ...(data||{}), updatedAt: new Date().toISOString() });
  const len = Buffer.byteLength(bodyStr);
  const { access_token } = await getApsToken();
  const up = await fetch(`${PROXY_BASE_URL}/upload?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(key)}&token=${encodeURIComponent(access_token)}`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Content-Length': String(len) },
    body: bodyStr
  });
  const t = await up.text();
  if (!up.ok) throw new Error(`/upload failed: ${t}`);
  return { key, size: len };
}

// verifică existența unui obiect (via proxy download-sign)
async function objectExists(objectKey) {
  const { access_token } = await getApsToken();
  const sign = await fetch(`${PROXY_BASE_URL}/download-sign?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(objectKey)}&token=${encodeURIComponent(access_token)}`, { headers: REGION_HEADER });
  if (sign.status === 404) return false;
  const sTxt = await sign.text();
  if (!sign.ok) return false;
  const sj = sTxt ? JSON.parse(sTxt) : {};
  const url = sj.url || (Array.isArray(sj.urls) && sj.urls[0]) || sj.downloadUrl;
  if (!url) return false;
  const head = await fetch(url, { method: 'GET' }); // GET e sigur pe pre-signed
  return head.ok;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ ok:false, error:'Method Not Allowed' });
    }
    if (!PROXY_BASE_URL || !APS_BUCKET) {
      return res.status(500).json({ ok:false, error:'Missing PROXY_BASE_URL or APS_BUCKET' });
    }

    const jobId = String(req.query.jobId || '').trim();
    if (!jobId) return res.status(400).json({ ok:false, error:'Missing jobId' });

    const cur = await readStatus(jobId);
    // dacă deja e done (da), returnăm direct
    if (cur?.status === 'done' && cur?.stage === 'da' && cur?.pdf?.objectKey) {
      return res.status(200).json({ ok:true, ...cur });
    }

    const resultKey = cur?.output?.objectKey || `jobs/${jobId}/da/result.pdf`;
    const exists = await objectExists(resultKey);

    if (exists) {
      const newStatus = {
        jobId,
        status: 'done',
        stage: 'da',
        method: 'da',
        pdf: { objectKey: resultKey, name: 'result.pdf', mime: 'application/pdf' }
      };
      try { await writeStatus(jobId, newStatus); } catch {}
      return res.status(200).json({ ok:true, ...newStatus });
    }

    // încă nu există: rămâne inProgress
    const inprog = {
      jobId,
      status: 'inProgress',
      stage: 'da',
      method: 'da',
      output: { bucket: APS_BUCKET, objectKey: resultKey }
    };
    try { await writeStatus(jobId, inprog); } catch {}
    return res.status(200).json({ ok:true, ...inprog });
  } catch (err) {
    console.error('[api/convert-poll-da] error:', err);
    return res.status(500).json({ ok:false, error:'Internal Server Error' });
  }
}
