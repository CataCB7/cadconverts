// pages/api/convert-run-md.js
// Pornește conversia MD (SVF2 2D + PDF în manifest) pentru un jobId și salvează statusul în S3.

const PROXY_BASE_URL = process.env.PROXY_BASE_URL;           // https://proxy.cadconverts.com
const APS_BUCKET     = process.env.APS_BUCKET || process.env.BUCKET_NAME;
const REGION_HEADER  = { 'x-ads-region': 'US' };

function b64url(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}

async function getApsToken() {
  const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SCOPES } = process.env;
  if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) throw new Error('APS credentials missing');
  const scopes = APS_SCOPES || 'data:read data:write bucket:read bucket:create';
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: scopes,
    client_id: APS_CLIENT_ID,
    client_secret: APS_CLIENT_SECRET,
  });
  const r = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`APS token failed: ${await r.text()}`);
  return r.json(); // { access_token }
}

// scrie status.json prin proxy /upload (aceeași metodă ca la convert-start)
async function writeStatus(jobId, data) {
  if (!PROXY_BASE_URL) throw new Error('Missing PROXY_BASE_URL');
  if (!APS_BUCKET)     throw new Error('Missing APS_BUCKET');
  const key = `jobs/${jobId}/status.json`;
  const bodyStr = JSON.stringify({ ...(data || {}), updatedAt: new Date().toISOString() });
  const len = Buffer.byteLength(bodyStr);
  const { access_token } = await getApsToken();
  const url = `${PROXY_BASE_URL}/upload?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(key)}&token=${encodeURIComponent(access_token)}`;
  const up  = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', 'Content-Length': String(len) }, body: bodyStr });
  const txt = await up.text();
  if (!up.ok) throw new Error(`/upload failed: ${txt}`);
  return { key, size: len };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ ok:false, error:'Method Not Allowed' });
    }

    // body: { jobId, objectKey, bucket? }
    const { jobId, objectKey } = (req.body && typeof req.body === 'object') ? req.body : {};
    const bucket = (req.body && req.body.bucket) || APS_BUCKET;

    if (!jobId)    return res.status(400).json({ ok:false, error:'Missing jobId' });
    if (!bucket)   return res.status(400).json({ ok:false, error:'Missing bucket' });
    if (!objectKey)return res.status(400).json({ ok:false, error:'Missing objectKey (DWG in OSS)' });

    // 1) token APS
    const { access_token } = await getApsToken();

    // 2) details obiect -> objectId -> urn
    const encodedKey = encodeURIComponent(objectKey);
    const det = await fetch(
      `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucket)}/objects/${encodedKey}/details`,
      { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } }
    );
    const detText = await det.text();
    if (!det.ok) {
      return res.status(det.status).json({ ok:false, step:'details', error:'Failed to get object details', details: detText });
    }
    const details = detText ? JSON.parse(detText) : {};
    const urn = b64url(details.objectId);

    // 3) scriem status: inProgress(md)
    try {
      await writeStatus(jobId, { jobId, status:'inProgress', stage:'md', urn, objectKey, bucket, method:'md' });
    } catch (e) {
      // nu blocăm pornirea jobului dacă scrierea statusului eșuează
      console.warn('[convert-run-md] writeStatus warn:', e?.message || e);
    }

    // 4) lansăm job MD (SVF2 + PDF)
    const jobResp = await fetch('https://developer.api.autodesk.com/modelderivative/v2/designdata/job', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
        ...REGION_HEADER,
        'x-ads-force': 'true',
      },
      body: JSON.stringify({
        input: { urn },
        output: {
          destination: { region: 'us' },
          formats: [
            { type: 'svf2', views: ['2d'], advanced: { '2dviews': 'pdf' } }
          ]
        }
      }),
    });
    const jobText = await jobResp.text();
    if (!jobResp.ok) {
      return res.status(jobResp.status).json({ ok:false, step:'job', error:'Job submit failed', details: jobText, urn });
    }

    // 5) răspuns — în pasul următor adăugăm polling & final update
    return res.status(200).json({ ok:true, jobId, urn, submitted: jobText ? JSON.parse(jobText) : null });
  } catch (err) {
    console.error('[api/convert-run-md] error:', err);
    return res.status(500).json({ ok:false, error:'Internal Server Error' });
  }
}
