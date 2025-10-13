// pages/api/convert-md-oneclick.js
// Orchestrare rapidă: start -> run MD -> un prim poll (fără a bloca mult serverul)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ ok:false, error:'Method Not Allowed' });
    }

    const { objectKey } = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!objectKey) return res.status(400).json({ ok:false, error:'Missing objectKey (.dwg in bucket)' });

    // 1) START
    const rStart = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/convert-start`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ filename: objectKey, size: 0 })
    });
    const jStart = await rStart.json();
    if (!rStart.ok || !jStart.ok) {
      return res.status(rStart.status || 500).json({ ok:false, step:'start', error: jStart?.error || 'start failed', detail: jStart });
    }
    const jobId = jStart.jobId;

    // 2) RUN MD
    const rRun = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/convert-run-md`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ jobId, objectKey })
    });
    const jRun = await rRun.json();
    if (!rRun.ok || !jRun.ok) {
      return res.status(rRun.status || 500).json({ ok:false, step:'run-md', error: jRun?.error || 'run failed', detail: jRun, jobId });
    }

    // 3) un prim POLL (opțional, scurt)
    await sleep(500); // mică pauză
    const rPoll = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/convert-poll-md?jobId=${encodeURIComponent(jobId)}`);
    const jPoll = await rPoll.json();

    return res.status(200).json({
      ok: true,
      jobId,
      objectKey,
      start: jStart,
      run: jRun,
      poll: jPoll,
    });
  } catch (err) {
    console.error('[api/convert-md-oneclick] error:', err);
    return res.status(500).json({ ok:false, error:'Internal Server Error' });
  }
}
