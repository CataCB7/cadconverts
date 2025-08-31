// /pages/api/oss-bucket-info.js
import * as aps from "../../lib/aps";

export default async function handler(req, res) {
  try {
    const tok = await aps.getToken();
    const bucket = await aps.ensureBucket(tok.access_token); // creează dacă lipsește

    // Citește detalii bucket (region/policy)
    const r = await fetch(`${aps.APS_BASE_URL}/oss/v2/buckets/${bucket}/details`, {
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        "x-ads-region": "US", // trebuie să fie US acum
      },
    });
    const body = await r.text();
    res.status(200).json({
      ok: r.ok,
      status: r.status,
      bucket,
      details: safeJson(body),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

function safeJson(t) { try { return JSON.parse(t); } catch { return t; } }
