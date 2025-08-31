export default function Contact(){
  const email = "hello@cadconverts.com"; // schimbă dacă vrei alt mail
  return (
    <div className="container">
      <div className="card">
        <h1 className="h1">Contact</h1>
        <p className="lead" style={{marginTop:8}}>
          Suntem aici să te ajutăm cu întrebări despre conversii, planuri și facturare.
        </p>

        <div className="card" style={{marginTop:16}}>
          <h3 className="font-semibold" style={{margin:0}}>Email</h3>
          <p className="lead" style={{marginTop:6}}>
            <a href={`mailto:${email}`}>{email}</a>
          </p>
        </div>

        <div className="card">
          <h3 className="font-semibold" style={{margin:0}}>Program</h3>
          <p className="lead" style={{marginTop:6}}>Luni–Vineri, 09:00–18:00 (EET)</p>
        </div>

        <p className="lead" style={{fontSize:12, color:'var(--muted)'}}>
          Răspundem de obicei în aceeași zi lucrătoare.
        </p>
      </div>
    </div>
  );
}
