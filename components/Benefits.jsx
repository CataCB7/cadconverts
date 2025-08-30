export default function Benefits() {
  const items = [
    { title: "Forge-Powered", desc: "Conversions handled by Autodesk Platform Services APIs." },
    { title: "Engineering-Grade", desc: "Accurate outputs for real workflows." },
    { title: "Secure & Private", desc: "Cloud processing via trusted infrastructure. Stripe payments." },
  ];
  return (
    <section className="section">
      <div className="container">
        <div className="grid-3">
          {items.map((i) => (
            <div key={i.title} className="card">
              <h3 className="font-semibold text-lg">{i.title}</h3>
              <p className="lead" style={{marginTop:8}}>{i.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
