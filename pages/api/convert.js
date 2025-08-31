// HOTFIX: răspunde instant cu un fișier stub, fără să mai parseze upload-ul.
// Scop: să verificăm cap-coadă fluxul din UI. După test, legăm APS (Forge).

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  // Nu parsam corpul; doar livrăm un fișier mic dummy.
  // (Dacă vrei altă extensie la test, schimbă "pdf" mai jos.)
  const desired = 'pdf';

  const text = [
    'CadConverts cloud stub ✓',
    `requested_output=${desired}`,
    '(HOTFIX: upload ignored; real APS coming next)',
    ''
  ].join('\n');

  const buf = Buffer.from(text, 'utf8');
  const filename = `stub.${desired}`;

  res.setHeader('X-Info', 'Stub response — hotfix without parsing');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(buf);
}
