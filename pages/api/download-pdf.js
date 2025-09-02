// pages/api/download-pdf.js
// Descărcă primul PDF găsit în manifestul Model Derivative pentru un URN dat.
// Usage (browser): /api/download-pdf?urn=<BASE64_URN>&name=optional.pdf

const REGION_HEADER = { "x-ads-region": "US" };

export const config = { api: { bodyParser: false } };

async function getApsToken(scopes = "data:read bucket:read") {
  const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;
  if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
    throw new Error("Missing APS_CLIENT_ID/APS_CLIENT_SECRET");
  }
  const body = new URLSearchParams({
    client_id: APS_CLIENT_ID,
    client_secret: APS_CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: scopes,
  });
  const r = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // { access_token, expires_in, ... }
}

function normUrn(raw) {
  if (!raw) return null;
  return raw.startsWith("urn:") ? raw.substring(4) : raw;
}

// caută recursiv primul derivative cu mime "application/pdf"
function findPdfDerivative(node) {
  if (!node || typeof node !== "object") return null;
  if (node.mime === "application/pdf" && node.urn) return node.urn;
  const kids = node.children || node.derivatives || [];
  for (const ch of kids) {
    const hit = findPdfDerivative(ch);
    if (hit) return hit;
  }
  return null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const urnParam = normUrn(String(req.query.urn || "").trim());
    if (!urnParam) {
      return res.status(400).json({ error: "Missing ?urn=<base64_urn>" });
    }
    const downloadName = String(req.query.name || "drawing.pdf");

    // 1) token
    const { access_token } = await getApsToken();

    // 2) manifest
    const man = await fetch(
      `https://developer.api.autodesk.com/modelderivative/v2/designdata/${encodeURIComponent(
        urnParam
      )}/manifest`,
      { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } }
    );
    const manText = await man.text();
    if (!man.ok) {
      return res.status(man.status).json({ error: "manifest failed", details: manText });
    }
    const manifest = manText ? JSON.parse(manText) : {};
    if ((manifest.status || "").toLowerCase() !== "success") {
      return res.status(409).json({ error: "manifest not ready", status: manifest.status || "unknown" });
    }

    // 3) găsim derivativeUrn pentru PDF
    const derivatives = manifest.derivatives || [];
    let derivativeUrn = null;
    for (const d of derivatives) {
      derivativeUrn = findPdfDerivative(d);
      if (derivativeUrn) break;
    }
    if (!derivativeUrn) {
      return res.status(404).json({ error: "No PDF derivative found in manifest" });
    }

    // 4) obținem URL + signed cookies (CloudFront) pentru acel derivative
    const signed = await fetch(
      `https://developer.api.autodesk.com/modelderivative/v2/designdata/${encodeURIComponent(
        urnParam
      )}/manifest/${encodeURIComponent(derivativeUrn)}/signedcookies`,
      { headers: { Authorization: `Bearer ${access_token}`, ...REGION_HEADER } }
    );

    const signedBody = await signed.json().catch(() => ({}));
    if (!signed.ok || !signedBody?.url) {
      const errTxt = await signed.text().catch(() => "");
      return res.status(signed.status || 500).json({
        error: "signedcookies failed",
        details: errTxt || signedBody,
      });
    }

    // 5) API-ul ne dă set-cookie în header — le convertim în query-uri (Policy/Signature/Key-Pair-Id)
    // vezi: APS blog "Download Derivative Files ... without setting cookies first"
    const rawSetCookie =
      signed.headers.get("set-cookie") || signed.headers.get("Set-Cookie") || "";
    // uneori vin concatenat cu virgule -> le spargem într-o listă cu ; și filtrăm CloudFront-*
    const cookieList = rawSetCookie.replaceAll(",", ";").split("; ").filter(Boolean);
    let policy = "", signature = "", keyPair = "";
    for (const c of cookieList) {
      if (c.startsWith("CloudFront-Policy=")) policy = c.split("=")[1];
      if (c.startsWith("CloudFront-Signature=")) signature = c.split("=")[1];
      if (c.startsWith("CloudFront-Key-Pair-Id=")) keyPair = c.split("=")[1];
    }
    if (!policy || !signature || !keyPair) {
      return res.status(500).json({ error: "Missing signed cookies (Policy/Signature/Key-Pair-Id)" });
    }

    const finalUrl =
      `${signedBody.url}?Policy=${encodeURIComponent(policy)}` +
      `&Signature=${encodeURIComponent(signature)}` +
      `&Key-Pair-Id=${encodeURIComponent(keyPair)}`;

    // 6) descarcă PDF-ul și îl returnăm ca attachment
    const pdf = await fetch(finalUrl);
    if (!pdf.ok) {
      const t = await pdf.text().catch(() => "");
      return res.status(pdf.status).json({ error: "PDF download failed", details: t });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);

    // stream către client
    const reader = pdf.body.getReader();
    const encoder = new TextEncoder(); // not used, but avoids some bundlers warnings
    res.status(200);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (e) {
    console.error("download-pdf error:", e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
