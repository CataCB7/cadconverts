import { IncomingForm } from 'formidable'
import fs from 'fs'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res){
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).send('Method not allowed')
  }

  const form = new IncomingForm({
    keepExtensions: true,
    maxFileSize: 200 * 1024 * 1024, // 200MB
  })

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).send('Invalid form data')
    const f = files.file
    if (!f) return res.status(400).send('No file uploaded')

    // extragem câmpurile trimise din frontend
    const desired = String(fields.format || 'bin').toLowerCase()
    const email   = String(fields.email  || '')
    const job     = String(fields.job    || 'not-set')

    // nume de fișier de ieșire
    const origName = f.originalFilename || 'file'
    const base = (origName.replace(/\.[^.]+$/,'') || 'converted')
    const outName = `${base}.${desired}`

    // conținut STUB (placeholder) — îl vom înlocui când legăm APS
    const text = [
      'CadConverts cloud stub ✓',
      `requested_output=${desired}`,
      `job=${job}`,
      `email=${email}`,
      '(This is a placeholder file until Autodesk Platform Services is enabled.)',
      ''
    ].join('\n')

    const buf = Buffer.from(text, 'utf8')

    // content-type simplu în funcție de extensie
    const mime =
      desired === 'pdf' ? 'application/pdf' :
      desired === 'dxf' ? 'application/dxf' :
      desired === 'stl' ? 'model/stl' :
      desired === 'obj' ? 'text/plain' :
      desired === 'step' || desired === 'stp' ? 'application/step' :
      desired === 'iges' || desired === 'igs' ? 'application/iges' :
      'application/octet-stream'

    // headere de ajutor (vizibile în Network tab / pentru debug)
    res.setHeader('X-Info', 'Stub response — real APS conversions coming next')
    if (job !== 'not-set') res.setHeader('X-Job', job)

    // download
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Disposition', `attachment; filename="${outName}"`)
    res.status(200).send(buf)

    // curățăm fișierul temporar urcat
    try { await fs.promises.unlink(f.filepath) } catch {}
  })
}
