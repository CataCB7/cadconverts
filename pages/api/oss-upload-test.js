// /pages/api/oss-upload-test.js
import * as aps from "../../lib/aps";
import { Agent } from "undici"; // built-in în Node 18+ (folosit de fetch)

export const config = {
  runtime: "nodejs",
  regions: ["iad1"], // US-East
};

const OSS_HOST = "https://oss.api.autodesk.com";
const ipv4Agent = new Agent({ connect: { family: 4, hostname: "oss.api.autodesk.com" } });

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const tok = await aps.getToken();
    const bucket = await aps.ensureBucket(tok.access_token); // US

    const objectKey = `diag-${Date.now()}.txt`;
    const data = Buffer.from("hello from cadconverts");

    const url = `${OSS_HOST}/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(objectKey)}`;
    const headers = {
      Authorization: `Bearer ${tok.access_token}`,
      "x-ads-region": "US",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(data.length),
      Connection: "keep-alive",
    };

    const up = await fetch(url, { method: "PUT", headers, body: data, dispatcher: ipv4Agent });
    const text = await up.text().catch(()=>"(no body)");
    const respHeaders = {}; up.headers.forEach((v,k)=>respHeaders[k]=v);

    return res.status(200).json({
      tryUrl: url,
      status: up.status,
      ok: up.ok,
      responseHeaders: respHeaders,
      responseBody: safe(text),
      bucket,
      objectKey,
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
}
function safe(t){ try { return JSON.parse(t) } catch { return t } }
