// /pages/api/aps-upload-proxy.js
import { getToken, ensureBucket, APS_BASE_URL } from "../../lib/aps";

export const config = { api: { bodyParser: false } };

function randId() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const filename = (req.query.filename || "").toString().trim();
    if (!filename) return res.status(400).json({ error: "Missing ?filename=" });

    // 1) body binar
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    if (!buffer?.length) return res.status(400).json({ error: "Empty body" });

    // 2) token + bucket (EMEA)
    const tok = await getToken();
    const bucket = await ensureBucket(tok.access_token);

    // 3) cheie obiect unică
    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const objectKey = `${randId()}.${ext}`;

    // 4) **POST** la endpointul OSS v2 (nu PUT!)
    const url = `${APS_BASE_URL}/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(objectKey)}`;
    const up = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        "x-ads-region": "EMEA",
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.length)
      },
      body: buffer
    });

    if (!up.ok) {
      const t = await up.text().catch(() => "(no body)");
      return res.status(up.status).json({ error: `APS upload failed ${up.status}: ${t}` });
    }

    return res.status(200).json({ ok: true, bucket, objectKey });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
