// /pages/api/diag-aps-signed.js
import { getToken, ensureBucket, APS_OSS_URL } from "../../lib/aps";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    // 1) token
    const tok = await getToken();
    const tokenOk = !!tok?.access_token;

    // 2) bucket (doar îl verifică / creează)
    const bucket = await ensureBucket(tok.access_token);

    // 3) probă HEAD la endpointul de upload (fără body), doar să vedem dacă host-ul răspunde
    const testUrl = `${APS_OSS_URL}/oss/v2/buckets/${bucket}/objects/__diag__`;
    const probe = await fetch(testUrl, {
      method: "HEAD",
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        "x-ads-region": "EMEA",
      }
    });

    res.status(200).json({
      ok: true,
      tokenOk,
      bucket,
      probeStatus: probe.status,
      probeOk: probe.ok,
      host: APS_OSS_URL
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e?.message || String(e),
      stack: e?.stack || null
    });
  }
}
