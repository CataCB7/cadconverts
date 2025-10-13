// File: pages/api/convert-start.js
// Pasul 2: persistăm statusul inițial în S3 prin proxy-ul tău (/upload)

import crypto from 'crypto'

const PROXY_BASE_URL = process.env.PROXY_BASE_URL // ex: https://proxy.cadconverts.com
const BUCKET_NAME = process.env.BUCKET_NAME // bucketul tău S3/compatible

async function saveInitialStatus({ jobId, method, filename, size }) {
  if (!PROXY_BASE_URL || !BUCKET_NAME) {
    console.warn('[convert-start] Missing PROXY_BASE_URL or BUCKET_NAME; skip persist.')
    return { saved: false }
  }

  const key = `jobs/${jobId}/status.json`
  const statusObj = {
    jobId,
    status: 'queued',
    method,
    received: { filename, size },
    updatedAt: new Date().toISOString()
  }
  const bodyStr = JSON.stringify(statusObj)
  const contentLength = Buffer.byteLength(bodyStr)

  // 1) cerem un signed URL de la proxy pentru PUT JSON în S3
  // Proxy-ul tău /upload ar trebui să întoarcă ceva de forma:
  // { uploadUrl: 'https://s3/..', publicUrl: 'https://s3/..' } sau { signedUrl: '...' }
  const signResp = await fetch(`${PROXY_BASE_URL}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, contentType: 'application/json' })
  })
  if (!signResp.ok) {
    const txt = await signResp.text()
    throw new Error(`/upload signing failed: ${txt}`)
  }
  const s = await signResp.json()
  const putUrl = s.uploadUrl || s.signedUrl || s.putUrl
  if (!putUrl) throw new Error('No PUT signed URL in /upload response')

  // 2) facem PUT cu statusul (atenție la Content-Length pentru S3)
  const put = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(contentLength)
    },
    body: bodyStr
  })
  if (!put.ok) {
    const t = await put.text()
    throw new Error(`PUT status.json failed: ${t}`)
  }

  return { saved: true, key, size: contentLength }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST'])
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {}

    const preferHighQuality = !!body.preferHighQuality // dacă user vrea DA direct
    const filename = body.filename ?? null
    const size = body.size ?? null

    // jobId stabil pentru follow-up
    const jobId = (crypto.randomUUID ? crypto.randomUUID() : crypto.createHash('sha256').update(String(Date.now())+Math.random()).digest('hex').slice(0,36))
    const method = preferHighQuality ? 'da' : 'md'

    // Pasul 2: persistăm imediat statusul "queued" în S3 prin proxy
    let persist = { saved: false }
    try {
      persist = await saveInitialStatus({ jobId, method, filename, size })
    } catch (e) {
      console.warn('[convert-start] persist warning:', e?.message || e)
      // nu oprim flow-ul — întoarcem totuși jobId + status queued
    }

    return res.status(200).json({
      ok: true,
      jobId,
      status: 'queued',
      method,
      received: { filename, size },
      persist
    })
  } catch (err) {
    console.error('[api/convert-start] error:', err)
    return res.status(500).json({ ok: false, error: 'Internal Server Error' })
  }
}
