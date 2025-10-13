// pages/api/download-md-pdf.js
// Descarcă PDF-ul generat de Model Derivative pentru un jobId.

const PROXY_BASE_URL = process.env.PROXY_BASE_URL;
const APS_BUCKET     = process.env.APS_BUCKET || process.env.BUCKET_NAME;
const REGION_HEADER  = { 'x-ads-region': 'US' };

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

// citește status.json via signed download prin proxy
async function readStatus(jobId) {
  const key = `jobs/${jobId}/status.json`;
  const { access_token } = await getApsToken();
  const sign = await fetch(`${PROXY_BASE_URL}/download-sign?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(key)}&token=${encodeURIComponent(access_token)}`, { headers: REGION_HEADER });
  if (sign.status === 404) return null;
  const stxt = await sign.text();
  if (!sign.ok) throw new Error(`download-sign failed: ${stxt}`);
  const sj = stxt ? JSON.parse(stxt) : {};
  const url = sj.url || (Array.isArray(sj.urls) && sj.urls[0]) || sj.downloadUrl;
  if (!url) throw new Error('No signed download url for status.json');
  const g = await fetch(url);
  if (!g.ok) return null;
  const text = await g.text();
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ ok:false, error:'Method Not Allowed' });
    }

    const jobId = String(req.query.jobId || '').trim();
    if (!jobId) return res.status(400).json({ ok:false, error:'Missing jobId' });

    const st = await readStatus(jobId);
    if (!st || st.status !== 'done' || !st.pdf || !st.pdf.urn) {
      return res.status(400).json({ ok:false, error:'PDF not ready. Poll until status=done.' });
    }

    const { access_token } = await getApsToken();

    // Derivative asset download (PDF) – folosim derivativ URN din manifest
    const assetUrl = `https://developer.api.autodesk.com/derivativeservice/v2/derivatives/${encodeURIComponent(st.pdf.urn)}`;
    const dl = await fetch(assetUrl, { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } });

    if (!dl.ok) {
      const t = await dl.text().catch(() => '');
      return res.status(dl.status).json({ ok:false, error:'PDF download failed', detail:t });
    }

    const ab = await dl.arrayBuffer();
    const buf = Buffer.from(ab);

    res.setHeader('Content-Type', st.pdf.mime || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${(st.pdf.name || 'result.pdf').replace(/"/g, '')}"`);
    res.setHeader('Content-Length', String(buf.length));
    return res.status(200).send(buf);
  } catch (err) {
    console.error('[api/download-md-pdf] error:', err);
    return res.status(500).json({ ok:false, error:'Internal Server Error' });
  }
}
