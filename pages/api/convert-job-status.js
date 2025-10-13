// pages/api/convert-job-status.js
// Citește statusul jobului (jobs/{jobId}/status.json) din S3 via proxy (/upload → signed GET)

const PROXY_BASE_URL = process.env.PROXY_BASE_URL; // ex: https://proxy.cadconverts.com

async function getSignedGetUrl(key) {
  if (!PROXY_BASE_URL) throw new Error('Missing PROXY_BASE_URL');
  const r = await fetch(`${PROXY_BASE_URL}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // cerem explicit URL semnat de GET
    body: JSON.stringify({ key, method: 'GET', contentType: 'application/json' }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`/upload (GET signer) failed: ${t}`);
  }
  const j = await r.json();
  // acceptăm mai multe denumiri posibile
  return j.getUrl || j.downloadUrl || j.signedUrl || j.url;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    const jobId = String(req.query.jobId || '').trim();
    if (!jobId) return res.status(400).json({ ok: false, error: 'Missing jobId' });

    const key = `jobs/${jobId}/status.json`;

    let url;
    try {
      url = await getSignedGetUrl(key);
    } catch (e) {
      return res
        .status(502)
        .json({ ok: false, error: 'Proxy GET signer failed', detail: String(e?.message || e), key });
    }

    const g = await fetch(url);
    if (g.status === 404) {
      return res.status(200).json({ ok: true, jobId, status: 'queued', missing: true });
    }
    if (!g.ok) {
      const t = await g.text();
      return res.status(g.status).json({ ok: false, error: 'GET status.json failed', detail: t });
    }

    const text = await g.text();
    try {
      const json = text ? JSON.parse(text) : {};
      return res.status(200).json({ ok: true, ...json });
    } catch {
      return res.status(200).json({ ok: true, raw: text });
    }
  } catch (err) {
    console.error('[api/convert-job-status] error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
