// /pages/api/aps-signed.js
import { getToken, ensureBucket } from "../../lib/aps";
import crypto from "crypto";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { filename } = req.body || {};
    if (!filename) return res.status(400).json({ error: "Missing filename" });

    // 1) token + bucket
    const tok = await getToken();
    const bucket = await ensureBucket(tok.access_token);

    // 2) generăm un objectKey unic
    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const objectKey = `${Date.now()}-${crypto.randomUUID()}.${ext}`;

    // 3) URL de upload în APS OSS
    const uploadUrl = `https://developer.api.autodesk.com/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(objectKey)}`;

    // clientul va face: PUT uploadUrl cu Authorization: Bearer <token>
    res.status(200).json({
      bucket,
      objectKey,
      upload: {
        url: uploadUrl,
        authorization: `Bearer ${tok.access_token}`,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
