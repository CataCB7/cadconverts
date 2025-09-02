"use client";
import React, { useCallback, useMemo, useRef, useState } from "react";
// folosim helperii tăi existenți (funcționează deja în alte secțiuni)
import { getApsToken, uploadViaProxy } from "../utils/uploadViaProxy";

const APS_BUCKET = "cadconverts-prod-us-123abc";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ""; // dacă e gol, rutele /api sunt locale

const isDWGorDXF = (name) => /\.(dwg|dxf)$/i.test(name);
const safeName = (name) => name.replace(/\s+/g, "-");

// === IMPORTANT: la tine e base64 standard (cu btoa), nu url-safe ===
function toBase64(plain) {
  if (typeof window === "undefined") return "";
  return window.btoa(plain);
}

function urnFrom(bucket, objectKey) {
  return `urn:adsk.objects:os.object:${bucket}/${objectKey}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// === Upload prin proxy-ul tău (bucket + objectKey + token) ===
async function uploadToProxy(file) {
  // 1) token APS
  const { access_token } = await getApsToken();

  // 2) cheie sigură
  const objectKey = safeName(file.name);

  // 3) upload via helper-ul tău (știe formatul corect pt. proxy)
  const up = await uploadViaProxy(file, {
    bucket: APS_BUCKET,
    objectKey,
    access_token,
  });

  if (!up?.ok) {
    throw new Error(up?.error || up?.message || "Upload failed");
  }

  // 4) return info
  return {
    bucket: APS_BUCKET,
    objectKey,
    urn: urnFrom(APS_BUCKET, objectKey),
  };
}

async function startConvertMD(params) {
  const res = await fetch(`${BASE_URL}/api/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params), // { bucket, objectKey }
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Convert start failed (${res.status}): ${JSON.stringify(json)}`);
  }
  // dacă backend-ul tău răspunde cu {ok:false, error:...} dar 200, prindem și asta:
  if (json && json.ok === false) {
    throw new Error(json.error || "Convert start returned ok:false");
  }
  return json; // îl păstrăm dacă vrei să-l folosești
}

// === POLL robust: suportă atât {status} cât și { ok, manifest:{status} } ===
async function pollStatusUntilSuccess(urnB64, { timeoutMs = 5 * 60 * 1000, intervalMs = 2000, abortSignal } = {}) {
  const start = Date.now();
  let delay = intervalMs;

  while (true) {
    if (abortSignal?.aborted) throw new Error("Conversion canceled by user");
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for conversion");

    const url = `${BASE_URL}/api/convert-status?urn=${encodeURIComponent(urnB64)}`;
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Status error (${res.status}): ${JSON.stringify(json)}`);
    }

    // 1) formatul tău: { ok, manifest: { status } }
    const manStatus = json?.manifest?.status;
    if (json?.ok && manStatus) {
      if (manStatus === "success") return json;
      if (manStatus === "failed") {
        const msg = json?.manifest?.derivatives?.[0]?.messages?.[0]?.message || "Conversion failed";
        throw new Error(msg);
      }
      // inprogress -> continuăm
    }

    // 2) fallback: { status: "success" | "failed" | "inprogress" }
    if (typeof json?.status === "string") {
      if (json.status === "success") return json;
      if (json.status === "failed") {
        const msg = json?.details?.message || "Conversion failed";
        throw new Error(msg);
      }
    }

    await sleep(delay);
    delay = Math.min(delay * 1.4, 8000);
  }
}

async function triggerDownloadPdf(urnB64, downloadName) {
  const url = `${BASE_URL}/api/download-pdf?urn=${encodeURIComponent(urnB64)}&name=${encodeURIComponent(downloadName)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Download failed (${res.status}): ${text}`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = downloadName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function ConvertDWGtoPDF() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle"); // idle|uploading|converting|downloading|done|error
  const [message, setMessage] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const abortRef = useRef(null);

  const disabled = useMemo(
    () => status === "uploading" || status === "converting" || status === "downloading",
    [status]
  );

  const onFileChange = useCallback((e) => {
    const f = (e.target.files && e.target.files[0]) || null;
    setFile(f);
    setMessage("");
    setStatus("idle");
  }, []);

  const onConvert = useCallback(async () => {
    if (!file) {
      setMessage("Selectează un fișier DWG/DXF");
      setStatus("error");
      return;
    }
    if (!isDWGorDXF(file.name)) {
      setMessage("Fișierul trebuie să fie .dwg sau .dxf");
      setStatus("error");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setMessage("Fișierul depășește 100MB. Treci pe planul Pro sau optimizează desenul (PURGE/OVERKILL).");
      setStatus("error");
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      setStatus("uploading");
      setProgressNote("Uploading…");
      const { bucket, objectKey, urn } = await uploadToProxy(file);

      // URN -> base64 standard (cum folosești deja în celelalte rute)
      const urnStr = urn.startsWith("urn:") ? urn : urnFrom(bucket, objectKey);
      const urnB64 = toBase64(urnStr);

      setStatus("converting");
      setProgressNote("Converting…");
      await startConvertMD({ bucket, objectKey }); // dacă întoarce {ok:false}, acum aruncă eroare
      await pollStatusUntilSuccess(urnB64, { abortSignal: ac.signal });

      setStatus("downloading");
      setProgressNote("Preparing download…");
      const base = file.name.replace(/\.(dwg|dxf)$/i, "");
      await triggerDownloadPdf(urnB64, `${base}.pdf`);

      setStatus("done");
      setMessage("PDF descărcat cu succes ✅");
      setProgressNote("");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setMessage(err?.message || "A apărut o eroare la conversie");
    } finally {
      abortRef.current = null;
    }
  }, [file]);

  const onCancel = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setProgressNote("");
    setStatus("idle");
    setMessage("Conversie anulată");
  }, []);

  return (
    <div className="w-full max-w-xl mx-auto p-6 rounded-2xl shadow border bg-white">
      <h2 className="text-2xl font-semibold mb-2">DWG/DXF → PDF</h2>
      <p className="text-sm text-gray-600 mb-4">Conversie prin Autodesk Model Derivative (SVF2 + PDF). Fișiere &lt; 100MB.</p>

      <div className="flex flex-col gap-3">
        <input
          type="file"
          accept=".dwg,.dxf"
          onChange={onFileChange}
          className="file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={onConvert}
            disabled={disabled || !file}
            className="px-4 py-2 rounded-2xl bg-black text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "uploading" || status === "converting" ? "Converting…" : "Convert & Download PDF"}
          </button>

        {(status === "uploading" || status === "converting") && (
            <button onClick={onCancel} className="px-3 py-2 rounded-2xl border">Cancel</button>
          )}
        </div>

        {progressNote && <div className="text-sm text-gray-700">{progressNote}</div>}

        {message && (
          <div className={`text-sm ${status === "error" ? "text-red-600" : "text-green-700"}`}>{message}</div>
        )}

        <ul className="text-xs text-gray-500 list-disc pl-5 mt-2">
          <li>Compatibil cu răspunsul tău `{ ok, manifest:{ status } }` la /api/convert-status.</li>
          <li>Folosește URN în base64 standard (btoa), ca în celelalte rute.</li>
          <li>După „success”, pornește download automat al PDF-ului.</li>
        </ul>
      </div>
    </div>
  );
}
