export default function Nav(){
  return (
    <div className="nav">
      <a href="/" className="brand">CadConverts</a>
      <div style={{display:'flex', gap:12}}>
        <a className="btn ghost" href="/#convert">Convert</a>
        <a className="btn ghost" href="/#pricing">Pricing</a>
        <a className="btn ghost" href="/contact">Contact</a>
        <a className="btn ghost" href="/privacy">Privacy</a>
        <a className="btn ghost" href="/terms">Terms</a>
      </div>
    </div>
  );
}
