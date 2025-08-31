// /pages/api/aps-signedurl.js
import { getToken, ensureBucket } from "../../lib/aps";

const OSS_HOST = "https://oss.api.autodesk.com"; // <- hostul corect pentru signedresources

function randId() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { filename } = req.body || {};
    if (!filename) return res.status(400).json({ error: "Missing filename" });

    // 1) token + bucket (creat/validat)
    const tok = await getToken();
    const bucket = await ensureBucket(tok.access_token);

    // 2) cheie unică
    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const objectKey = `${randId()}.${ext}`;

    // 3) cerem Signed URL (PUT) pe hostul OSS
    const resp = await fetch(`${OSS_HOST}/oss/v2/signedresources`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        "Content-Type": "application/json",
        "x-ads-region": "EMEA",
      },
      body: JSON.stringify({
        minutesExpiration: 15,
        singleUse: false,
        resources: [
          {
            bucketKey: bucket,
            objectKey,
            permissions: ["write"]
          }
        ]
      })
    });

    if (!resp.ok) {
      const t = await resp.text().catch(()=>"(no body)");
      return res.status(resp.status).json({ error: `signedresources failed ${resp.status}: ${t}` });
    }

    const data = await resp.json();
    const signedUrl = data?.signedResources?.[0]?.signedUrl;
    if (!signedUrl) return res.status(500).json({ error: "Missing signedUrl in response" });

    res.status(200).json({
      bucket,
      objectKey,
      region: "EMEA",
      upload: {
        url: signedUrl, // PUT fără Authorization
        headers: { "Content-Type": "application/octet-stream" }
      }
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
