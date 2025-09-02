// pages/api/da-ensure.js
// Găsește activitatea existentă <OWNER>|PlotToPDF sau <OWNER>.PlotToPDF
// și setează/actualizează aliasul "prod" pe ultima versiune.

const REGION = "us-east";
const REGION_HEADER = { "x-ads-region": "US" };

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

async function getJsonOrText(r) {
  const t = await r.text();
  try { return { ok: r.ok, status: r.status, data: t ? JSON.parse(t) : {} }; }
  catch { return { ok: r.ok, status: r.status, data: t }; }
}

export default async function handler(_req, res) {
  try {
    const { access_token } = await getApsToken();
    const ow = owner();

    // încercăm întâi cu punct, apoi cu bară verticală
    const ids = [
      `${ow}.PlotToPDF`,
      `${ow}|PlotToPDF`
    ];

    let actId = null;
    let activity = null;

    for (const id of ids) {
      const r = await fetch(
        `https://developer.api.autodesk.com/da/${REGION}/v3/activities/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } }
      );
      const { ok, data } = await getJsonOrText(r);
      if (ok) { actId = id; activity = data; break; }
    }

    if (!actId) {
      return res.status(404).json({ ok:false, error:"activity not found in either format (dot or pipe)" });
    }

    // versiuni
    const versR = await fetch(
      `https://developer.api.autodesk.com/da/${REGION}/v3/activities/${encodeURIComponent(actId)}/versions`,
      { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } }
    );
    const { ok: okV, data: versions } = await getJsonOrText(versR);
    if (!okV) return res.status(versR.status).json({ ok:false, error:"versions read failed", details: versions });
    const list = (versions.data || []).sort((a,b)=> (b.version - a.version));
    if (!list.length) return res.status(500).json({ ok:false, error:"no versions for activity" });
    const latest = list[0].version;

    // alias "prod"
    const aliasId = `${actId}+prod`; // OBS: aceeași formă ca actId (dot sau pipe)
    const aliasR = await fetch(
      `https://developer.api.autodesk.com/da/${REGION}/v3/aliases/${encodeURIComponent(aliasId)}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type":"application/json", ...REGION_HEADER },
        body: JSON.stringify({ version: latest }),
      }
    );
    const { ok: okA, data: aliasData } = await getJsonOrText(aliasR);
    if (!okA) return res.status(aliasR.status).json({ ok:false, error:"alias upsert failed", details: aliasData });

    return res.status(200).json({
      ok:true,
      resolvedActivityId: actId,   // spune forma acceptată de server
      latestVersion: latest,
      alias: "prod"
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
}
