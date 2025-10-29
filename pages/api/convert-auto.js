// pages/api/convert-auto.js
// Orchestrates: MD first (DWG/DXF -> PDF in manifest), poll briefly, if fail/timeout -> start DA fallback.
// Writes jobs/{jobId}/status.json along the way.

const PROXY_BASE_URL = process.env.PROXY_BASE_URL;
const APS_BUCKET     = process.env.APS_BUCKET || process.env.BUCKET_NAME;
const REGION_HEADER  = { "x-ads-region": "US" };

function b64url(str) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getApsToken() {
  const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SCOPES } = process.env;
  if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) throw new Error("APS credentials missing");
  const scopes = APS_SCOPES || "data:read data:write bucket:read bucket:create code:all";
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: scopes,
    client_id: APS_CLIENT_ID,
    client_secret: APS_CLIENT_SECRET,
  });
  const r = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`APS token failed: ${t}`);
  return JSON.parse(t); // { access_token }
}

async function writeStatus(jobId, data) {
  if (!PROXY_BASE_URL) throw new Error("Missing PROXY_BASE_URL");
  if (!APS_BUCKET)     throw new Error("Missing APS_BUCKET");
  const key = `jobs/${jobId}/status.json`;
  const bodyStr = JSON.stringify({ ...(data || {}), updatedAt: new Date().toISOString() });
  const len = Buffer.byteLength(bodyStr);
  const { access_token } = await getApsToken();
  const url = `${PROXY_BASE_URL}/upload?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(key)}&token=${encodeURIComponent(access_token)}`;
  const up  = await fetch(url, { method: "POST", headers: { "Content-Type":"application/json", "Content-Length": String(len) }, body: bodyStr });
  const txt = await up.text();
  if (!up.ok) throw new Error(`/upload failed: ${txt}`);
  return { key, size: len };
}

async function getObjectUrn(objectKey, access_token) {
  const det = await fetch(
    `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(APS_BUCKET)}/objects/${encodeURIComponent(objectKey)}/details`,
    { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } }
  );
  const detText = await det.text();
  if (!det.ok) throw new Error(`details failed: ${detText}`);
  const details = detText ? JSON.parse(detText) : {};
  return b64url(details.objectId);
}

async function submitMD(urn, access_token) {
  const r = await fetch("https://developer.api.autodesk.com/modelderivative/v2/designdata/job", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
      ...REGION_HEADER,
      "x-ads-force": "true",
    },
    body: JSON.stringify({
      input: { urn },
      output: {
        destination: { region: "us" },
        formats: [{ type: "svf2", views: ["2d"], advanced: { "2dviews": "pdf" } }],
      },
    }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`MD submit failed: ${t}`);
  return t ? JSON.parse(t) : null;
}

async function getManifest(urn, access_token) {
  const r = await fetch(
    `https://developer.api.autodesk.com/modelderivative/v2/designdata/${encodeURIComponent(urn)}/manifest`,
    { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } }
  );
  const t = await r.text();
  if (!r.ok) {
    // Manifest can 404/202 while processing; bubble info to caller
    return { ok: false, status: r.status, text: t };
  }
  return { ok: true, manifest: t ? JSON.parse(t) : {} };
}

function manifestHasPdf(manifest) {
  // Quick check: look for derivative type 'resource', mime 'application/pdf'
  try {
    const { derivatives = [] } = manifest || {};
    for (const d of derivatives) {
      if ((d.outputType === "svf2" || d.outputType === "svf") && Array.isArray(d.children)) {
        for (const c of d.children) {
          if (c.mime === "application/pdf" || String(c.name || "").toLowerCase().endsWith(".pdf")) return true;
        }
      }
    }
  } catch {}
  return false;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    // body: { jobId, objectKey, mdWaitMs?, mdPollEveryMs? }
    const { jobId, objectKey } = (req.body && typeof req.body === "object") ? req.body : {};
    const mdWaitMs = Math.max(0, parseInt(req.body?.mdWaitMs ?? 45000, 10));   // total time to wait MD
    const mdPollMs = Math.max(1000, parseInt(req.body?.mdPollEveryMs ?? 3000, 10));

    if (!jobId)     return res.status(400).json({ ok:false, error:"Missing jobId" });
    if (!objectKey) return res.status(400).json({ ok:false, error:"Missing objectKey" });
    if (!APS_BUCKET) return res.status(500).json({ ok:false, error:"Missing APS_BUCKET / BUCKET_NAME" });

    const { access_token } = await getApsToken();

    // 1) Compute URN for this object
    const urn = await getObjectUrn(objectKey, access_token);

    // 2) Flag status: trying MD
    await writeStatus(jobId, { jobId, status:"inProgress", stage:"md", method:"md", urn, objectKey, bucket: APS_BUCKET });

    // 3) Submit MD
    const mdSubmit = await submitMD(urn, access_token);

    // 4) Poll manifest briefly for PDF
    const startedAt = Date.now();
    let lastManifest = null;
    while (Date.now() - startedAt < mdWaitMs) {
      await sleep(mdPollMs);
      const m = await getManifest(urn, access_token);
      if (m.ok) {
        lastManifest = m.manifest;
        if (manifestHasPdf(lastManifest)) {
          // Success via MD
          await writeStatus(jobId, { jobId, status:"done", stage:"md", method:"md", urn, objectKey, bucket: APS_BUCKET, via:"md" });
          return res.status(200).json({ ok:true, via:"md", jobId, urn, manifest:lastManifest });
        }
      } else {
        // continue polling on 202/404
      }
    }

    // 5) MD did not produce PDF in time -> fallback to DA
    await writeStatus(jobId, { jobId, status:"fallback", stage:"da", method:"da", reason:"md_timeout_or_no_pdf", urn, objectKey, bucket: APS_BUCKET });

    // Call your existing DA endpoint locally
    const daResp = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "https://www.cadconverts.com"}/api/convert-run-da`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ jobId, objectKey })
    });
    const daText = await daResp.text();
    if (!daResp.ok) {
      await writeStatus(jobId, { jobId, status:"failed", stage:"da", method:"da", reason:"da_submit_failed", details: daText });
      return res.status(502).json({ ok:false, via:"da", error:"DA submit failed", details: daText });
    }
    const da = daText ? JSON.parse(daText) : null;

    // Mark as "da_started" — final PDF will arrive via /ingest-pdf and you can detect completion from status.json or by HEADing the object.
    await writeStatus(jobId, { jobId, status:"inProgress", stage:"da", method:"da", urn, objectKey, bucket: APS_BUCKET, workitem: da?.workitem || null });

    return res.status(200).json({ ok:true, via:"da", jobId, urn, workitem: da?.workitem || null, mdSubmit });
  } catch (err) {
    console.error("[api/convert-auto] error:", err);
    return res.status(500).json({ ok:false, error:"Internal Server Error" });
  }
}
