import { useEffect, useRef, useState } from 'react'

export default function Home(){
  const [remaining,setRemaining]=useState(2)
  const [format,setFormat]=useState('step')
  const [email,setEmail]=useState('')
  const [uploading,setUploading]=useState(false)
  const fileRef=useRef(null)

  useEffect(()=>{
    const used=parseInt(localStorage.getItem('cc_trial_used')||'0',10)
    setRemaining(Math.max(0,2-used))
    const saved=localStorage.getItem('cc_email')||''
    if(saved) setEmail(saved)
  },[])

  async function handleConvert(){
    const used=parseInt(localStorage.getItem('cc_trial_used')||'0',10)
    if(used>=2){ alert('Free trial ended. Please upgrade.'); return; }
    const file=fileRef.current?.files?.[0]
    if(!file){ alert('Choose a file first.'); return; }
    if(!email){ alert('Enter your email.'); return; }
    if(file.size>20*1024*1024){ alert('>20MB. Upgrade to Pro for large files (≤100MB).'); return; }

    const form=new FormData()
    form.append('file',file)
    form.append('format',format)
    form.append('email',email)

    setUploading(true)
    try{
      const res=await fetch('/api/convert',{method:'POST',body:form})
      if(!res.ok) throw new Error(await res.text())
      const cd=res.headers.get('content-disposition')||''
      let name='converted.'+format
      const m=/filename="([^"]+)"/.exec(cd); if(m) name=m[1]
      const blob=await res.blob()
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a'); a.href=url; a.download=name; a.click()
      localStorage.setItem('cc_trial_used', String(used+1))
      localStorage.setItem('cc_email', email)
      setRemaining(Math.max(0,2-(used+1)))
    }catch(e){ alert(e.message||'Conversion failed') }
    finally{ setUploading(false) }
  }

  return (
    <div>
      <div className="nav">
        <div className="brand">CadConverts</div>
        <div style={{display:'flex',gap:12}}>
          <a className="btn ghost" href="/pricing">Pricing</a>
          <a className="btn ghost" href="/privacy">Privacy</a>
          <a className="btn ghost" href="/faq">FAQ</a>
        </div>
      </div>
      <div className="container">
        <div className="card">
          <h1>Convert DWG, DXF, STEP, STL, IGES, OBJ — and DWG → PDF</h1>
          <p>2 free conversions. True DWG & DWG→PDF via Autodesk Forge (when API keys are configured).</p>
          <div className="grid two">
            <div className="card">
              <h3>1) Choose file</h3>
              <input className="input" type="file" ref={fileRef} accept=".dwg,.dxf,.step,.stp,.stl,.igs,.iges,.obj,.pdf" />
            </div>
            <div className="card">
              <h3>2) Options</h3>
              <label>Output format</label>
              <select className="input" value={format} onChange={e=>setFormat(e.target.value)}>
                <option value="step">STEP (.step/.stp)</option>
                <option value="stl">STL (.stl)</option>
                <option value="iges">IGES (.igs/.iges)</option>
                <option value="obj">OBJ (.obj)</option>
                <option value="dxf">DXF (.dxf)</option>
                <option value="pdf">PDF (.pdf) — DWG/DXF only</option>
              </select>
              <div style={{height:8}}/>
              <label>Email</label>
              <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com" />
              <div style={{height:12}}/>
              <button className="btn" onClick={handleConvert} disabled={uploading}>{uploading?'Converting…':'Convert & Download'}</button>
              <p className="kpi">Trial left: {remaining}</p>
            </div>
          </div>
          <p style={{color:'#9aa3b2'}}>Files ≤20MB on Free/Basic. Pro supports up to 100MB and assemblies.</p>
        </div>
        <div className="footer">© {new Date().getFullYear()} CadConverts Ltd., Romania</div>
      </div>
    </div>
  )
}
