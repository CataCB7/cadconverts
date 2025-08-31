// /pages/api/net-probe.js
export const config = { runtime: "nodejs", regions: ["iad1"] };

export default async function handler(req, res) {
  try {
    const url = "https://oss.api.autodesk.com/oss/v2/ping";
    const r = await fetch(url, { method: "GET" });
    const text = await r.text().catch(()=>"(no body)");
    res.status(200).json({
      host: "oss.api.autodesk.com",
      status: r.status,
      ok: r.ok,
      body: text.slice(0, 200)
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
}
