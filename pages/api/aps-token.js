// /pages/api/aps-token.js
import { getToken } from "../../lib/aps";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    const tok = await getToken(); // { access_token, expires_in }
    // trimitem doar ce e necesar pe client
    res.status(200).json({
      access_token: tok.access_token,
      expires_in: tok.expires_in,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
