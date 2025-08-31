// /pages/api/aps-upload-proxy.js
import * as aps from "../../lib/aps";

export const config = {
  api: { bodyParser: false },
  runtime: "nodejs",
  regions: ["iad1"],     // <- US-East (Washington DC)
};

const OSS_HOST = "https://oss.api.autodesk.com";

function rid(){ return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36); }

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const filename = (req.query.filename || "").toString().trim();
    if (!filename) return res.status(400).json({ error: "Missing ?filename=" });

    const chunks=[]; for await (const ch of req) chunks.push(ch);
    const buffer = Buffer.concat(chunks);
    if (!buffer?.length) return res.status(400).json({ error: "Empty body" });

    const tok = await aps.getToken();
    const bucket = await aps.ensureBucket(tok.access_token);

    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const objectKey = `${rid()}.${ext}`;

    const url = `${OSS_HOST}/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(objectKey)}`;
    const up = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        "x-ads-region": "US",
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.length),
        Connection: "keep-alive",
      },
      body: buffer,
    });

    const body = await up.text().catch(()=>"(no body)");
    if (!up.ok) return res.status(up.status).json({ error: `APS upload failed ${up.status}: ${body}` });

    return res.status(200).json({ ok:true, bucket, objectKey });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
