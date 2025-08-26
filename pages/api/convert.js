import { IncomingForm } from 'formidable'
import fs from 'fs'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res){
  if(req.method!=='POST') return res.status(405).send('Method not allowed')
  const form=new IncomingForm({ keepExtensions:true })
  form.parse(req, async (err, fields, files) => {
    if(err) return res.status(400).send('Invalid form data')
    try{
      const f=files.file
      if(!f) return res.status(400).send('No file uploaded')
      const desired=String(fields.format||'step').toLowerCase()
      const origName=f.originalFilename||'file'
      const ext=(origName.split('.').pop()||'').toLowerCase()
      const data=await fs.promises.readFile(f.filepath)

      let outNameBase = origName.replace(/\.[^.]+$/,'') || 'converted'
      let outName = `${outNameBase}.${desired}`

      if((ext==='dwg' || ext==='dxf') && desired==='pdf'){
        res.setHeader('X-Forge-Info','DWG/DXF→PDF would be processed via Autodesk Forge Design Automation')
      }
      if(ext==='dwg' && desired!=='pdf'){
        res.setHeader('X-Forge-Info','DWG conversion would be processed via Autodesk Forge')
      }

      res.setHeader('Content-Type','application/octet-stream')
      res.setHeader('Content-Disposition',`attachment; filename="${outName}"`)
      res.status(200).send(data)
      try{ await fs.promises.unlink(f.filepath) }catch{}
    }catch(e){
      console.error(e); res.status(500).send('Conversion failed')
    }
  })
}
