// pages/api/plot-pdf.js
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // 1) parametri din request (sau default pentru test)
    const {
      bucket = "cadconverts-prod-us-123abc",
      objectKey = "rigle_311r.dwg",
      region = "US",                         // APS region pentru OSS/DA
      proxyBase = "https://proxy.cadconverts.com", // domeniul tău de proxy (schimbă dacă e altul)
    } = req.body || {};

    // 2) token APS din backendul tău (routa deja există)
    const tokResp = await fetch("https://www.cadconverts.com/api/aps-token");
    if (!tokResp.ok) {
      const t = await tokResp.text();
      return res.status(500).json({ error: "Token fetch failed", body: t });
    }
    const { access_token } = await tokResp.json();
    const auth = `Bearer ${access_token}`;

    // 3) obține **SIGNED S3 DOWNLOAD** pentru DWG (cheia trebuie URL-encodată)
    const encKey = encodeURIComponent(objectKey);
    const s3Resp = await fetch(
      `https://developer.api.autodesk.com/oss/v2/buckets/${bucket}/objects/${encKey}/signeds3download`,
      {
        headers: {
          Authorization: auth,
          "x-ads-region": region, // important: US pentru bucket US
        },
      }
    );

    if (!s3Resp.ok) {
      const body = await s3Resp.text();
      return res
        .status(s3Resp.status)
        .json({ error: "signeds3download failed", body });
    }

    // Răspunsul poate avea .url sau .signedUrl; folosim ce găsim
    const s3Json = await s3Resp.json();
    const hostDwgUrl = s3Json.url || s3Json.signedUrl;
    if (!hostDwgUrl) {
      return res.status(500).json({
        error: "No signed S3 URL in response",
        got: s3Json,
      });
    }

    // 4) pregătește ieșirea: trimitem PDF-ul în PROXY prin POST /ingest-pdf
    //    (nu adăuga HEADERS la HostDwg; DA va lua direct din S3)
    const outName = objectKey.replace(/\.dwg$/i, "") + ".pdf";
    const ingestUrl = `${proxyBase}/ingest-pdf?bucket=${encodeURIComponent(
      bucket
    )}&objectKey=${encodeURIComponent(outName)}&source=plot2pdf`;

    // 5) creează WorkItem pe DA v3 (us-east)
    const workitemPayload = {
      activityId: "AutoCAD.PlotToPDF+25_0",
      arguments: {
        HostDwg: {
          url: hostDwgUrl, // <— AICI E MAGIA: URL S3 semnat, fără headers!
        },
        ResultPdf: {
          url: ingestUrl,
          verb: "post",
        },
      },
    };

    const daResp = await fetch(
      "https://developer.api.autodesk.com/da/us-east/v3/workitems",
      {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(workitemPayload),
      }
    );

    const daText = await daResp.text();
    if (!daResp.ok) {
      return res.status(daResp.status).json({
        error: "DA workitem create failed",
        body: daText,
      });
    }

    // 6) trimite răspunsul către client (id-ul WI + echo parametri utili)
    try {
      const daJson = JSON.parse(daText);
      return res.status(200).json({
        message: "workitem created",
        workitem: daJson,
        used: {
          bucket,
          objectKey,
          hostDwgUrlPreview: hostDwgUrl.slice(0, 80) + "...",
          ingestUrlPreview: ingestUrl,
        },
      });
    } catch {
      return res.status(200).json({
        message: "workitem created",
        raw: daText,
        used: {
          bucket,
          objectKey,
          hostDwgUrlPreview: hostDwgUrl.slice(0, 80) + "...",
          ingestUrlPreview: ingestUrl,
        },
      });
    }
  } catch (err) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
