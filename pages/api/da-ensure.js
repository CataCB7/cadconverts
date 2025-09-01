// pages/api/da-ensure.js
// Creează (dacă nu există) activitatea <clientId>.PlotToPDF pe AutoCAD Core Console 2024
// Nu folosim nickname (owner = APS_CLIENT_ID)

const REGION = "us-east";
const ENGINE_ID = "Autodesk.AutoCAD+24_3"; // AutoCAD 2024

function getOwner() {
  // owner = clientId (sigur, fără nickname)
  const id = process.env.APS_CLIENT_ID;
  if (!id) throw new Error("Missing APS_CLIENT_ID");
  return id;
}
const ACTIVITY_SHORT = "PlotToPDF";

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
  return r.json(); // { access_token }
}

export default async function handler(req, res) {
  try {
    const owner = getOwner();
    const ACTIVITY_ID = `${owner}.${ACTIVITY_SHORT}`;
    const { access_token } = await getApsToken();

    // 1) vezi dacă activitatea există
    const getAct = await fetch(
      `https://developer.api.autodesk.com/da/${REGION}/v3/activities/${encodeURIComponent(ACTIVITY_ID)}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    if (getAct.ok) {
      const existing = await getAct.json();
      return res.status(200).json({ ok: true, exists: true, owner, activity: existing });
    }

    // 2) creează activitatea (fără 'version')
    const activityDef = {
      id: ACTIVITY_ID, // <clientId>.PlotToPDF
      engine: ENGINE_ID,
      commandLine: [
        `$(engine.path)\\accoreconsole.exe /i "$(args[inputFile].path)" /s "$(args[script].path)" /lsp "$(args[lisp].path)"`
      ],
      parameters: {
        inputFile: { verb: "get", description: "DWG or DXF to plot", localName: "input.dwg" },
        resultPdf: { verb: "put", description: "Generated PDF", localName: "result.pdf" },
        lisp: { verb: "get", description: "LISP helper", localName: "plot.lsp" },
        script: { verb: "get", description: "Core Console script", localName: "script.scr" }
      },
      settings: {},
      description: "Plot DWG/DXF to PDF using DWG To PDF.pc3"
    };

    const createAct = await fetch(`https://developer.api.autodesk.com/da/${REGION}/v3/activities`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(activityDef),
    });

    const text = await createAct.text();
    if (!createAct.ok) {
      return res.status(createAct.status).json({ ok: false, error: "create activity failed", details: text });
    }

    return res.status(200).json({
      ok: true,
      owner,
      created: true,
      details: text ? JSON.parse(text) : {}
    });
  } catch (e) {
    console.error("da-ensure error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
