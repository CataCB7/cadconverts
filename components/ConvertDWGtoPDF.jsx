// DWG→PDF Frontend Integration (Next.js + React + TypeScript)
// Assumptions:
// - You already have the backend routes live:
//   POST   /api/convert                 -> starts MD job (SVF2 + PDF)
//   GET    /api/convert-status?urn=...  -> polls MD manifest until success
//   GET    /api/download-pdf?urn=...&name=... -> streams the PDF
//   GET    /api/aps-token               -> (not used here, but exists)
// - You have a proxy uploader at: https://proxy.cadconverts.com/upload
//   which accepts multipart/form-data with the DWG/DXF file and returns JSON like:
//   { bucket: string, objectKey: string, urn?: string }
//   If `urn` is absent, we can derive it via Base64URL from bucket/objectKey
//
// Drop this file somewhere like: components/ConvertDWGtoPDF.tsx
// Then import it in your main page.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---------------------- Helpers ----------------------
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ""; // e.g., https://www.cadconverts.com
const PROXY_UPLOAD = "https://proxy.cadconverts.com/upload"; // already live

const isDWGorDXF = (name: string) => /\.(dwg|dxf)$/i.test(name);

function base64Url(input: string) {
  if (typeof window === "undefined") return "";
  const b64 = window.btoa(input);
  return b64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

// Compute URN if backend/proxy does not return one
function urnFrom(bucket: string, objectKey: string) {
  return `urn:adsk.objects:os.object:${bucket}/${objectKey}`;
}

// Simple sleep
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

// ---------------------- API Calls ----------------------
async function uploadToProxy(file: File): Promise<{ bucket: string; objectKey: string; urn: string }>{
  const fd = new FormData();
  fd.append("file", file);
  // optional: target bucket or folder; if your proxy requires, add fields here
  // fd.append("bucket", "cadconverts-prod-us-123abc");

  const res = await fetch(PROXY_UPLOAD, { method: "POST", body: fd, credentials: "omit" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  const bucket = json.bucket;
  const objectKey = json.objectKey || json.object_key || json.key;
  const urn = json.urn || urnFrom(bucket, objectKey);
  if (!bucket || !objectKey) throw new Error("Proxy did not return bucket/objectKey");
  return { bucket, objectKey, urn };
}

async function startConvertMD(params: { bucket: string; objectKey: string }) {
  const res = await fetch(`${BASE_URL}/api/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convert start failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function pollStatusUntilSuccess(urnB64Url: string, opts?: { timeoutMs?: number; intervalMs?: number; abortSignal?: AbortSignal }) {
  const timeoutMs = opts?.timeoutMs ?? 5 * 60 * 1000; // 5 minutes
  const intervalMs = opts?.intervalMs ?? 2000; // 2s
  const start = Date.now();
  // Exponential backoff cap
  let backoff = intervalMs;

  while (true) {
    if (opts?.abortSignal?.aborted) throw new Error("Conversion canceled by user");
    if (Date.now() - start > timeoutMs) throw new Error("Timed out waiting for conversion");

    const url = `${BASE_URL}/api/convert-status?urn=${encodeURIComponent(urnB64Url)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Status error (${res.status}): ${text}`);
    }
    const json = await res.json();
    // Expecting something like { status: 'success' | 'inprogress' | 'failed', details?: any }
    if (json.status === "success") return json;
    if (json.status === "failed") {
      const msg = json.details?.message || JSON.stringify(json.details || json);
      throw new Error(`Conversion failed: ${msg}`);
    }

    await wait(backoff);
    backoff = Math.min(backoff * 1.4, 8000);
  }
}

async function triggerDownloadPdf(urnB64Url: string, downloadName: string) {
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

// ---------------------- UI Component ----------------------
export default function ConvertDWGtoPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "converting" | "downloading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [progressNote, setProgressNote] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const disabled = useMemo(() => status === "uploading" || status === "converting" || status === "downloading", [status]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
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
    if (file.size > 100 * 1024 * 1024) { // 100MB soft limit -> push to Pro
      setMessage("Fișierul depășește 100MB. Te rugăm treci pe planul Pro sau comprimă desenul.");
      setStatus("error");
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      setStatus("uploading");
      setProgressNote("Uploading…");
      const { bucket, objectKey, urn } = await uploadToProxy(file);

      // URN must be base64url for MD endpoints
      const urnStr = urn.startsWith("urn:") ? urn : urnFrom(bucket, objectKey);
      const urnB64Url = base64Url(urnStr);

      setStatus("converting");
      setProgressNote("Converting…");
      await startConvertMD({ bucket, objectKey });
      await pollStatusUntilSuccess(urnB64Url, { abortSignal: ac.signal });

      setStatus("downloading");
      setProgressNote("Preparing download…");
      const safeName = file.name.replace(/\.(dwg|dxf)$/i, "");
      await triggerDownloadPdf(urnB64Url, `${safeName}.pdf`);

      setStatus("done");
      setMessage("PDF descărcat cu succes ✅");
      setProgressNote("");
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setMessage(err?.message || "A apărut o eroare la conversie");
    } finally {
      abortRef.current = null;
    }
  }, [file]);

  const onCancel = useCallback(() => {
    abortRef.current?.abort();
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

          { (status === "uploading" || status === "converting") && (
            <button
              onClick={onCancel}
              className="px-3 py-2 rounded-2xl border"
            >Cancel</button>
          )}
        </div>

        {progressNote && (
          <div className="text-sm text-gray-700">{progressNote}</div>
        )}

        {message && (
          <div className={`text-sm ${status === "error" ? "text-red-600" : "text-green-700"}`}>{message}</div>
        )}

        <ul className="text-xs text-gray-500 list-disc pl-5 mt-2">
          <li>La erori, mesajul din API e afișat ca să vezi rapid cauza (ex. lipsă permisiuni, format invalid).</li>
          <li>Fișiere &gt;100MB: sugerează planul Pro sau optimizează desenul (PURGE, OVERKILL).</li>
          <li>După succes, descărcarea pornește automat.</li>
        </ul>
      </div>
    </div>
  );
}

// ---------------------- Optional: Minimal index page hook ----------------------
// In your main page (e.g., app/page.tsx or pages/index.tsx), mount the component:
//
// import dynamic from "next/dynamic";
// const ConvertDWGtoPDF = dynamic(() => import("@/components/ConvertDWGtoPDF"), { ssr: false });
//
// export default function Home() {
//   return (
//     <main className="min-h-screen p-6">
//       <div className="max-w-5xl mx-auto">
//         {/* Existing hero & steps here */}
//         <section id="convert" className="mt-10">
//           <ConvertDWGtoPDF />
//         </section>
//       </div>
//     </main>
//   );
// }

// ---------------------- Notes ----------------------
// 1) Ensure NEXT_PUBLIC_BASE_URL is set on Vercel to https://www.cadconverts.com (or your preview URL).
// 2) If your proxy requires auth/header, add it in uploadToProxy().
// 3) If your backend /api/convert expects a different JSON shape, adjust startConvertMD().
// 4) The URN we poll and download is base64url(urn:adsk.objects:os.object:<bucket>/<objectKey>). If your backend expects plain URN, remove base64Url().
// 5) For better UX, you can auto-scroll to the Download button or start the download automatically (already implemented).
