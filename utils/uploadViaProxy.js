// utils/uploadViaProxy.js
export async function getApsToken() {
  const r = await fetch("/api/aps-token", { cache: "no-store" });
  if (!r.ok) throw new Error("Failed to get APS token");
  return r.json(); // { access_token }
}

export async function uploadViaProxy(file, { bucket, objectKey, access_token }) {
  const url = new URL("https://proxy.cadconverts.com/upload");
  url.searchParams.set("bucket", bucket);
  url.searchParams.set("objectKey", objectKey);
  url.searchParams.set("token", access_token);

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // { ok:true, bucket, objectKey }
}
