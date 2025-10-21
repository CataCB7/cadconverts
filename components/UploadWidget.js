// components/UploadWidget.js
import { useState, useEffect } from "react";
import { getApsToken, uploadViaProxy } from "../utils/uploadViaProxy";

export default function UploadWidget() {
  const [msg, setMsg] = useState("");
  const [file, setFile] = useState(null);

  // rate-limit UI state
  const [limitMsg, setLimitMsg] = useState("");
  const [blockedUntil, setBlockedUntil] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [jobId, setJobId] = useState(null);

  // countdown helper
  function fmtCountdown(ts) {
    const ms = Math.max(0, Number(ts) - Date.now());
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}h ${m}m ${s}s`;
  }

  // tick every second to refresh countdown text
  useEffect(() => {
    if (!blockedUntil) return;
    const id = setInterval(() => setLimitMsg((m) => (m ? m : m)), 1000);
    return () => clearInterval(id);
  }, [blockedUntil]);

  function onPick(e) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setMsg(f ? `Selected: ${f.name} (${f.size} bytes)` : "");
    setJobId(null);
    setLimitMsg("");
    setBlockedUntil(null);
  }

  // --- Upload (your previous test flow kept intact) ---
  async function doUpload() {
    if (!file) return;
    setMsg("Requesting APS token…");
    try {
      const { access_token } = await getApsToken();
      setMsg("Uploading via proxy…");
      const res = await uploadViaProxy(file, {
        bucket: "cadconverts-prod-us-123abc",
        objectKey: file.name.replace(/\s+/g, "-"),
        access_token,
      });
      setMsg(`✅ Upload complete: ${res.objectKey}`);
    } catch (err) {
      setMsg(`❌ Upload error: ${err?.message || err}`);
    }
  }

  // --- Start conversion: hits /api/convert-start and handles 429 ---
  async function startConvert(preferHighQuality = false) {
    if (!file) {
      setMsg("Please choose a file first.");
      return;
    }
    setIsStarting(true);
    setLimitMsg("");
    setBlockedUntil(null);
    setJobId(null);

    try {
      const r = await fetch("/api/convert-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          size: file.size,
          preferHighQuality,
        }),
      });

      if (r.status === 429) {
        const j = await r.json().catch(() => ({}));
        const resetAt = j?.resetAt ? Number(j.resetAt) : null;
        setBlockedUntil(resetAt);
        setLimitMsg(
          j?.message || "Free daily conversion limit reached."
        );
        setMsg("❌ Blocked by rate limit (429).");
        return;
      }

      if (!r.ok) {
        const txt = await r.text();
        setMsg(`❌ convert-start error: ${r.status} ${txt || ""}`);
        return;
      }

      const j = await r.json();
      setJobId(j?.jobId || null);
      setMsg(
        `✅ convert-start OK (v=${j?.version || "?"}) · jobId=${j?.jobId || "-"}`
      );
      // Continue your normal flow here if you want:
      // e.g. call /api/convert-run-md or /api/convert-run-da with j.jobId and file.name as objectKey
    } catch (e) {
      setMsg(`❌ Network error: ${e?.message || e}`);
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 520,
        padding: 16,
        border: "1px solid #eee",
        borderRadius: 12,
      }}
    >
      <div style={{ marginBottom: 8, fontWeight: 600 }}>Upload & Convert</div>

      <input
        type="file"
        onChange={onPick}
        accept=".dwg,.dxf,.step,.stp,.iges,.igs,.stl,.obj,.pdf"
      />

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={doUpload} disabled={!file}>
          Upload (test)
        </button>

        <button
          onClick={() => startConvert(false)}
          disabled={isStarting || !file || (blockedUntil && blockedUntil > Date.now())}
        >
          {isStarting ? "Starting…" : "Start convert (MD)"}
        </button>

        <button
          onClick={() => startConvert(true)}
          disabled={isStarting || !file || (blockedUntil && blockedUntil > Date.now())}
          title="High Quality via Design Automation"
        >
          {isStarting ? "Starting…" : "Start convert (DA)"}
        </button>
      </div>

      {msg && (
        <p style={{ marginTop: 8, fontSize: 14 }}>
          <span>{msg}</span>
          {jobId && (
            <>
              {" "}
              <br />
              <small>jobId: {jobId}</small>
            </>
          )}
        </p>
      )}

      {limitMsg && (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            border: "1px solid #f5c2c7",
            background: "#fff5f5",
            color: "#a92a2a",
            borderRadius: 8,
          }}
        >
          <strong>{limitMsg}</strong>
          {blockedUntil && (
            <div>Resets in ~ {fmtCountdown(blockedUntil)}</div>
          )}
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
            Sign in for higher daily limits.
          </div>
        </div>
      )}
    </div>
  );
}
