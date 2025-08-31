// /pages/api/aps-signed.js
import { getToken, ensureBucket, APS_OSS_URL } from "../../lib/aps";

function randId() {
  // unic suficient pentru chei de obiect
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { filename } = req.body || {};
    if (!filename) return res.status(400).json({ error: "Missing filename" });

    // 1) token + bucket (cu region EMEA)
    const tok = await getToken();
    const bucket = await ensureBucket(tok.access_token);

    // 2) generăm un objectKey unic
    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const objectKey = `${randId()}.${ext}`;

    // 3) URL de upload pe noul host OSS v2
    const uploadUrl = `${APS_OSS_URL}/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(objectKey)}`;

    res.status(200).json({
      bucket,
      objectKey,
      region: "EMEA",
      upload: {
        url: uploadUrl,
        headers: {
          Authorization: `Bearer ${tok.access_token}`,
          "x-ads-region": "EMEA",
          "Content-Type": "application/octet-stream",
        },
      },
    });
  } catch (e) {
    // expune mesajul real ca să putem vedea cauza dacă mai apare 500
    res.status(500).json({ error: e?.message || String(e) });
  }
}

