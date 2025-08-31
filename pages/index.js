import { useEffect, useRef, useState } from 'react'

// importăm secțiunile de landing
import Hero from "../components/Hero";
import Benefits from "../components/Benefits";
import Pricing from "../components/Pricing";
import Trust from "../components/Trust";
import FAQ from "../components/FAQ";

// încarcă occt-import-js din CDN o singură dată și întoarce instanța
function loadOcct() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Client only'))
  if (!window.__occtPromise) {
    window.__occtPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js'
      s.async = true
      s.onload = () => {
        if (!window.occtimportjs) return reject(new Error('occt-import-js not found'))
        window.occtimportjs().then(resolve).catch(reject)
      }
      s.onerror = () => reject(new Error('Failed to load occt-import-js'))
      document.head.appendChild(s)
    })
  }
  return window.__occtPromise
}

// helper: face STL binar din rezultat (meshuri + indexuri)
function makeBinarySTL(result) {
  const meshes = result.meshes || []
  let triCount = 0
  for (const m of meshes) triCount += (m.index?.array?.length || 0) / 3
  const header = new Uint8Array(80) // gol
  const out = new ArrayBuffer(80 + 4 + triCount * 50)
  const view = new DataView(out)
  for (let i = 0; i < 80; i++) view.setUint8(i, header[i])
  view.setUint32(80, triCount, true)

  let offset = 84
  const v = (x, y, z) => ({ x, y, z })
  const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z)
  const cross = (a, b) => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
  const norm = (a) => {
    const l = Math.hypot(a.x, a.y, a.z) || 1
    return v(a.x / l, a.y / l, a.z / l)
  }

  for (const m of meshes) {
    const pos = m.attributes?.position?.array || []
    const idx = m.index?.array || []
    for (let i = 0; i < idx.length; i += 3) {
      const i0 = idx[i] * 3, i1 = idx[i + 1] * 3, i2 = idx[i + 2] * 3
      const p0 = v(pos[i0], pos[i0 + 1], pos[i0 + 2])
      const p1 = v(pos[i1], pos[i1 + 1], pos[i1 + 2])
      const p2 = v(pos[i2], pos[i2 + 1], pos[i2 + 2])
      const n = norm(cross(sub(p1, p0), sub(p2, p0)))

      view.setFloat32(offset + 0, n.x, true)
      view.setFloat32(offset + 4, n.y, true)
      view.setFloat32(offset + 8, n.z, true)
      view.setFloat32(offset + 12, p0.x, true)
      view.setFloat32(offset + 16, p0.y, true)
      view.setFloat32(offset + 20, p0.z, true)
      view.setFloat32(offset + 24, p1.x, true)
      view.setFloat32(offset + 28, p1.y, true)
      view.setFloat32(offset + 32, p1.z, true)
      view.setFloat32(offset + 36, p2.x, true)
      view.setFloat32(offset + 40, p2.y, true)
      view.setFloat32(offset + 44, p2.z, true)
      view.setUint16(offset + 48, 0, true)
      offset += 50
    }
  }
  return new Blob([out], { type: 'application/octet-stream' })
}

// helper: produce OBJ text din rezultat
function makeOBJ(result) {
  const meshes = result.meshes || []
  let text = ''
  let vOffset = 0
  for (const m of meshes) {
    const pos = m.attributes?.position?.array || []
    const idx = m.index?.array || []
    for (let i = 0; i < pos.length; i += 3) {
      text += `v ${pos[i]} ${pos[i + 1]} ${pos[i + 2]}\n`
    }
    for (let i = 0; i < idx.length; i += 3) {
      text += `f ${idx[i] + 1 + vOffset} ${idx[i + 1] + 1 + vOffset} ${idx[i + 2] + 1 + vOffset}\n`
    }
    vOffset += pos.length / 3
  }
  return new Blob([text], { type: 'text/plain' })
}

export default function Home() {
  const [remaining, setRemaining] = useState(2)
  const [format, setFormat] = useState('stl')
  const [email, setEmail] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    const used = parseInt(localStorage.getItem('cc_trial_used') || '0', 10)
    setRemaining(Math.max(0, 2 - used))
    const saved = localStorage.getItem('cc_email') || ''
    if (saved) setEmail(saved)
  }, [])

  async function handleConvert() {
    const used = parseInt(localStorage.getItem('cc_trial_used') || '0', 10)
    if (used >= 2) { alert('Free trial ended. Please upgrade.'); return; }
    const file = fileRef.current?.files?.[0]
    if (!file) { alert('Choose a file first.'); return; }
    if (!email) { alert('Enter your email.'); return; }
    if (file.size > 20 * 1024 * 1024) { alert('>20MB. Upgrade to Pro for large files.'); return; }

    const ext = (file.name.split('.').pop() || '').toLowerCase()
    const canClientFree = (['step','stp','iges','igs'].includes(ext) && ['stl','obj'].includes(format))

    setUploading(true)
    try {
      if (canClientFree) {
        const occt = await loadOcct()
        const buf = new Uint8Array(await file.arrayBuffer())
        const params = { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.5 }
        const result = (ext === 'step' || ext === 'stp') ? occt.ReadStepFile(buf, params) : occt.ReadIgesFile(buf, params)
        if (!result?.success) throw new Error('Import failed')

        let blob, outNameBase = file.name.replace(/\.[^.]+$/,'') || 'converted'
        blob = format === 'stl' ? makeBinarySTL(result) : makeOBJ(result)

        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${outNameBase}.${format}`
        a.click()
      } else {
        const form = new FormData()
        form.append('file', file)
        form.append('format', format)
        form.append('email', email)
        const res = await fetch('/api/convert', { method: 'POST', body: form })
        if (!res.ok) throw new Error(await res.text())
        const cd = res.headers.get('content-disposition') || ''
        let name = `converted.${format}`
        const m = /filename="([^"]+)"/.exec(cd); if (m) name = m[1]
        const blob = await res.blob()
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
      }

      localStorage.setItem('cc_trial_used', String(used + 1))
      localStorage.setItem('cc_email', email)
      setRemaining(Math.max(0, 2 - (used + 1)))
    } catch (e) {
      alert(e.message || 'Conversion failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <main>
      <Hero />
      <Benefits />

      {/* UI-ul tău de conversie */}
      <div id="convert" className="container">
        <div className="card">
          <h1 className="h1" style={{fontSize:24, marginBottom:12}}>Free Trial Converter</h1>
          <p className="lead">2 free conversions. STEP/IGES are converted in your browser. DWG/DXF → PDF via server API.</p>

          <div className="grid two" style={{marginTop:16}}>
            <div className="card">
              <h3 className="font-semibold">1) Choose file</h3>
              <input
                type="file"
                ref={fileRef}
                className="input"
                accept=".step,.stp,.iges,.igs,.stl,.obj,.dwg,.dxf,.pdf,.ipt,.iam"
              />
              <p className="lead" style={{marginTop:8, fontSize:13}}>
                Free on-device: <b>STEP/STP, IGES/IGS → STL/OBJ</b>. Others fallback to server.
              </p>
              <p className="lead" style={{marginTop:4, fontSize:13, color:'var(--muted)'}}>
                Inventor (IPT/IAM) available on Pro plan — cloud conversion.
              </p>
            </div>

            <div className="card">
              <h3 className="font-semibold">2) Options</h3>

              <div className="form-group">
                <label className="form-label">Output format</label>
                <select className="input" value={format} onChange={e=>setFormat(e.target.value)}>
                  <option value="stl">STL (.stl)</option>
                  <option value="obj">OBJ (.obj)</option>
                  <option value="step">STEP (.step/.stp)</option>
                  <option value="iges">IGES (.igs/.iges)</option>
                  <option value="dxf">DXF (.dxf)</option>
                  <option value="pdf">PDF (.pdf) — DWG/DXF only</option>
                  <option disabled>──────────────</option>
                  <option disabled>Inventor IPT/IAM → STEP (Pro)</option>
                  <option disabled>Inventor IPT/IAM → STL (Pro)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <div className="form-row">
                  <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com" />
                  <button className="btn" onClick={handleConvert} disabled={uploading} style={{whiteSpace:'nowrap', padding:'12px 18px'}}>
                    {uploading ? 'Converting…' : 'Convert & Download'}
                  </button>
                </div>
              </div>

              <p className="lead" style={{marginTop:8, fontSize:13}}>
                Trial left: {remaining}
              </p>
            </div>
          </div>

          <p className="lead" style={{marginTop:8, fontSize:12}}>
            Files ≤20MB on Free/Basic. Pro supports up to 100MB and assemblies.
          </p>
        </div>
      </div>

      <Pricing />
      <Trust />
      <FAQ />
    </main>
  )
}
