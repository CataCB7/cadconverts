// pages/api/plot-pdf.js
// Lansează un WorkItem (Automation API / Design Automation) pentru DWG/DXF -> PDF
// Input body: { bucket, objectKey, outKey? }
// Output: { ok, workitemId, resultKey }

const REGION = "us-east";
const REGION_HEADER = { "x-ads-region": "US" }; // important pentru unele conturi/zones

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
  return id; // folosim clientId ca owner
}

// verificăm că obiectul există înainte să cerem signed URL
async function ensureObjectExists(access_token, bucket, objectKey) {
  const r = await fetch(
    `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(objectKey)}/details`,
    { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } }
  );
  const t = await r.text();
  if (!r.ok) throw new Error(`object not found: ${t}`);
}

// folosim POST cu JSON + x-ads-region pentru signed download
async function makeSignedDownload(access_token, bucket, objectKey, minutes = 60) {
  const r = await fetch(
    `https://developer.api.autodesk.com/oss/v2/signeds3/download`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        ...REGION_HEADER
      },
      body: JSON.stringify({
        bucketKey: bucket,
        objectKey,
        minutesExpiration: minutes
      })
    }
  );
  const t = await r.text();
  if (!r.ok) throw new Error(`signed download failed: ${t}`);
  return JSON.parse(t); // { url, expiration }
}

// folosim POST cu JSON + x-ads-region pentru signed upload
async function makeSignedUpload(access_token, bucket, objectKey, minutes = 60) {
  const r = await fetch(
    `https://developer.api.autodesk.com/oss/v2/signeds3/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        ...REGION_HEADER
      },
      body: JSON.stringify({
        bucketKey: bucket,
        objectKey,
        minutesExpiration: minutes
      })
    }
  );
  const t = await r.text();
  if (!r.ok) throw new Error(`signed upload failed: ${t}`);
  return JSON.parse(t); // { url, expiration }
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
    const resultKey = outKey || (objectKey.replace(/\.[^.]+$/, "") + ".pdf");

    // 1) token
    const { access_token } = await getApsToken();

    // 2) validăm că obiectul există în bucket
    await ensureObjectExists(access_token, bucket, objectKey);

    // 3) pre-signed URLs (input GET, output PUT)
    const input = await makeSignedDownload(access_token, bucket, objectKey, 60);
    const output = await makeSignedUpload(access_token, bucket, resultKey, 60);

    // 4) workitem către activitatea <clientId>.PlotToPDF
    const owner = ownerFromEnv();
    const activityId = `${owner}.PlotToPDF`;

    const base = process.env.NEXT_PUBLIC_BASE_URL || "https://www.cadconverts.com";
    const lispUrl = `${base}/da/plot.lsp`;
    const scriptUrl = `${base}/da/script.scr`;

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
          inputFile: { url: input.url },                // GET din OSS
          resultPdf: { url: output.url, verb: "put" },  // PUT în OSS
          lisp: { url: lispUrl },                       // public GET
          script: { url: scriptUrl },                   // public GET
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
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
