// pages/api/plot-pdf.js
// WorkItem (Design Automation) DWG/DXF -> PDF fără signedS3 (folosește OSS direct cu Authorization)

const REGION = "us-east";
const REGION_HEADER = { "x-ads-region": "US" };

// IMPORTANT: Owner = client_id-ul tău real (din lista de activități DA).
// În listă apare "EPmFz0UAj3EnrmZUiG2gsWNnp6355MphkqG6PKpXAqQ0gtXy.PlotToPDF+$LATEST"
// Deci folosim pipe format + $LATEST:
const OWNER_CLIENT_ID = "EPmFz0UAj3EnrmZUiG2gsWNnp6355MphkqQ0gtXy";
const ACTIVITY_ID = `${OWNER_CLIENT_ID}|PlotToPDF+$LATEST`; // <- CHEIA: ID corect

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

    // rezultatul îl numim unic ca să nu suprascriem
    const baseName = objectKey.replace(/\.[^.]+$/, "");
    const resultKey = outKey || `${baseName}-${Date.now()}.pdf`;

    // 1) token
    const { access_token } = await getApsToken();

    // 2) validăm inputul există în OSS
    await ensureObjectExists(access_token, bucket, objectKey);

    // 3) URL-uri OSS directe (DA va face GET/PUT cu header Authorization)
    const inputUrl  = `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(objectKey)}`;
    const outputUrl = `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(resultKey)}`;

    // LISP + script din site (public)
    const base = process.env.NEXT_PUBLIC_BASE_URL || "https://www.cadconverts.com";
    const lispUrl = `${base}/da/plot.lsp`;
    const scriptUrl = `${base}/da/script.scr`;

    // 4) Creează WorkItem
    const wi = await fetch(`https://developer.api.autodesk.com/da/${REGION}/v3/workitems`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        ...REGION_HEADER
      },
      body: JSON.stringify({
        // !!! activitatea corectă, cu owner-ul tău real + $LATEST
        activityId: ACTIVITY_ID,
        arguments: {
          inputFile: {
            url: inputUrl,
            headers: {
              Authorization: `Bearer ${access_token}`,
              "x-ads-region": "US"
            }
          },
          resultPdf: {
            url: outputUrl,
            verb: "put",
            headers: {
              Authorization: `Bearer ${access_token}`,
              "Content-Type": "application/octet-stream",
              "x-ads-region": "US"
            }
          },
          lisp:   { url: lispUrl },
          script: { url: scriptUrl }
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
