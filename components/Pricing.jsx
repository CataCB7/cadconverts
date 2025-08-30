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
    <section id="pricing" className="section">
      <div className="container">
        <h2 className="h1" style={{fontSize:28, textAlign:'center'}}>Pricing</h2>
        <p className="lead" style={{textAlign:'center'}}>Start free. Upgrade when you need more.</p>

        <div className="card" style={{marginTop:18}}>
          <table className="table">
            <thead>
              <tr>
                <th>Feature / Plan</th>
                <th>Free</th>
                <th>Basic – $9.99/mo</th>
                <th>Pro – $29.99/mo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><b>Conversions included</b></td>
                <td>2</td>
                <td>50 / month</td>
                <td>150 / month</td>
              </tr>
              {features.map((f) => (
                <tr key={f.label}>
                  <td>{f.label}</td>
                  <td>{f.free}</td>
                  <td>{f.basic}</td>
                  <td>{f.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{color:'var(--muted)', marginTop:8}}>
            Cloud-required conversions use Autodesk Platform Services (Forge). Costs are covered by your plan.
          </p>
        </div>

        <div className="row">
          <a href="#try" className="btn ghost">Try Free (2 conversions)</a>
          <a href="https://buy.stripe.com/cNieVc4cpdPp4tp86BeIw00" className="btn">Get Basic – $9.99/mo</a>
          <a href="https://buy.stripe.com/00wcN47oB26H0d9cmReIw01" className="btn">Get Pro – $29.99/mo</a>
        </div>
      </div>
    </section>
  );
}

