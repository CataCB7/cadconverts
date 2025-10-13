// File: pages/api/convert-start.js

import crypto from 'crypto'

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST'])
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
    }

    // NU atinge /api/convert existent.
    // Acesta este SKELETON-ul pentru orchestrare (pasul 1): doar creează jobId și marchează status "queued".
    // În pașii 2+ vom scrie statusul în S3 și vom porni MD→DA.

    const body = (req.body && typeof req.body === 'object') ? req.body : {}

    const preferHighQuality = !!body.preferHighQuality // dacă user vrea DA direct
    const filename = body.filename ?? null
    const size = body.size ?? null

    // jobId stabil pentru follow-up
    const jobId = (crypto.randomUUID ? crypto.randomUUID() : crypto.createHash('sha256').update(String(Date.now())+Math.random()).digest('hex').slice(0,36))

    return res.status(200).json({
      ok: true,
      jobId,
      status: 'queued',
      method: preferHighQuality ? 'da' : 'md',
      received: { filename, size },
      message: 'Job creat. În pasul 2 vom persista statusul și vom porni MD cu fallback DA.'
    })
  } catch (err) {
    console.error('[api/convert-start] error:', err)
    return res.status(500).json({ ok: false, error: 'Internal Server Error' })
  }
}
