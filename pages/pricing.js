export default () => (
  <div className='container'>
    <div className='nav'>
      <div className='brand'>CadConverts</div>
      <a className='btn ghost' href='/'>Home</a>
    </div>

    <div className='card'>
      <h1>Pricing</h1>

      <div style={{ display: 'grid', gap: '16px' }}>
        {/* Free */}
        <div className='card'>
          <h2>Free</h2>
          <p>2 conversions included</p>
          <p>Files up to 20MB</p>
          <button className='btn' onClick={() => window.location.href='/'}>
            Start Free
          </button>
        </div>

        {/* Basic */}
        <div className='card'>
          <h2>Basic — $9.99/mo</h2>
          <p>Unlimited simple parts (≤20MB/file)</p>
          <p>DWG, DXF, STEP, STL, IGES, OBJ</p>
          <button
            className='btn'
            onClick={() => window.location.href="https://buy.stripe.com/cNieVc4cpdPp4tp86BeIw00"}
          >
            Choose Basic
          </button>
        </div>

        {/* Pro */}
        <div className='card'>
          <h2>Pro — $29.99/mo</h2>
          <p>Assemblies up to 100MB</p>
          <p>Priority processing</p>
          <button
            className='btn'
            onClick={() => window.location.href="https://buy.stripe.com/00wcN47oB26H0d9cmReIw01"}
          >
            Choose Pro
          </button>
        </div>
      </div>
    </div>
  </div>
);
