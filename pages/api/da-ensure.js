// pages/api/da-ensure.js
// Creează (dacă nu există) o activitate Design Automation for AutoCAD care face Plot to PDF
// Folosește engine Autodesk.AutoCAD+24_3 (2024). Poți ajusta ulterior.

// NOTE: Ai nevoie de permisiunea Design Automation activată pe proiectul APS.
// În Vercel -> Env vars trebuie să ai: APS_CLIENT_ID, APS_CLIENT_SECRET
const ENGINE_ID = "Autodesk.AutoCAD+24_3"; // engine AutoCAD Core Console 2024
// Alege un nickname scurt pt resursele DA (doar litere/cifre/_). Ex: "cadconverts"
const NICK = process.env.APS_DA_NICKNAME || "cadconverts";
// Numele activității noastre:
const ACTIVITY_ID = `${NICK}.PlotToPDF`;

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
    // 1) token cu code:all (DA cere scope-ul ăsta)
    const { access_token } = await getApsToken();

    // 2) Verifică dacă activitatea există deja
    const getAct = await fetch(
      `https://developer.api.autodesk.com/da/us-east/v3/activities/${encodeURIComponent(ACTIVITY_ID)}`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    if (getAct.ok) {
      const existing = await getAct.json();
      return res.status(200).json({ ok: true, exists: true, activity: existing });
    }

    // 3) Dacă nu există, o creăm
    // Comanda: deschide DWG input, setează device „DWG To PDF.pc3”, plotează Model space la PDF-ul de ieșire.
    // Folosim un mic script AutoLISP trimis ca input (lisp.lsp).
    const activityDef = {
      id: ACTIVITY_ID,
      engine: ENGINE_ID,
      commandLine: [
        // Rulează core console cu scriptul nostru LISP
        `$(engine.path)\\accoreconsole.exe /i "$(args[inputFile].path)" /s "$(args[script].path)" /lsp "$(args[lisp].path)"`
      ],
      parameters: {
        inputFile: {
          verb: "get",
          description: "DWG or DXF to plot",
          localName: "input.dwg"
        },
        resultPdf: {
          verb: "put",
          description: "Generated PDF",
          localName: "result.pdf"
        },
        lisp: {
          verb: "get",
          description: "LISP helper",
          localName: "plot.lsp"
        },
        script: {
          verb: "get",
          description: "Core Console script",
          localName: "script.scr"
        }
      },
      settings: {
        // Niciun appBundle pentru început (folosim doar LISP + script)
      },
      description: "Plot DWG/DXF to PDF using DWG To PDF.pc3",
      version: 1
    };

    const createAct = await fetch("https://developer.api.autodesk.com/da/us-east/v3/activities", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(activityDef),
    });

    const text = await createAct.text();
    if (!createAct.ok) {
      return res.status(createAct.status).json({ ok: false, error: "create activity failed", details: text });
    }

    return res.status(200).json({ ok: true, created: true, details: text ? JSON.parse(text) : {} });
  } catch (e) {
    console.error("da-ensure error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
