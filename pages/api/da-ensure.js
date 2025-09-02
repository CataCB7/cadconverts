// pages/api/da-ensure.js
// Caută activitatea existentă <OWNER>.PlotToPDF sau <OWNER>|PlotToPDF în US și EU,
// apoi setează/actualizează aliasul "prod" către ultima versiune.

const REGIONS = [
  { path: "us-east",  hdr: "US"   },
  { path: "eu",       hdr: "EMEA" },
];

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

async function tryFetchJson(url, headers) {
  const r = await fetch(url, { headers });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
  return { ok: r.ok, status: r.status, data, raw: text };
}

export default async function handler(_req, res) {
  try {
    const { access_token } = await getApsToken();
    const ow = owner();
    const ids = [`${ow}.PlotToPDF`, `${ow}|PlotToPDF`];

    let found = null;

    // 1) căutăm activitatea în toate combinațiile
    for (const region of REGIONS) {
      for (const id of ids) {
        const url = `https://developer.api.autodesk.com/da/${region.path}/v3/activities/${encodeURIComponent(id)}`;
        const { ok, data, raw } = await tryFetchJson(url, {
          Authorization: `Bearer ${access_token}`,
          "x-ads-region": region.hdr
        });
        if (ok) {
          found = { region, id, activity: data };
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      return res.status(404).json({ ok: false, error: "activity not found in US/EU with dot/pipe" });
    }

    // 2) citim versiunile
    const verUrl = `https://developer.api.autodesk.com/da/${found.region.path}/v3/activities/${encodeURIComponent(found.id)}/versions`;
    const ver = await tryFetchJson(verUrl, {
      Authorization: `Bearer ${access_token}`,
      "x-ads-region": found.region.hdr
    });
    if (!ver.ok) {
      return res.status(ver.status).json({ ok:false, error:"versions read failed", details: ver.data });
    }
    const list = (ver.data.data || []).sort((a,b)=> (b.version - a.version));
    if (!list.length) return res.status(500).json({ ok:false, error:"no versions for activity" });
    const latest = list[0].version;

    // 3) upsert alias "prod" -> latest
    const aliasId = `${found.id}+prod`;
    const aliasUrl = `https://developer.api.autodesk.com/da/${found.region.path}/v3/aliases/${encodeURIComponent(aliasId)}`;
    const alias = await fetch(aliasUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
        "x-ads-region": found.region.hdr
      },
      body: JSON.stringify({ version: latest })
    });
    const aliasText = await alias.text();
    if (!alias.ok) {
      return res.status(alias.status).json({ ok:false, error:"alias upsert failed", details: aliasText });
    }

    return res.status(200).json({
      ok: true,
      resolvedActivityId: found.id,         // ex: <clientId>|PlotToPDF
      resolvedRegion: found.region.path,    // "us-east" sau "eu"
      regionHeader: found.region.hdr,       // "US" sau "EMEA"
      latestVersion: latest
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
}
