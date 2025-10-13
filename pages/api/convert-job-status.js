// pages/api/convert-job-status.js
// Citește jobs/{jobId}/status.json direct din Autodesk OSS (fără proxy)

const APS_BUCKET = process.env.APS_BUCKET; // setat deja în Vercel
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
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }
    if (!APS_BUCKET) return res.status(500).json({ ok:false, error:'Missing APS_BUCKET' });

    const jobId = String(req.query.jobId || '').trim();
    if (!jobId) return res.status(400).json({ ok:false, error:'Missing jobId' });

    const objectKey = `jobs/${jobId}/status.json`;
    const { access_token } = await getApsToken();

    // GET direct din Autodesk OSS (conținutul fișierului)
    const url = `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(APS_BUCKET)}/objects/${encodeURIComponent(objectKey)}`;
    const g = await fetch(url, { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } });

    if (g.status === 404) {
      // încă nu există => tratăm ca queued
      return res.status(200).json({ ok:true, jobId, status:'queued', missing:true });
    }
    if (!g.ok) {
      const t = await g.text();
      return res.status(g.status).json({ ok:false, error:'OSS GET failed', detail:t });
    }

    const text = await g.text();
    try {
      const json = text ? JSON.parse(text) : {};
      return res.status(200).json({ ok:true, ...json });
    } catch {
      // dacă cineva a scris non-JSON, returnăm raw pentru debug
      return res.status(200).json({ ok:true, raw:text });
    }
  } catch (err) {
    console.error('[api/convert-job-status] error:', err);
    return res.status(500).json({ ok:false, error:'Internal Server Error' });
  }
}
