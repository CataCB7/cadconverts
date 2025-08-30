export default function Trust() {
  return (
    <section className="max-w-5xl mx-auto px-6 py-12">
      <div className="rounded-2xl border p-6 md:p-8 grid md:grid-cols-3 gap-6">
        <div>
          <h3 className="font-semibold">Powered by Autodesk Platform Services (Forge)</h3>
          <p className="text-gray-600 mt-2">
            The same cloud technology trusted across engineering and AEC.
          </p>
        </div>
        <div>
          <h3 className="font-semibold">Secure Stripe Payments</h3>
          <p className="text-gray-600 mt-2">
            We never store payment details. Billing handled by Stripe.
          </p>
        </div>
        <div>
          <h3 className="font-semibold">Privacy by Design</h3>
          <p className="text-gray-600 mt-2">
            Files are processed for conversion and not kept longer than needed.
          </p>
        </div>
      </div>
    </section>
  );
}
