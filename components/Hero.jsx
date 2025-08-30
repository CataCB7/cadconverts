export default function Hero() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-16 text-center">
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
        Professional CAD file conversions, powered by Autodesk Platform Services (Forge).
      </h1>
      <p className="mt-4 text-lg text-gray-600">
        Convert DWG, DXF, STEP, IGES, and Inventor files with enterprise-grade accuracy and security.
        No installs. Works in your browser.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <a href="#pricing" className="px-5 py-3 rounded-xl bg-black text-white">
          Start with 2 Free Conversions
        </a>
        <a href="#pricing" className="px-5 py-3 rounded-xl border">
          Upgrade to Pro
        </a>
      </div>
      <div className="mt-6 inline-flex items-center gap-2 text-sm text-gray-500">
        <span className="inline-block h-6 w-6 rounded bg-gray-100 grid place-items-center">✔</span>
        <span>Powered by Autodesk Platform Services (Forge)</span>
      </div>
    </section>
  );
}
