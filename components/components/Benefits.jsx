export default function Benefits() {
  const items = [
    { title: "Forge-Powered", desc: "Conversions handled by Autodesk Platform Services APIs." },
    { title: "Engineering-Grade", desc: "Accurate outputs for real workflows." },
    { title: "Secure & Private", desc: "Cloud processing via trusted infrastructure. Stripe payments." },
  ];
  return (
    <section className="max-w-5xl mx-auto px-6 py-10 grid md:grid-cols-3 gap-6">
      {items.map((i) => (
        <div key={i.title} className="p-6 rounded-2xl border">
          <h3 className="font-semibold text-lg">{i.title}</h3>
          <p className="text-gray-600 mt-2">{i.desc}</p>
        </div>
      ))}
    </section>
  );
}
