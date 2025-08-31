// pages/test-upload.js
import dynamic from "next/dynamic";
const UploadWidget = dynamic(() => import("../components/UploadWidget"), { ssr: false });

export default function TestUploadPage() {
  return (
    <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <UploadWidget />
    </main>
  );
}
