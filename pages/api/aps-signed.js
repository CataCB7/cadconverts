// /pages/api/aps-signed.js
import { getToken, ensureBucket, APS_BASE_URL } from "../../lib/aps";

function rid() { return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36); }

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { filename } = req.body || {};
    if (!filename) return res.status(400).json({ error: "Missing filename" });

    const tok = await getToken();
    const bucket = await ensureBucket(tok.access_token);

    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const objectKey = `${rid()}.${ext}`;
    const uploadUrl = `${APS_BASE_URL}/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(objectKey)}`;

    res.status(200).json({
      bucket,
      objectKey,
      region: "US",
      upload: {
        url: uploadUrl,
        headers: {
          Authorization: `Bearer ${tok.access_token}`,
          "x-ads-region": "US",
          "Content-Type": "application/octet-stream"
        }
      }
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
