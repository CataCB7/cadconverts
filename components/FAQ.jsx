export default function FAQ() {
  const rows = [
    { q: "What makes CadConverts different?", a: "We use Autodesk Platform Services (Forge) for cloud-grade conversions—reliable, accurate, and scalable." },
    { q: "Is it secure?", a: "Processing happens via trusted cloud infrastructure. Payments via Stripe. We minimize file retention." },
    { q: "Can I cancel anytime?", a: "Yes. Flexible monthly subscriptions. No hidden fees." },
    { q: "Which formats are supported?", a: "STEP, IGES, STL, OBJ, DWG, DXF, PDF, and Inventor IPT/IAM (Pro). Catia/SolidWorks coming soon." },
  ];
  return (
    <section className="max-w-4xl mx-auto px-6 py-12">
      <h2 className="text-2xl font-bold">FAQ</h2>
      <div className="mt-6 space-y-6">
        {rows.map((r) => (
          <details key={r.q} className="rounded-xl border p-4">
            <summary className="cursor-pointer font-medium">{r.q}</summary>
            <p className="text-gray-600 mt-2">{r.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
