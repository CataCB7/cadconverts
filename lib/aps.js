// /lib/aps.js
const APS_BASE = "https://developer.api.autodesk.com";

export async function getToken(scopes = [
  "data:read",
  "data:write",
  "bucket:create",
  "bucket:read",
  "bucket:write"     // <-- adăugat
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
  return r.json();
}
