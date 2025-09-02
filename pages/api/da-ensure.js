// pages/api/da-ensure.js
// NU mai creează activitatea; doar găsește activitatea existentă <clientId>.PlotToPDF
// și setează/actualizează aliasul "prod" către ultima versiune.

const REGION = "us-east";
const REGION_HEADER = { "x-ads-region": "US" };
const ENGINE_ID = "Autodesk.AutoCAD+24_3"; // doar pt info

function owner() {
  const id = process.env.APS_CLIENT_ID;
  if (!id) throw new Error("Missing APS_CLIENT_ID");
  return id;
}

async function getApsToken(scopes = "code:all data:read data:write bucket:read bucket:create") {
  const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;
  if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) throw new Error("Missing APS_CLIENT_ID/APS_CLIENT_SECRET");
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
    const { access_token } = await getApsToken();
    const actId = `${owner()}.PlotToPDF`;

    // 1) citește activitatea EXISTENTĂ
    const getAct = await fetch(
      `https://developer.api.autodesk.com/da/${REGION}/v3/activities/${encodeURIComponent(actId)}`,
      { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } }
    );
    const actText = await getAct.text();
    if (!getAct.ok) {
      return res.status(getAct.status).json({ ok:false, error:"activity not found", details: actText });
    }
    const activity = actText ? JSON.parse(actText) : {};

    // 2) află ultima versiune
    const getVersions = await fetch(
      `https://developer.api.autodesk.com/da/${REGION}/v3/activities/${encodeURIComponent(actId)}/versions`,
      { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } }
    );
    const versions = getVersions.ok ? (await getVersions.json()) : { data: [] };
    const latest = (versions.data || []).sort((a,b)=>(b.version - a.version))[0];
    if (!latest?.version) {
      return res.status(500).json({ ok:false, error:"no versions for activity" });
    }

    // 3) upsert alias "prod" -> ultima versiune
    const aliasId = `${actId}+prod`;
    const upsert = await fetch(
      `https://developer.api.autodesk.com/da/${REGION}/v3/aliases/${encodeURIComponent(aliasId)}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type":"application/json", ...REGION_HEADER },
        body: JSON.stringify({ version: latest.version }),
      }
    );
    const aliasText = await upsert.text();
    if (!upsert.ok) {
      return res.status(upsert.status).json({ ok:false, error:"alias upsert failed", details: aliasText });
    }

    return res.status(200).json({
      ok:true,
      activity,
      latestVersion: latest.version,
      alias:"prod"
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
}
