// pages/api/convert-start.js
// Persistă statusul inițial în S3 prin PROXY /upload (bucket+objectKey+token)

import crypto from 'crypto'

const PROXY_BASE_URL = process.env.PROXY_BASE_URL;            // ex: https://proxy.cadconverts.com
const APS_BUCKET     = process.env.APS_BUCKET || process.env.BUCKET_NAME; // numele bucketului OSS/S3

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

async function saveInitialStatus({ jobId, method, filename, size }) {
  if (!PROXY_BASE_URL) throw new Error('Missing PROXY_BASE_URL');
  if (!APS_BUCKET)     throw new Error('Missing APS_BUCKET (bucket name)');

  const key = `jobs/${jobId}/status.json`;
  const statusObj = {
    jobId,
    status: 'queued',
    method,
    received: { filename, size },
    updatedAt: new Date().toISOString(),
  };
  const bodyStr = JSON.stringify(statusObj);
  const contentLength = Buffer.byteLength(bodyStr);

  // token APS — proxy-ul cere ?token= în query
  const { access_token } = await getApsToken();

  const url = `${PROXY_BASE_URL}/upload?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(key)}&token=${encodeURIComponent(access_token)}`;

  const up = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(contentLength),
    },
    body: bodyStr,
  });

  const txt = await up.text();
  if (!up.ok) throw new Error(`/upload failed: ${txt}`);

  return { saved: true, key, size: contentLength };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const preferHighQuality = !!body.preferHighQuality;
    const filename = body.filename ?? null;
    const size     = body.size ?? null;

    const jobId  = (crypto.randomUUID ? crypto.randomUUID() : crypto.createHash('sha256').update(String(Date.now())+Math.random()).digest('hex').slice(0,36));
    const method = preferHighQuality ? 'da' : 'md';

    let persist = { saved: false };
    try {
      persist = await saveInitialStatus({ jobId, method, filename, size });
    } catch (e) {
      // întoarcem cauza ca să o vezi în browser
      persist = { saved: false, error: String(e?.message || e) };
    }

    return res.status(200).json({ ok: true, jobId, status: 'queued', method, received: { filename, size }, persist });
  } catch (err) {
    console.error('[api/convert-start] error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
