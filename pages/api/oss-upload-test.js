// /pages/api/oss-upload-test.js
import * as aps from "../../lib/aps";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // 1) token + bucket (US) — se creează dacă nu există
    const tok = await aps.getToken();
    const bucket = await aps.ensureBucket(tok.access_token);

    // 2) fișier mic de test, din server (nu din browser)
    const objectKey = `diag-${Date.now()}.txt`;
    const data = Buffer.from("hello from cadconverts");

    // 3) Upload v2: POST pe developer host + regiune US
    const url = `${aps.APS_BASE_URL}/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(objectKey)}`;
    const up = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        "x-ads-region": "US",
        "Content-Type": "application/octet-stream",
        "Content-Length": String(data.length),
      },
      body: data,
    });

    const body = await up.text().catch(()=>"(no body)");
    if (!up.ok) {
      return res.status(up.status).json({ ok: false, error: `APS upload failed ${up.status}: ${body}` });
    }

    return res.status(200).json({ ok: true, bucket, objectKey, raw: safeJson(body) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

function safeJson(t) { try { return JSON.parse(t); } catch { return t; } }
