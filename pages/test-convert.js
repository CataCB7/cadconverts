// pages/test-convert.js
import { useEffect, useState, useRef } from "react";

const BUCKET = "cadconverts-prod-us-123abc";

export default function TestConvert() {
  const [files, setFiles] = useState([]);
  const [msg, setMsg] = useState("");
  const [urn, setUrn] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState("");
  const pollRef = useRef(null);

  // 1) listăm obiectele din bucket (ca în test-list)
  useEffect(() => {
    (async () => {
      try {
        const tok = await fetch("/api/aps-token").then(r => r.json());
        const r = await fetch(
          `https://developer.api.autodesk.com/oss/v2/buckets/${BUCKET}/objects`,
          { headers: { Authorization: `Bearer ${tok.access_token}` } }
        );
        const data = await r.json();
        setFiles(data.items || []);
      } catch (e) {
        setMsg(`Eroare listare: ${e.message || e}`);
      }
    })();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function startConvert(objectKey) {
    try {
      setMsg("Pornez conversia...");
      setStatus("");
      setProgress("");
      setUrn("");

      const r = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: BUCKET, objectKey, format: "pdf" }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || "Job submit failed");

      setUrn(data.urn);
      setMsg("Conversie pornită. Verific status...");

      // 2) poll status la fiecare 5s
      pollRef.current = setInterval(async () => {
        try {
          const s = await fetch(`/api/convert-status?urn=${encodeURIComponent(data.urn)}`).then(r => r.json());
          if (!s.ok) throw new Error(s.error || "status error");
          const manifest = s.manifest || {};
          const st = manifest.status || "";
          setStatus(st);
          // progress este în children[].progress (string gen "complete" sau procent)
          let prog = "";
          const ch = (manifest.derivatives?.[0]?.children) || [];
          if (ch.length && ch[0].progress) prog = ch[0].progress;
          setProgress(prog);

          if (st === "success") {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setMsg("✅ Gata! PDF generat.");
          } else if (st === "failed") {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setMsg("❌ Conversie eșuată.");
          }
        } catch (e) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setMsg(`Eroare status: ${e.message || e}`);
        }
      }, 5000);
    } catch (e) {
      setMsg(`❌ ${e.message || e}`);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 20 }}>
      <h1>🛠️ Conversie DWG/DXF → PDF (test)</h1>

      <section style={{ marginTop: 20 }}>
        <h3>Fișiere în bucket</h3>
        <ul>
          {files.map((f) => (
            <li key={f.objectKey} style={{ marginBottom: 8 }}>
              {f.objectKey} — {(f.size / 1024).toFixed(1)} KB{" "}
              <button
                onClick={() => startConvert(f.objectKey)}
                style={{ marginLeft: 12 }}
              >
                Convert to PDF
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        {urn && <div><b>URN:</b> <code>{urn}</code></div>}
        {status && <div><b>Status:</b> {status}</div>}
        {progress && <div><b>Progress:</b> {progress}</div>}
        {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      </section>
    </main>
  );
}
