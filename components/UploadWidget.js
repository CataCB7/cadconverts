// components/UploadWidget.js
import { useState } from "react";
import { getApsToken, uploadViaProxy } from "../utils/uploadViaProxy";

export default function UploadWidget() {
  const [msg, setMsg] = useState("");

  async function onChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("Generez token...");
    try {
      const { access_token } = await getApsToken();
      setMsg("Urc prin proxy...");
      const res = await uploadViaProxy(file, {
        bucket: "cadconverts-prod-us-123abc",
        objectKey: file.name.replace(/\s+/g, "-"),
        access_token,
      });
      setMsg(`✅ Upload reușit: ${res.objectKey}`);
    } catch (err) {
      setMsg(`❌ Eroare: ${err.message}`);
    }
  }

  return (
    <div style={{ maxWidth: 420, padding: 16, border: "1px solid #eee", borderRadius: 12 }}>
      <input type="file" onChange={onChange} accept=".dwg,.dxf,.step,.stp,.iges,.igs,.stl,.obj,.pdf"/>
      <p style={{ marginTop: 8, fontSize: 14 }}>{msg}</p>
    </div>
  );
}
