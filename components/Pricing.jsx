const features = [
  { label: "STEP/IGES → STL/OBJ", free: "✅ (2 free)", basic: "✅", pro: "✅" },
  { label: "DWG/DXF → PDF (cloud)", free: "✅ (2 free)", basic: "✅", pro: "✅" },
  { label: "DWG/DXF → STEP/STL (cloud)", free: "—", basic: "✅", pro: "✅" },
  { label: "Inventor IPT/IAM → STEP/STL", free: "—", basic: "—", pro: "✅" },
  { label: "File size limit", free: "10 MB", basic: "50 MB", pro: "200 MB" },
  { label: "Priority processing", free: "—", basic: "—", pro: "✅" },
  { label: "Catia / SolidWorks", free: "Coming Soon", basic: "Coming Soon", pro: "Coming Soon" },
];

export default function Pricing() {
  return (
    <section id="pricing" className="max-w-5xl mx-auto px-6 py-14">
      <h2 className="text-3xl font-bold text-center">Pricing</h2>
      <p className="text-center text-gray-600 mt-2">Start free. Upgrade when you need more.</p>

      <div className="overflow-x-auto mt-8 rounded-2xl border">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-4">Feature / Plan</th>
              <th className="p-4">Free</th>
              <th className="p-4">Basic – $9.99/mo</th>
              <th className="p-4">Pro – $29.99/mo</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="p-4 font-medium">Conversions included</td>
              <td className="p-4">2</td>
              <td className="p-4">50 / month</td>
              <td className="p-4">150 / month</td>
            </tr>
            {features.map((f) => (
              <tr key={f.label} className="border-t">
                <td className="p-4">{f.label}</td>
                <td className="p-4">{f.free}</td>
                <td className="p-4">{f.basic}</td>
                <td className="p-4">{f.pro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid md:grid-cols-3 gap-4">
        <a href="#try" className="px-5 py-3 rounded-xl border text-center">Try Free (2 conversions)</a>
        <a href="https://buy.stripe.com/YOUR_BASIC_PAYMENT_LINK" className="px-5 py-3 rounded-xl bg-black text-white text-center">
          Get Basic – $9.99/mo
        </a>
        <a href="https://buy.stripe.com/YOUR_PRO_PAYMENT_LINK" className="px-5 py-3 rounded-xl bg-black text-white text-center">
          Get Pro – $29.99/mo
        </a>
      </div>

      <p className="text-xs text-gray-500 mt-4">
        Cloud-required conversions use Autodesk Platform Services (Forge). Costs are covered by your plan.
      </p>
    </section>
  );
}
