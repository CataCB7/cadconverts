export default function Privacy(){
  return (
    <div className="container">
      <div className="card">
        <h1 className="h1">Privacy Policy</h1>
        <p className="lead" style={{marginTop:8}}>
          We process files only for the purpose of conversion and retain them no longer than necessary.
        </p>

        <div className="card" style={{marginTop:16}}>
          <h3 className="font-semibold" style={{margin:0}}>Files & Data</h3>
          <ul style={{lineHeight:1.6, marginTop:8}}>
            <li>Browser conversions (STEP/IGES → STL/OBJ) run locally; files don’t leave your device.</li>
            <li>Cloud conversions (DWG/DXF/IPT/IAM) use Autodesk Platform Services (Forge).</li>
            <li>Temporary processing only; we aim to auto-delete cloud files shortly after completion.</li>
          </ul>
        </div>

        <div className="card">
          <h3 className="font-semibold" style={{margin:0}}>Payments</h3>
          <p className="lead" style={{marginTop:6}}>
            Billing is handled by Stripe. We do not store card details.
          </p>
        </div>

        <div className="card">
          <h3 className="font-semibold" style={{margin:0}}>Analytics</h3>
          <p className="lead" style={{marginTop:6}}>
            We may use Google Analytics (GA4) to understand usage and improve the product.
          </p>
        </div>

        <div className="card">
          <h3 className="font-semibold" style={{margin:0}}>Contact</h3>
          <p className="lead" style={{marginTop:6}}>
            For privacy requests, contact us at <a href="/contact">/contact</a>.
          </p>
        </div>

        <p className="lead" style={{fontSize:12, color:'var(--muted)'}}>
          Last updated: {new Date().toISOString().slice(0,10)}
        </p>
      </div>
    </div>
  );
}
