// /pages/api/aps-signedurl.js
import { getToken, ensureBucket } from "../../lib/aps";

function rid() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { filename } = req.body || {};
    if (!filename) return res.status(400).json({ error: "Missing filename" });

    // 1) token + bucket (US)
    const tok = await getToken();
    const bucket = await ensureBucket(tok.access_token);

    // 2) key + URN pentru obiect
    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const objectKey = `${rid()}.${ext}`;
    const resourceUrn = `urn:adsk.objects:os.object:${bucket}/${objectKey}`;

    // 3) cerem Signed URL corect (APS v2) – pe hostul "developer"
    const resp = await fetch("https://developer.api.autodesk.com/oss/v2/signedresources", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        "Content-Type": "application/json",
        "x-ads-region": "US"
      },
      body: JSON.stringify({
        minutesExpiration: 15,
        singleUse: false,
        resources: [
          {
            resource: resourceUrn,       // ← IMPORTANT: URN, nu bucketKey/objectKey
            permissions: ["write"]       // upload
          }
        ]
      })
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "(no body)");
      return res.status(resp.status).json({ error: `signedresources failed ${resp.status}: ${t}` });
    }

    const data = await resp.json();
    const signedUrl = data?.signedResources?.[0]?.signedUrl;
    if (!signedUrl) return res.status(500).json({ error: "Missing signedUrl in response" });

    // 4) trimitem clientului URL-ul semnat (PUT fără Authorization)
    res.status(200).json({
      bucket,
      objectKey,
      upload: {
        url: signedUrl,
        headers: { "Content-Type": "application/octet-stream" }
      }
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
