// pages/test-viewer.js
import Head from "next/head";
import { useEffect, useRef } from "react";

// ⇩ pune aici URN-ul tău (cel din /test-convert)
const URN = "dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6Y2FkY29udmVydHMtcHJvZC11cy0xMjNhYmMvcmlnbGVfMzExci5kd2c";

export default function TestViewer() {
  const viewerDiv = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    let viewer;

    async function start() {
      // 1) token APS
      const tok = await fetch("/api/aps-token").then((r) => r.json());

      // 2) inițializează Viewer
      const options = {
        env: "AutodeskProduction",
        api: "derivativeV2",
        getAccessToken: (onTokenReady) => {
          // token + expirare (1h tipic)
          onTokenReady(tok.access_token, 3500);
        },
      };

      window.Autodesk.Viewing.Initializer(options, () => {
        viewer = new window.Autodesk.Viewing.GuiViewer3D(viewerDiv.current);
        viewer.start();
        viewerRef.current = viewer;

        const docUrn = "urn:" + URN;
        window.Autodesk.Viewing.Document.load(
          docUrn,
          (doc) => {
            // încearcă să ia primul view 2D
            const nodes = doc.getRoot().search({ type: "geometry", role: "2d" });
            const node = nodes[0] || doc.getRoot().getDefaultGeometry();
            viewer.loadDocumentNode(doc, node);
          },
          (err) => {
            console.error("Document load failed", err);
            alert("Nu pot încărca modelul: " + (err?.message || err));
          }
        );
      });
    }

    start();
    return () => {
      if (viewerRef.current) {
        viewerRef.current.finish();
        viewerRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <Head>
        {/* Forge Viewer v7 (stabil) */}
        <link
          rel="stylesheet"
          href="https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css"
        />
        <script src="https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js" />
        <title>CADConverts Viewer (test)</title>
      </Head>
      <main style={{ height: "100vh", width: "100vw", margin: 0, padding: 0 }}>
        <div ref={viewerDiv} style={{ height: "100%", width: "100%" }} />
      </main>
    </>
  );
}
