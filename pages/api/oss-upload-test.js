// /pages/api/oss-upload-test.js
import * as aps from "../../lib/aps";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const tok = await aps.getToken();
    const bucket = await aps.ensureBucket(tok.access_token);

    const objectKey = `diag-${Date.now()}.txt`;
    const data = Buffer.from("hello from cadconverts");

    const url = `${aps.APS_BASE_URL}/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(objectKey)}`;
    const headers = {
      Authorization: `Bearer ${tok.access_token}`,
      "x-ads-region": "US",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(data.length),
    };

    const up = await fetch(url, { method: "POST", headers, body: data });
    const text = await up.text().catch(()=>"(no body)");
    const respHeaders = {};
    up.headers.forEach((v,k)=>respHeaders[k]=v);

    return res.status(200).json({
      tryUrl: url,
      tryHeaders: headers,
      status: up.status,
      ok: up.ok,
      responseHeaders: respHeaders,
      responseBody: safe(text),
      bucket,
      objectKey,
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}

function safe(t){ try { return JSON.parse(t) } catch { return t } }
