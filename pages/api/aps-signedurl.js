// /pages/api/aps-signedurl.js
import { getToken, ensureBucket } from "../../lib/aps";
import { Agent } from "undici";

export const config = {
  runtime: "nodejs",
  regions: ["iad1"], // US-East
};

const agentDev = new Agent({ connect: { family: 4, hostname: "developer.api.autodesk.com" } });
const agentOss = new Agent({ connect: { family: 4, hostname: "oss.api.autodesk.com" } });

function rid() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

async function requestSignedUrlIPv4(token, resourceUrn) {
  const payload = JSON.stringify({
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
    body: payload,
  };

  // 1) încearcă pe developer host (oficial)
  try {
    const r1 = await fetch("https://developer.api.autodesk.com/oss/v2/signedresources", {
      ...common,
      dispatcher: agentDev,
    });
    if (r1.ok || r1.status !== 404) return r1; // mergem cu răspunsul (chiar dacă nu e ok, nu e 404)
  } catch (e) {
    // continuăm cu fallback
  }

  // 2) fallback pe oss host
  try {
    const r2 = await fetch("https://oss.api.autodesk.com/oss/v2/signedresources", {
      ...common,
      dispatcher: agentOss,
    });
    return r2;
  } catch (e) {
    // aruncăm mai departe ca să afișăm eroarea în JSON
    throw e;
  }
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

    // cheie + URN pentru obiect
    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const objectKey = `${rid()}.${ext}`;
    const resourceUrn = `urn:adsk.objects:os.object:${bucket}/${objectKey}`;

    // cerem Signed URL cu IPv4 + fallback host
    const resp = await requestSignedUrlIPv4(tok.access_token, resourceUrn);
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
        url: signedUrl, // PUT direct, fără Authorization
        headers: { "Content-Type": "application/octet-stream" },
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
