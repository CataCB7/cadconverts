// pages/api/convert.js
// Lansează conversia Model Derivative: DWG/DXF -> SVF2 (2D) pentru viewer

async function getApsToken() {
  const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SCOPES } = process.env;
  if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
    throw new Error("APS credentials missing");
  }
  const scopes = APS_SCOPES || "data:read data:write bucket:read";
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: scopes,
    client_id: APS_CLIENT_ID,
    client_secret: APS_CLIENT_SECRET,
  });
  const r = await fetch(
    "https://developer.api.autodesk.com/authentication/v2/token",
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }
  );
  if (!r.ok) throw new Error(`APS token failed: ${await r.text()}`);
  return r.json(); // { access_token }
}

function toBase64Url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        hint: "POST { bucket, objectKey } to start DWG/DXF -> SVF2 (2D) conversion.",
      });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", ["GET", "POST"]);
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Acceptăm format param dar implicit folosim svf2 2d (stabil pentru DWG/DXF)
    const { bucket, objectKey, format = "svf2" } = req.body || {};
    if (!bucket || !objectKey) {
      return res.status(400).json({ error: "Missing bucket or objectKey" });
    }
    if (format !== "svf2") {
      return res.status(400).json({ error: "Unsupported format (use svf2)" });
    }

    const { access_token } = await getApsToken();

    // 1) Detalii obiect (obținem objectId)
    const encodedKey = encodeURIComponent(objectKey);
    const det = await fetch(
      `https://developer.api.autodesk.com/oss/v2/buckets/${bucket}/objects/${encodedKey}/details`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const detText = await det.text();
    if (!det.ok) {
      return res
        .status(det.status)
        .json({ error: "Failed to get object details", details: detText });
    }
    const details = detText ? JSON.parse(detText) : {};
    const urn = toBase64Url(details.objectId);

    // 2) Lansăm jobul de conversie -> SVF2 (2D)
    const jobResp = await fetch(
      "https://developer.api.autodesk.com/modelderivative/v2/designdata/job",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
          "x-ads-region": "US",
        },
        body: JSON.stringify({
          input: { urn },
          output: { formats: [{ type: "svf2", views: ["2d"] }] },
        }),
      }
    );

    const jobText = await jobResp.text();
    if (!jobResp.ok) {
      return res.status(jobResp.status).json({
        error: "Job submit failed",
        details: jobText,
      });
    }

    // Returnăm URN + payload job (pt. status ulterior)
    return res.status(200).json({
      ok: true,
      urn,
      job: jobText ? JSON.parse(jobText) : null,
    });
  } catch (err) {
    console.error("convert api error:", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
