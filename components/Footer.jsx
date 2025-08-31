export default function Footer(){
  return (
    <div className="footer">
      © {new Date().getFullYear()} CadConverts — 
      &nbsp;<a href="/contact">Contact</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
    </div>
  );
}
