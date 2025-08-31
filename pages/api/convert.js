// HOTFIX: acceptă GET + POST și returnează imediat un fișier stub.
// Scop: să verificăm că ruta funcționează cap-coadă în producție.

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).send('Method not allowed');
  }

  // luăm formatul din query (ex: /api/convert?format=pdf)
  const desired = String((req.query.format || 'pdf')).toLowerCase();

  const text = [
    'CadConverts cloud stub ✓',
    `requested_output=${desired}`,
    '(HOTFIX: no upload parsing; APS coming next)',
    ''
  ].join('\n');

  const buf = Buffer.from(text, 'utf8');
  const filename = `stub.${desired}`;

  res.setHeader('X-Info', 'Stub response (GET/POST)');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(buf);
}
