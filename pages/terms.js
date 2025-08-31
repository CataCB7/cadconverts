export default function Terms(){
  return (
    <div className="container">
      <div className="card">
        <h1 className="h1">Terms & Conditions</h1>
        <p className="lead" style={{marginTop:8}}>By using CadConverts you agree to the following.</p>

        <div className="card" style={{marginTop:16}}>
          <h3 className="font-semibold" style={{margin:0}}>Acceptable Use</h3>
          <ul style={{lineHeight:1.6, marginTop:8}}>
            <li>You must own or have rights to all files you upload.</li>
            <li>No illegal or infringing content.</li>
            <li>Do not attempt to overload or abuse the service.</li>
          </ul>
        </div>

        <div className="card">
          <h3 className="font-semibold" style={{margin:0}}>Service & Availability</h3>
          <ul style={{lineHeight:1.6, marginTop:8}}>
            <li>Service is provided “as is”. We aim for high availability but no guaranteed uptime.</li>
            <li>Conversion accuracy depends on source files and vendor capabilities.</li>
          </ul>
        </div>

        <div className="card">
          <h3 className="font-semibold" style={{margin:0}}>Plans & Billing</h3>
          <ul style={{lineHeight:1.6, marginTop:8}}>
            <li>Subscriptions renew monthly until cancelled.</li>
            <li>No refunds for partial periods unless required by law.</li>
          </ul>
        </div>

        <div className="card">
          <h3 className="font-semibold" style={{margin:0}}>Liability</h3>
          <p className="lead" style={{marginTop:6}}>
            To the maximum extent permitted by law, we are not liable for lost data or indirect damages.
          </p>
        </div>

        <p className="lead" style={{fontSize:12, color:'var(--muted)'}}>
          Last updated: {new Date().toISOString().slice(0,10)}
        </p>
      </div>
    </div>
  );
}
