// /pages/api/diag-aps-signed.js
import { getToken, ensureBucket } from "../../lib/aps";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const tok = await getToken();
    const bucket = await ensureBucket(tok.access_token);
    res.status(200).json({ ok: true, tokenOk: !!tok?.access_token, bucket });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
