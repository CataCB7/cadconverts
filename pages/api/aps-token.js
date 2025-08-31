// pages/api/aps-token.js
export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SCOPES } = process.env;
    if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
      return res.status(500).json({ error: "APS credentials missing" });
    }

    const scopes =
      APS_SCOPES || "bucket:read bucket:create data:read data:write";

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: scopes,
      client_id: APS_CLIENT_ID,
      client_secret: APS_CLIENT_SECRET,
    });

    const r = await fetch(
      "https://developer.api.autodesk.com/authentication/v2/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }
    );

    if (!r.ok) {
      const t = await r.text();
      return res
        .status(r.status)
        .json({ error: "APS token failed", details: t });
    }

    const data = await r.json(); // { access_token, token_type, expires_in }
    return res.status(200).json({
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: data.token_type,
      scope: scopes,
    });
  } catch (err) {
    console.error("APS token error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
