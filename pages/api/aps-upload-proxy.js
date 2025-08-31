// /pages/api/aps-upload-proxy.js
import { getToken, ensureBucket } from "../../lib/aps";

export const config = { api: { bodyParser: false } };

// hostul NOU pentru OSS v2 (cel vechi dă „Legacy endpoint is deprecated”)
const OSS_HOST = "https://oss.api.autodesk.com";

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

    // citește body binar
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    if (!buffer?.length) return res.status(400).json({ error: "Empty body" });

    // token + bucket (region EMEA)
    const tok = await getToken();
    const bucket = await ensureBucket(tok.access_token);

    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const objectKey = `${randId()}.${ext}`;

    // PUT pe hostul NOU OSS v2 + header x-ads-region
    const uploadUrl = `${OSS_HOST}/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(objectKey)}`;
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        "x-ads-region": "EMEA",
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.length)
      },
      body: buffer
    });

    if (!put.ok) {
      const t = await put.text().catch(() => "(no body)");
      return res.status(put.status).json({ error: `APS upload failed ${put.status}: ${t}` });
    }

    return res.status(200).json({ ok: true, bucket, objectKey });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
