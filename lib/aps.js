// /lib/aps.js
const APS_BASE = "https://developer.api.autodesk.com";

export async function getToken(scopes = [
  "data:read",
  "data:write",
  "bucket:create",
  "bucket:read"
]) {
  const form = new URLSearchParams();
  form.set("client_id", process.env.APS_CLIENT_ID);
  form.set("client_secret", process.env.APS_CLIENT_SECRET);
  form.set("grant_type", "client_credentials");
  form.set("scope", scopes.join(" "));

  const r = await fetch(`${APS_BASE}/authentication/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!r.ok) throw new Error(`APS auth failed ${r.status}`);
  return r.json(); // { access_token, token_type, expires_in }
}

export async function ensureBucket(token, bucketKey = process.env.APS_BUCKET, policyKey = "persistent") {
  // verifică dacă există bucket-ul, dacă nu – îl creează
  let head = await fetch(`${APS_BASE}/oss/v2/buckets/${bucketKey}/details`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (head.status === 404) {
    const r = await fetch(`${APS_BASE}/oss/v2/buckets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bucketKey,
        policyKey, // persistent | transient | temporary
      }),
    });

    if (!r.ok && r.status !== 409) {
      const t = await r.text().catch(() => "");
      throw new Error(`Create bucket failed ${r.status}: ${t}`);
    }
  }
  return bucketKey;
}

export function objectUrn(bucketKey, objectKey) {
  const raw = `urn:adsk.objects:os.object:${bucketKey}/${objectKey}`;
  return Buffer.from(raw).toString("base64");
}

export const APS_BASE_URL = APS_BASE;
