// pages/api/convert-status.js
// Returnează manifestul Model Derivative pentru un URN (status conversie)

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

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      return res.status(405).json({ error: "Method not allowed" });
    }
    const { urn } = req.query || {};
    if (!urn) return res.status(400).json({ error: "Missing urn" });

    const { access_token } = await getApsToken();

    const mr = await fetch(
      `https://developer.api.autodesk.com/modelderivative/v2/designdata/${encodeURIComponent(
        urn
      )}/manifest`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "x-ads-region": "US",
        },
      }
    );
    const text = await mr.text();
    if (!mr.ok) return res.status(mr.status).json({ error: "manifest error", details: text });

    const manifest = text ? JSON.parse(text) : {};
    return res.status(200).json({ ok: true, manifest });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
