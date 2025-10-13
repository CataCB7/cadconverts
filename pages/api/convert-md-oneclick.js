// pages/api/convert-md-oneclick.js
// Orchestrare: start -> run MD -> poll (cu diagnostic detaliat)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function readJsonSafe(resp) {
  const text = await resp.text().catch(() => '');
  try { return { ok: resp.ok, status: resp.status, json: text ? JSON.parse(text) : null, raw: text }; }
  catch { return { ok: resp.ok, status: resp.status, json: null, raw: text }; }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ ok:false, error:'Method Not Allowed' });
    }

    const { objectKey } = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!objectKey) return res.status(400).json({ ok:false, error:'Missing objectKey (.dwg in bucket)' });

    // Folosim automat originul curent (nu depindem de NEXT_PUBLIC_SITE_URL)
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers.host;
    const base  = `${proto}://${host}`;

    // 1) START
    const rStart = await fetch(`${base}/api/convert-start`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ filename: objectKey, size: 0 })
    });
    const sStart = await readJsonSafe(rStart);
    if (!sStart.ok || !sStart.json?.ok) {
      return res.status(sStart.status || 500).json({ ok:false, step:'start', detail: sStart });
    }
    const jobId = sStart.json.jobId;

    // 2) RUN MD
    const rRun = await fetch(`${base}/api/convert-run-md`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ jobId, objectKey })
    });
    const sRun = await readJsonSafe(rRun);
    if (!sRun.ok || !sRun.json?.ok) {
      return res.status(sRun.status || 500).json({ ok:false, step:'run-md', jobId, detail: sRun });
    }

    // 3) un prim POLL
    await sleep(600);
    const rPoll = await fetch(`${base}/api/convert-poll-md?jobId=${encodeURIComponent(jobId)}`);
    const sPoll = await readJsonSafe(rPoll);
    if (!sPoll.ok) {
      return res.status(sPoll.status || 500).json({ ok:false, step:'poll-md', jobId, detail: sPoll });
    }

    return res.status(200).json({
      ok: true,
      jobId,
      objectKey,
      start: sStart.json,
      run: sRun.json,
      poll: sPoll.json || sPoll.raw
    });
  } catch (err) {
    console.error('[api/convert-md-oneclick] error:', err);
    return res.status(500).json({ ok:false, error:String(err?.message || err) });
  }
}
