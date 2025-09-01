// pages/test-list.js
import { useEffect, useState } from "react";

export default function TestListPage() {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setError("");
        const r = await fetch("/api/aps-token");
        if (!r.ok) throw new Error("Nu pot lua token APS");
        const { access_token } = await r.json();

        // bucket-ul tău
        const bucket = "cadconverts-prod-us-123abc";

        // cerem lista obiectelor
        const resp = await fetch(
          `https://developer.api.autodesk.com/oss/v2/buckets/${bucket}/objects`,
          {
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          }
        );

        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.reason || JSON.stringify(data));

        setFiles(data.items || []);
      } catch (err) {
        setError(err.message || String(err));
      }
    }
    load();
  }, []);

  return (
    <main style={{ maxWidth: 600, margin: "40px auto", padding: 20 }}>
      <h1>📂 Fișiere în bucket</h1>
      {error && <p style={{ color: "red" }}>Eroare: {error}</p>}
      {files.length === 0 && !error && <p>Nu s-au găsit fișiere...</p>}
      <ul>
        {files.map((f) => (
          <li key={f.objectId}>
            {f.objectKey} — {(f.size / 1024).toFixed(1)} KB
          </li>
        ))}
      </ul>
    </main>
  );
}
