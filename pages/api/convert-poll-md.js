// pages/api/convert-poll-md.js
// Verifică manifestul MD pentru jobId; dacă PDF-ul e gata -> marchează jobul ca done.

const PROXY_BASE_URL = process.env.PROXY_BASE_URL;
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

// scrie status.json via proxy /upload
async function writeStatus(jobId, data) {
  if (!PROXY_BASE_URL) throw new Error('Missing PROXY_BASE_URL');
  if (!APS_BUCKET)     throw new Error('Missing APS_BUCKET');
  const key = `jobs/${jobId}/status.json`;
  const bodyStr = JSON.stringify({ ...(data||{}), updatedAt: new Date().toISOString() });
  const len = Buffer.byteLength(bodyStr);
  const { access_token } = await getApsToken();
  const url = `${PROXY_BASE_URL}/upload?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(key)}&token=${encodeURIComponent(access_token)}`;
  const up  = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', 'Content-Length': String(len) }, body: bodyStr });
  const txt = await up.text();
  if (!up.ok) throw new Error(`/upload failed: ${txt}`);
  return { key, size: len };
}

// găsește primul derivativ PDF din manifest
function findPdfDerivative(manifest) {
  if (!manifest || !Array.isArray(manifest.derivatives)) return null;
  for (const d of manifest.derivatives) {
    // in SVF2 2D, PDF-ul apare de obicei cu mime "application/pdf"
    if (d.outputType === 'pdf' || d.mime === 'application/pdf') {
      // în multe cazuri href e direct pe PDF
      if (d.urn) return { urn: d.urn, mime: d.mime || 'application/pdf', name: d.name || 'result.pdf' };
    }
    // cautăm în children
    if (Array.isArray(d.children)) {
      const stack = [...d.children];
      while (stack.length) {
        const c = stack.shift();
        if ((c.mime === 'application/pdf' || c.role === 'pdf') && c.urn) {
          return { urn: c.urn, mime: c.mime || 'application/pdf', name: c.name || 'result.pdf' };
        }
        if (Array.isArray(c.children)) stack.push(...c.children);
      }
    }
  }
  return null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ ok:false, error:'Method Not Allowed' });
    }
    const jobId = String(req.query.jobId || '').trim();
    if (!jobId) return res.status(400).json({ ok:false, error:'Missing jobId' });

    // 1) citim status curent (ca să avem urn)
    const cur = await readStatus(jobId);
    if (!cur || !cur.urn) {
      return res.status(200).json({ ok:true, jobId, status:'queued', missing:true });
    }
    const urn = cur.urn;

    // 2) token și manifest
    const { access_token } = await getApsToken();
    const mr = await fetch(`https://developer.api.autodesk.com/modelderivative/v2/designdata/${encodeURIComponent(urn)}/manifest`, {
      headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER }
    });
    const mtxt = await mr.text();
    if (!mr.ok) {
      return res.status(mr.status).json({ ok:false, error:'manifest error', details: mtxt });
    }
    const manifest = mtxt ? JSON.parse(mtxt) : {};
    const progress = manifest.progress || '';
    const status   = manifest.status || '';

    // 3) dacă e gata și avem PDF -> DONE
    const pdf = findPdfDerivative(manifest);
    if (status === 'success' && pdf && pdf.urn) {
      const newStatus = {
        jobId,
        status: 'done',
        stage: 'md',
        urn,
        pdf: { urn: pdf.urn, name: pdf.name || 'result.pdf', mime: pdf.mime || 'application/pdf' },
        method: 'md'
      };
      try { await writeStatus(jobId, newStatus); } catch (e) { /* nu blocăm răspunsul */ }
      return res.status(200).json({ ok:true, ...newStatus });
    }

    // 4) altfel, încă în progres
    const inprog = { jobId, status:'inProgress', stage:'md', urn, method:'md', progress, manifestStatus: status };
    try { await writeStatus(jobId, inprog); } catch (e) {}
    return res.status(200).json({ ok:true, ...inprog });
  } catch (err) {
    console.error('[api/convert-poll-md] error:', err);
    return res.status(500).json({ ok:false, error:'Internal Server Error' });
  }
}
