// pages/api/convert-job-status.js
// Citește jobs/{jobId}/status.json folosind URL semnat prin proxy (/download-sign)

const PROXY_BASE_URL = process.env.PROXY_BASE_URL;
const APS_BUCKET = process.env.APS_BUCKET;
const REGION_HEADER = { 'x-ads-region': 'US' };

async function getApsToken() {
  const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SCOPES } = process.env;
  if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) throw new Error('APS credentials missing');
  const scopes = APS_SCOPES || 'data:read data:write bucket:read bucket:create';
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
  if (!r.ok) throw new Error(`APS token failed: ${await r.text()}`);
  return r.json(); // { access_token }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ ok:false, error:'Method Not Allowed' });
    }
    if (!PROXY_BASE_URL) return res.status(500).json({ ok:false, error:'Missing PROXY_BASE_URL' });
    if (!APS_BUCKET)     return res.status(500).json({ ok:false, error:'Missing APS_BUCKET' });

    const jobId = String(req.query.jobId || '').trim();
    if (!jobId) return res.status(400).json({ ok:false, error:'Missing jobId' });

    const objectKey = `jobs/${jobId}/status.json`;
    const { access_token } = await getApsToken();

    // 1) Cerem URL semnat de download de la proxy
    const signUrl = `${PROXY_BASE_URL}/download-sign?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(objectKey)}&token=${encodeURIComponent(access_token)}`;
    const signResp = await fetch(signUrl, { headers: REGION_HEADER });
    const signText = await signResp.text();
    if (signResp.status === 404) {
      // încă nu există fișierul -> queued
      return res.status(200).json({ ok:true, jobId, status:'queued', missing:true });
    }
    if (!signResp.ok) {
      return res.status(signResp.status).json({ ok:false, error:'Proxy signed download failed', detail: signText });
    }
    const signed = signText ? JSON.parse(signText) : {};
    const downloadUrl = signed.url || (Array.isArray(signed.urls) && signed.urls[0]) || signed.downloadUrl;
    if (!downloadUrl) {
      return res.status(502).json({ ok:false, error:'Missing signed download url', raw:signed });
    }

    // 2) Descărcăm conținutul efectiv al status.json
    const g = await fetch(downloadUrl);
    if (g.status === 404) return res.status(200).json({ ok:true, jobId, status:'queued', missing:true });
    if (!g.ok) {
      const t = await g.text();
      return res.status(g.status).json({ ok:false, error:'Download failed', detail:t });
    }

    const text = await g.text();
    try {
      const json = text ? JSON.parse(text) : {};
      return res.status(200).json({ ok:true, ...json });
    } catch {
      return res.status(200).json({ ok:true, raw:text });
    }
  } catch (err) {
    console.error('[api/convert-job-status] error:', err);
    return res.status(500).json({ ok:false, error:'Internal Server Error' });
  }
}
