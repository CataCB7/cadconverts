// /pages/api/aps-signedurl.js
import { getToken, ensureBucket } from "../../lib/aps";

function rid() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

async function requestSignedUrl(token, resourceUrn) {
  // încercăm mai întâi pe developer (cel standard în docs)
  const body = JSON.stringify({
    minutesExpiration: 15,
    singleUse: false,
    resources: [{ resource: resourceUrn, permissions: ["write"] }],
  });

  const common = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-ads-region": "US",
    },
    body,
  };

  // 1) developer host
  let r = await fetch("https://developer.api.autodesk.com/oss/v2/signedresources", common);
  if (r.status === 404) {
    // 2) fallback pe oss host (unele regiuni/conturi îl expun aici)
    r = await fetch("https://oss.api.autodesk.com/oss/v2/signedresources", common);
  }
  return r;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { filename } = req.body || {};
    if (!filename) return res.status(400).json({ error: "Missing filename" });

    // token + bucket (US)
    const tok = await getToken();
    const bucket = await ensureBucket(tok.access_token);

    // cheie + URN
    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const objectKey = `${rid()}.${ext}`;
    const resourceUrn = `urn:adsk.objects:os.object:${bucket}/${objectKey}`;

    // cerem Signed URL (cu fallback de host)
    const resp = await requestSignedUrl(tok.access_token, resourceUrn);
    if (!resp.ok) {
      const t = await resp.text().catch(() => "(no body)");
      return res.status(resp.status).json({ error: `signedresources failed ${resp.status}: ${t}` });
    }

    const data = await resp.json();
    const signedUrl = data?.signedResources?.[0]?.signedUrl;
    if (!signedUrl) return res.status(500).json({ error: "Missing signedUrl in response" });

    return res.status(200).json({
      bucket,
      objectKey,
      upload: {
        url: signedUrl,                     // PUT direct, fără Authorization
        headers: { "Content-Type": "application/octet-stream" },
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
