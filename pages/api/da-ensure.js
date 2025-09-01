// pages/api/da-ensure.js
// Creează/confirmă activitatea <clientId>.PlotToPDF și setează aliasul "prod" la ultima versiune

const ENGINE_ID = "Autodesk.AutoCAD+24_3"; // AutoCAD 2024 Core Console
const REGION = "us-east";
const REGION_HEADER = { "x-ads-region": "US" };

function owner() {
  const id = process.env.APS_CLIENT_ID;
  if (!id) throw new Error("Missing APS_CLIENT_ID");
  return id;
}

async function getApsToken(scopes = "code:all data:read data:write bucket:read bucket:create code:all") {
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

    // 1) vezi dacă există activitatea
    let existing = null;
    const getAct = await fetch(
      `https://developer.api.autodesk.com/da/${REGION}/v3/activities/${encodeURIComponent(actId)}`,
      { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } }
    );
    if (getAct.ok) {
      existing = await getAct.json();
    } else {
      // 2) creează activitatea (fără appBundle; script+lisp vin din URL public)
      const createBody = {
        id: actId,
        engine: ENGINE_ID,
        commandLine: [
          `$(engine.path)\\accoreconsole.exe /i "$(args[inputFile].path)" /s "$(args[script].path)" /lsp "$(args[lisp].path)"`
        ],
        parameters: {
          inputFile: { verb: "get", localName: "input.dwg", description: "DWG/DXF input" },
          resultPdf: { verb: "put", localName: "result.pdf", description: "PDF output" },
          lisp:      { verb: "get", localName: "plot.lsp" },
          script:    { verb: "get", localName: "script.scr" }
        },
        description: "Plot DWG/DXF to PDF using DWG To PDF.pc3"
      };
      const createAct = await fetch(`https://developer.api.autodesk.com/da/${REGION}/v3/activities`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", ...REGION_HEADER },
        body: JSON.stringify(createBody),
      });
      const t = await createAct.text();
      if (!createAct.ok) {
        return res.status(createAct.status).json({ ok:false, error:"create activity failed", details:t });
      }
      existing = t ? JSON.parse(t) : {};
    }

    // 3) află ultima versiune a activității
    const getVersions = await fetch(
      `https://developer.api.autodesk.com/da/${REGION}/v3/activities/${encodeURIComponent(actId)}/versions`,
      { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } }
    );
    const versions = getVersions.ok ? (await getVersions.json()) : { data: [] };
    const latest = (versions.data || []).sort((a,b)=>(b.version - a.version))[0];
    if (!latest?.version) {
      return res.status(500).json({ ok:false, error:"No activity versions found" });
    }

    // 4) upsert alias "prod" -> latest.version
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
      return res.status(upsert.status).json({ ok:false, error:"alias upsert failed", details:aliasText });
    }

    return res.status(200).json({
      ok:true,
      activity: existing,
      latestVersion: latest.version,
      alias: "prod"
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
}
