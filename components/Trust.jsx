export default function Trust() {
  return (
    <section className="section">
      <div className="container">
        <div className="grid-3">
          <div className="card">
            <h3 className="font-semibold">Powered by Autodesk Platform Services (Forge)</h3>
            <p className="lead" style={{marginTop:8}}>The same cloud technology trusted across engineering and AEC.</p>
          </div>
          <div className="card">
            <h3 className="font-semibold">Secure Stripe Payments</h3>
            <p className="lead" style={{marginTop:8}}>We never store payment details. Billing handled by Stripe.</p>
          </div>
          <div className="card">
            <h3 className="font-semibold">Privacy by Design</h3>
            <p className="lead" style={{marginTop:8}}>Files are processed for conversion and not kept longer than needed.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
