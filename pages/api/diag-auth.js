// pages/api/diag-auth.js
export default function handler(_req, res) {
  const has = (k) => Boolean(process.env[k] && String(process.env[k]).trim());
  res.status(200).json({
    ok: true,
    NEXTAUTH_URL: has('NEXTAUTH_URL'),
    NEXTAUTH_SECRET: has('NEXTAUTH_SECRET'),
    EMAIL_SERVER: has('EMAIL_SERVER'),
    EMAIL_FROM: has('EMAIL_FROM'),
    values: {
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || null,
      EMAIL_FROM: process.env.EMAIL_FROM || null
    }
  });
}
