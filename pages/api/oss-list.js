// pages/api/oss-list.js
// Listează obiecte din bucketul APS (OSS) ca să găsești objectKey-ul corect

const APS_BUCKET = process.env.APS_BUCKET || process.env.BUCKET_NAME;
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
    if (!APS_BUCKET) return res.status(500).json({ ok:false, error:'Missing APS_BUCKET' });

    const prefix = String(req.query.prefix || '');
    const limit  = Math.min(100, Number(req.query.limit || 50));

    const { access_token } = await getApsToken();

    const url = `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(APS_BUCKET)}/objects?limit=${limit}` +
                (prefix ? `&beginsWith=${encodeURIComponent(prefix)}` : '');

    const r = await fetch(url, { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } });
    const t = await r.text();
    if (!r.ok) return res.status(r.status).json({ ok:false, error:'List failed', detail:t });

    const j = t ? JSON.parse(t) : {};
    // Returnăm doar câmpurile utile
    const items = Array.isArray(j.items) ? j.items.map(it => ({
      objectKey: it.objectKey,
      size: it.size,
      lastModified: it.lastModified
    })) : [];

    return res.status(200).json({ ok:true, bucket: APS_BUCKET, count: items.length, items });
  } catch (err) {
    console.error('[api/oss-list] error:', err);
    return res.status(500).json({ ok:false, error:'Internal Server Error' });
  }
}
