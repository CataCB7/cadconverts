// pages/api/plot-pdf.js
// WorkItem (Design Automation) DWG/DXF -> PDF
// Folosește input din OSS (cu token) și TRIMITE PDF-ul către proxy-ul tău /ingest-pdf (POST)

const REGION = "us-east";
const REGION_HEADER = { "x-ads-region": "US" };

async function getApsToken(scopes = "code:all data:read data:write bucket:read bucket:create") {
  const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;
  if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
    throw new Error("Missing APS_CLIENT_ID/APS_CLIENT_SECRET");
  }
  const body = new URLSearchParams({
    client_id: APS_CLIENT_ID,
    client_secret: APS_CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: scopes,
  });
  const r = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function ownerFromEnv() {
  const id = process.env.APS_CLIENT_ID;
  if (!id) throw new Error("Missing APS_CLIENT_ID");
  return id; // <clientId>.PlotToPDF
}

async function ensureObjectExists(access_token, bucket, objectKey) {
  const r = await fetch(
    `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(objectKey)}/details`,
    { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } }
  );
  const t = await r.text();
  if (!r.ok) throw new Error(`object not found: ${t}`);
  return t ? JSON.parse(t) : {};
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
    const resultKey = outKey || `${baseName}-${Date.now()}.pdf`;

    // 1) token
    const { access_token } = await getApsToken();

    // 2) validăm inputul
    await ensureObjectExists(access_token, bucket, objectKey);

    // 3) activitate DA shared
    const activityId = "AutoCAD.PlotToPDF+25_0"; // activitatea publică

    // 4) URL-uri: input din OSS cu Authorization header; output = PROXY (POST)
    const inputUrl  = `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(objectKey)}`;

    // proxy public (domeniul tău) care va primi PDF-ul și îl urcă în OSS cu token server-to-server
    const proxyBase = process.env.NEXT_PUBLIC_PROXY_BASE || "https://proxy.cadconverts.com"; // <- dacă nu ai subdomeniu, pune direct "https://<IP>:3000"
    const ingestUrl = `${proxyBase}/ingest-pdf?bucket=${encodeURIComponent(bucket)}&objectKey=${encodeURIComponent(resultKey)}`;

    const wi = await fetch(`https://developer.api.autodesk.com/da/${REGION}/v3/workitems`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        ...REGION_HEADER
      },
      body: JSON.stringify({
        activityId,
        arguments: {
          HostDwg: {
            url: inputUrl,
            headers: {
              Authorization: `Bearer ${access_token}`,
              "x-ads-region": "US"
            },
            verb: "get"
          },
          Result: {
            url: ingestUrl,
            headers: {
              "Content-Type": "application/pdf"
            },
            verb: "post" // foarte important: DA va POST-a PDF-ul la /ingest-pdf
          }
        }
      })
    });

    const wiText = await wi.text();
    if (!wi.ok) {
      return res.status(wi.status).json({ error: "workitem create failed", details: wiText });
    }
    const wiData = wiText ? JSON.parse(wiText) : {};
    return res.status(200).json({
      ok: true,
      workitemId: wiData.id || wiData.workitemId || null,
      resultKey
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
