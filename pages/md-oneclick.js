// pages/md-oneclick.js
import { useEffect, useState } from 'react';

export default function MdOneClickPage() {
  const [items, setItems] = useState([]);
  const [objectKey, setObjectKey] = useState('');
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);

  // listăm obiectele la intrarea pe pagină
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/oss-list');
        const j = await r.json();
        const list = (j.items || []).filter(it => /\.dwg$/i.test(it.objectKey));
        setItems(list);
        if (list[0]) setObjectKey(list[0].objectKey);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // mic util pt. log
  const pushLog = (line) => setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`]);

  // pornește one-click MD
  const start = async () => {
    if (!objectKey) return;
    setBusy(true);
    setStatus(null);
    setJobId('');
    setLog([]);

    try {
      pushLog(`Start oneclick pentru: ${objectKey}`);
      const r = await fetch('/api/convert-md-oneclick', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ objectKey })
      });
      const j = await r.json();
      if (!j.ok) {
        pushLog(`Eroare oneclick: ${j.error || j.step || 'unknown'}`);
        setBusy(false);
        return;
      }
      setJobId(j.jobId);
      setStatus(j.poll);
      pushLog(`Job creat: ${j.jobId}; status inițial: ${j.poll?.status || 'n/a'}`);

      // începem polling până devine done
      pollUntilDone(j.jobId);
    } catch (e) {
      console.error(e);
      pushLog(`Throw: ${String(e)}`);
      setBusy(false);
    }
  };

  // polling la 2s
  const pollUntilDone = async (jid) => {
    let stopped = false;
    while (!stopped) {
      try {
        await new Promise(r=>setTimeout(r, 2000));
        const r = await fetch('/api/convert-poll-md?jobId=' + encodeURIComponent(jid));
        const j = await r.json();
        setStatus(j);
        pushLog(`poll: ${j.status}${j.progress ? ` (${j.progress})` : ''}`);
        if (j.status === 'done' || j.status === 'failed') {
          stopped = true;
          setBusy(false);
        }
      } catch (e) {
        pushLog(`poll error: ${String(e)}`);
        setBusy(false);
        stopped = true;
      }
    }
  };

  const downloadHref = jobId ? `/api/download-md-pdf?jobId=${encodeURIComponent(jobId)}` : '#';

  return (
    <div style={{maxWidth: 900, margin: '40px auto', padding: 16, fontFamily: 'ui-sans-serif, system-ui'}}>
      <h1 style={{fontSize: 24, fontWeight: 700, marginBottom: 8}}>DWG → PDF (MD) — One-Click</h1>
      <p style={{opacity:.8, marginBottom: 16}}>Alege un DWG din bucket și pornește conversia.</p>

      <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom: 12}}>
        <select
          value={objectKey}
          onChange={e=>setObjectKey(e.target.value)}
          style={{padding:'8px 10px', minWidth: 320}}
        >
          {items.map(it => (
            <option key={it.objectKey} value={it.objectKey}>{it.objectKey}</option>
          ))}
        </select>

        <button
          onClick={start}
          disabled={!objectKey || busy}
          style={{padding:'10px 16px', borderRadius:8, border:'1px solid #222', background:'#111', color:'#fff', cursor: busy ? 'not-allowed' : 'pointer'}}
        >
          {busy ? 'Lucrez…' : 'Convertește (MD)'}
        </button>

        {status?.status === 'done' && (
          <a
            href={downloadHref}
            style={{padding:'10px 16px', borderRadius:8, border:'1px solid #0a7', color:'#0a7', textDecoration:'none'}}
          >
            Descarcă PDF
          </a>
        )}
      </div>

      <div style={{marginBottom:8}}>
        <strong>JobId:</strong> {jobId || '—'}
      </div>
      <div style={{marginBottom:16}}>
        <strong>Status:</strong> {status?.status || '—'}{status?.progress ? ` (${status.progress})` : ''}
      </div>

      <details open>
        <summary style={{cursor:'pointer', marginBottom:8}}>Log</summary>
        <pre style={{background:'#0b0b0b', color:'#dcdcdc', padding:12, borderRadius:8, maxHeight:260, overflow:'auto'}}>
{log.join('\n') || '—'}
        </pre>
      </details>
    </div>
  );
}
