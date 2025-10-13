// pages/api/convert-run-da.js
// Pornește Design Automation (AutoCAD.PlotToPDF) pentru un jobId + objectKey (DWG),
// marchează statusul în S3 și returnează detalii WorkItem.
//
// Necesită în Vercel (Environment Variables):
//  - PROXY_BASE_URL = https://proxy.cadconverts.com
//  - APS_BUCKET     = <bucketul tău APS/OSS>
//  - DA_ACTIVITY_ID = AutoCAD.PlotToPDF+25_0   (sau activitatea ta custom)
//  - APS_CLIENT_ID / APS_CLIENT_SECRET
//
// Flux output: DA va POST-a PDF-ul la
//  PROXY_BASE_URL/ingest-pdf?bucket=APS_BUCKET&objectKey=jobs/<jobId>/da/result.pdf
// Apoi poți citi statusul cu /api/convert-job-status?jobId=<id> și/sau implementa un poll separat pentru DA.

const PROXY_BASE_URL = process.env.PROXY_BASE_URL;
const APS_BUCKET     = process.env.APS_BUCKET || process.env.BUCKET_NAME;
const DA_ACTIVITY_ID = process.env.DA_ACTIVITY_ID || 'AutoCAD.PlotToPDF+25_0';
const REGION_HEADER  = { 'x-ads-region': 'US' };

function assertEnv() {
  const miss = [];
  if (!PROXY_BASE_URL) miss.push('PROXY_BASE_URL');
  if (!APS_BUCKET)     miss.push('APS_BUCKET');
  if (!DA_ACTIVITY_ID) miss.push('DA_ACTIVITY_ID');
  if (miss.length) throw new Error('Missing env: ' + miss.join(', '));
}

async function getApsTokenDA() {
  // Pentru DA ai nevoie de "code:all" pe lângă data/bucket
  const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SCOPES } = process.env;
  if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) throw new Error('APS credentials missing');
  const scopes = APS_SCOPES || 'data:read data:write bucket:read bucket:create code:all';
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
  const t = await r.text();
  if (!r.ok) throw new Error(`APS token failed: ${t}`);
  return JSON.parse(t); // { access_token }
}

async function signedDownload(objectKey, access_token) {
  const u = `${PROXY_BASE_URL}/download-sign` +
            `?bucket=${encodeURIComponent(APS_BUCKET)}` +
            `&objectKey=${encodeURIComponent(objectKey)}` +
            `&token=${encodeURIComponent(access_token)}`;
  const r = await fetch(u, { headers: REGION_HEADER });
  const txt = await r.text();
  if (!r.ok) throw new Error(`download-sign failed: ${txt}`);
  const j = txt ? JSON.parse(txt) : {};
  return j.url || (Array.isArray(j.urls) && j.urls[0]) || j.downloadUrl;
}

async function writeStatus(jobId, data) {
  const key = `jobs/${jobId}/status.json`;
  const bodyStr = JSON.stringify({ ...(data||{}), updatedAt: new Date().toISOString() });
  const len = Buffer.byteLength(bodyStr);
  const { access_token } = await getApsTokenDA();
  const url = `${PROXY_BASE_URL}/upload?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(key)}&token=${encodeURIComponent(access_token)}`;
  const up  = await fetch(url, { method: 'POST', headers: { 'Content-Type':'application/json', 'Content-Length': String(len) }, body: bodyStr });
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
    assertEnv();

    // body: { jobId, objectKey }
    const { jobId, objectKey } = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!jobId)     return res.status(400).json({ ok:false, error:'Missing jobId' });
    if (!objectKey) return res.status(400).json({ ok:false, error:'Missing objectKey (.dwg)' });

    // 1) token DA
    const { access_token } = await getApsTokenDA();

    // 2) signed download pentru DWG
    let inputUrl;
    try {
      inputUrl = await signedDownload(objectKey, access_token);
    } catch (e) {
      return res.status(502).json({ ok:false, step:'signed-download', error:String(e?.message || e) });
    }

    // 3) endpointul de ingestie PDF (proxy -> S3)
    const resultKey = `jobs/${jobId}/da/result.pdf`;
    const outputUrl = `${PROXY_BASE_URL}/ingest-pdf?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(resultKey)}`;

    // 4) marcăm status: DA inProgress
    try {
      await writeStatus(jobId, {
        jobId,
        status: 'inProgress',
        stage:  'da',
        method: 'da',
        input: { bucket: APS_BUCKET, objectKey },
        output: { bucket: APS_BUCKET, objectKey: resultKey },
      });
    } catch (e) {
      // nu blocăm
      console.warn('[convert-run-da] writeStatus warn:', e?.message || e);
    }

    // 5) creăm WorkItem DA
    // NOTĂ: argumentele depind de Activity. Pentru AutoCAD.PlotToPDF+25_0 de obicei:
    //  - "HostDwg": input file
    //  - "Result":  output pdf
    // Dacă ai un activity custom, ajustează numele parametrilor aici să corespundă.
    const wiPayload = {
      activityId: DA_ACTIVITY_ID,
      arguments: {
        HostDwg: { url: inputUrl, verb: 'get' },
        Result:  { url: outputUrl, verb: 'post' }
      }
    };

    const wiResp = await fetch('https://developer.api.autodesk.com/da/us-east/v3/workitems', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(wiPayload),
    });
    const wiText = await wiResp.text();
    if (!wiResp.ok) {
      return res.status(wiResp.status).json({ ok:false, step:'workitem', error:'DA workitem failed', detail: wiText });
    }
    const wi = wiText ? JSON.parse(wiText) : null;

    // 6) răspuns; pentru status live poți apela separat un poll DA sau te uiți în logs/status.json după ingest
    return res.status(200).json({
      ok: true,
      jobId,
      activityId: DA_ACTIVITY_ID,
      input: { objectKey, url: inputUrl },
      output: { objectKey: resultKey, ingest: outputUrl },
      workitem: wi,
    });
  } catch (err) {
    console.error('[api/convert-run-da] error:', err);
    return res.status(500).json({ ok:false, error:'Internal Server Error' });
  }
}
