// pages/api/plot-pdf.js
// Pornește WorkItem DWG/DXF -> PDF fără signedS3; încearcă US/EU × dot/pipe + alias "prod".

const CANDIDATE_REGIONS = [
  { path: "us-east", hdr: "US"   },
  { path: "eu",      hdr: "EMEA" },
];

function ownerFromEnv() {
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

async function ensureObjectExists(access_token, bucket, objectKey, regionHdr) {
  const r = await fetch(
    `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(objectKey)}/details`,
    { headers: { Authorization: `Bearer ${access_token}`, "x-ads-region": regionHdr } }
  );
  const t = await r.text();
  if (!r.ok) throw new Error(`object not found: ${t}`);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return res.status(405).json({ error: "Method not allowed" });
    }
    const { bucket, objectKey, outKey } = req.body || {};
    if (!bucket || !objectKey) return res.status(400).json({ error: "Missing bucket or objectKey" });

    const baseName = objectKey.replace(/\.[^.]+$/, "");
    const resultKey = outKey || `${baseName}-${Date.now()}.pdf`;

    const { access_token } = await getApsToken();
    const owner = ownerFromEnv();

    const idForms = [`${owner}.PlotToPDF+prod`, `${owner}|PlotToPDF+prod`];

    // URL-uri OSS directe
    const inputUrl  = `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(objectKey)}`;
    const outputUrl = `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucket)}/objects/${encodeURIComponent(resultKey)}`;

    const base = process.env.NEXT_PUBLIC_BASE_URL || "https://www.cadconverts.com";
    const lispUrl = `${base}/da/plot.lsp`;
    const scriptUrl = `${base}/da/script.scr`;

    const errors = [];

    // Încercăm toate combinațiile până reușește una
    for (const region of CANDIDATE_REGIONS) {
      try {
        await ensureObjectExists(access_token, bucket, objectKey, region.hdr);
      } catch (e) {
        // continuăm — obiectul se poate valida și fără header; nu blocăm
      }

      for (const activityId of idForms) {
        const wiUrl = `https://developer.api.autodesk.com/da/${region.path}/v3/workitems`;
        const wi = await fetch(wiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
            "x-ads-region": region.hdr
          },
          body: JSON.stringify({
            activityId,
            arguments: {
              inputFile: {
                url: inputUrl,
                headers: {
                  Authorization: `Bearer ${access_token}`,
                  "x-ads-region": region.hdr
                }
              },
              resultPdf: {
                url: outputUrl,
                verb: "put",
                headers: {
                  Authorization: `Bearer ${access_token}`,
                  "Content-Type": "application/octet-stream",
                  "x-ads-region": region.hdr
                }
              },
              lisp:   { url: lispUrl },
              script: { url: scriptUrl }
            }
          })
        });

        const txt = await wi.text();
        if (wi.ok) {
          const data = txt ? JSON.parse(txt) : {};
          return res.status(200).json({
            ok: true,
            workitemId: data.id || data.workitemId || null,
            resultKey,
            regionUsed: region.path,
            activityUsed: activityId
          });
        } else {
          errors.push({ region: region.path, activityId, status: wi.status, details: txt });
        }
      }
    }

    return res.status(400).json({ ok:false, error: "workitem create failed in all combinations", attempts: errors });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
}
