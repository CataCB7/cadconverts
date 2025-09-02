// pages/api/plot-pdf.js
// Lansează un WorkItem DA (AutoCAD Plot to PDF) folosind proxy-ul tău
// pentru download/upload din/în OSS (evităm endpointurile „legacy”).
//
// Input:  POST { bucket, objectKey, outKey? }
// Output: { ok, workitemId, resultKey }

const REGION = "us-east"; // clustere DA
const DA_ACTIVITY = "AutoCAD.PlotToPDF+25_0"; // activitatea shared de la Autodesk

// URL de bază al proxy-ului tău (setat în Vercel env)
const PROXY_BASE = process.env.NEXT_PUBLIC_PROXY_BASE || "https://proxy.cadconverts.com";

async function getApsToken(scopes = "code:all data:read data:write bucket:read bucket:create") {
  const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;
  if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
    throw new Error("Missing APS_CLIENT_ID/APS_CLIENT_SECRET");
  }
  const form = new URLSearchParams({
    client_id: APS_CLIENT_ID,
    client_secret: APS_CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: scopes,
  });
  const r = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!r.ok) throw new Error(`APS token failed: ${await r.text()}`);
  return r.json(); // { access_token }
}

// doar ca sanity-check: obiectul există în bucket?
async function ensureObjectExists(access_token, bucket, objectKey) {
  const r = await fetch(
    `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(objectKey)}/details`,
    { headers: { Authorization: `Bearer ${access_token}`, "x-ads-region": "US" } }
  );
  if (!r.ok) throw new Error(`object not found: ${await r.text()}`);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { bucket, objectKey, outKey } = req.body || {};
    if (!bucket || !objectKey) {
      return res.status(400).json({ error: "Missing bucket or objectKey" });
    }
    const baseName = objectKey.replace(/\.[^.]+$/, "");
    const resultKey = outKey || `${baseName}-plot.pdf`;

    // 1) token APS
    const { access_token } = await getApsToken();

    // 2) verifică inputul
    await ensureObjectExists(access_token, bucket, objectKey);

    // 3) construiește URL-urile prin PROXY (cu token ca query)
    const qsIn  = new URLSearchParams({ bucket, objectKey, token: access_token }).toString();
    const qsOut = new URLSearchParams({ bucket, objectKey: resultKey, token: access_token }).toString();

    const INPUT_URL  = `${PROXY_BASE}/oss-download?${qsIn}`; // GET prin proxy (proxy pune Bearer către OSS)
    const OUTPUT_URL = `${PROXY_BASE}/oss-upload?${qsOut}`;  // PUT prin proxy (proxy pune Bearer către OSS)

    // 4) creează workitem pe activitatea shared (nu mai folosim id-ul personalizat)
    const wi = await fetch(`https://developer.api.autodesk.com/da/${REGION}/v3/workitems`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "x-ads-region": "US",
      },
      body: JSON.stringify({
        activityId: DA_ACTIVITY,
        arguments: {
          // AutoCAD.PlotToPDF+25_0 așteaptă:
          // - HostDwg (GET)  -> fișierul DWG
          // - Result  (PUT)  -> PDF-ul rezultat (nume local: result.pdf)
          HostDwg:  { url: INPUT_URL,  verb: "get" },
          Result:   { url: OUTPUT_URL, verb: "put" },
        },
      }),
    });

    const wiText = await wi.text();
    if (!wi.ok) {
      return res.status(wi.status).json({ error: "workitem create failed", details: wiText });
    }
    const wiData = wiText ? JSON.parse(wiText) : {};

    return res.status(200).json({
      ok: true,
      workitemId: wiData.id || wiData.workitemId || null,
      resultKey,
    });
  } catch (e) {
    console.error("plot-pdf error:", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
