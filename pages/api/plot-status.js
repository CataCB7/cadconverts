// pages/api/plot-status.js
// Interoghează statusul unui WorkItem DA: GET /api/plot-status?id=<workitemId>

const REGION = "us-east";

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

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      return res.status(405).json({ error: "Method not allowed" });
    }
    const id = String(req.query.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });

    const { access_token } = await getApsToken();
    const r = await fetch(
      `https://developer.api.autodesk.com/da/${"us-east"}/v3/workitems/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: "status failed", details: text });

    const data = text ? JSON.parse(text) : {};
    return res.status(200).json({ ok: true, status: data.status, workitem: data });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
