export default function FAQ() {
  const rows = [
    { q: "What makes CadConverts different?", a: "We use Autodesk Platform Services (Forge) for cloud-grade conversions—reliable, accurate, and scalable." },
    { q: "Is it secure?", a: "Processing happens via trusted cloud infrastructure. Payments via Stripe. We minimize file retention." },
    { q: "Can I cancel anytime?", a: "Yes. Flexible monthly subscriptions. No hidden fees." },
    { q: "Which formats are supported?", a: "STEP, IGES, STL, OBJ, DWG, DXF, PDF, and Inventor IPT/IAM (Pro). Catia/SolidWorks coming soon." },
  ];
  return (
    <section className="section">
      <div className="container faq">
        <h2 className="h1" style={{fontSize:24}}>FAQ</h2>
        <div className="grid" style={{gap:12, marginTop:12}}>
          {rows.map((r) => (
            <details key={r.q}>
              <summary>{r.q}</summary>
              <p>{r.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
