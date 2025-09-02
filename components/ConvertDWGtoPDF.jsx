"use client";
import React, { useCallback, useMemo, useRef, useState } from "react";
// FOLOSIM helperii EXISTENȚI care la tine deja merg
import { getApsToken, uploadViaProxy } from "../utils/uploadViaProxy";

const APS_BUCKET = "cadconverts-prod-us-123abc";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ""; // dacă e gol, folosește /api/... pe același domeniu

const isDWGorDXF = (name) => /\.(dwg|dxf)$/i.test(name);
const safeName = (name) => name.replace(/\s+/g, "-");

function base64Url(input) {
  if (typeof window === "undefined") return "";
  const b64 = window.btoa(input);
  return b64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function urnFrom(bucket, objectKey) {
  return `urn:adsk.objects:os.object:${bucket}/${objectKey}`;
}

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

// === UPLOAD prin PROXY-ul tău (cu bucket + objectKey + token) ===
async function uploadToProxy(file) {
  // 1) luăm tokenul APS
  const { access_token } = await getApsToken();

  // 2) stabilim objectKey (nume sigur)
  const objectKey = safeName(file.name);

  // 3) urcăm prin helperul tău (știe formatul corect pt. proxy)
  const up = await uploadViaProxy(file, {
    bucket: APS_BUCKET,
    objectKey,
    access_token, // helperul tău îl trimite cum cere proxy-ul (token/header)
  });

  if (!up?.ok) {
    // dacă proxy-ul a dat eroare, o propagăm clar
    throw new Error(up?.error || up?.message || "Upload failed");
  }

  // 4) returnăm datele necesare pasului următor
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convert start failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function pollStatusUntilSuccess(urnB64Url, opts) {
  const timeoutMs = (opts && opts.timeoutMs) || 5 * 60 * 1000; // 5 min
  const abortSignal = opts && opts.abortSignal;
  let backoff = (opts && opts.intervalMs) || 2000; // 2s
  const start = Date.now();

  while (true) {
    if (abortSignal && abortSignal.aborted) throw new Error("Conversion canceled by user");
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for conversion");

    const url = `${BASE_URL}/api/convert-status?urn=${encodeURIComponent(urnB64Url)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Status error (${res.status}): ${text}`);
    }
    const json = await res.json();
    if (json.status === "success") return json;
    if (json.status === "failed") {
      const msg = (json.details && json.details.message) || JSON.stringify(json.details || json);
      throw new Error(`Conversion failed: ${msg}`);
    }

    await wait(backoff);
    backoff = Math.min(backoff * 1.4, 8000);
  }
}

async function triggerDownloadPdf(urnB64Url, downloadName) {
  const url = `${BASE_URL}/api/download-pdf?urn=${encodeURIComponent(urnB64Url)}&name=${encodeURIComponent(downloadName)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Download failed (${res.status}): ${text}`);
  }
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = downloadName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
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

      const urnStr = urn.startsWith("urn:") ? urn : urnFrom(bucket, objectKey);
      const urnB64Url = base64Url(urnStr);

      setStatus("converting");
      setProgressNote("Converting…");
      await startConvertMD({ bucket, objectKey });
      await pollStatusUntilSuccess(urnB64Url, { abortSignal: ac.signal });

      setStatus("downloading");
      setProgressNote("Preparing download…");
      const safe = file.name.replace(/\.(dwg|dxf)$/i, "");
      await triggerDownloadPdf(urnB64Url, `${safe}.pdf`);

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
          <li>Upload prin proxy cu bucket+objectKey+token (exact ca în fluxul tău existent).</li>
          <li>Fișiere &gt;100MB: plan Pro sau optimizează desenul.</li>
          <li>După succes, descărcarea pornește automat.</li>
        </ul>
      </div>
    </div>
  );
}
