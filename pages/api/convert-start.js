// pages/api/convert-start.js
// Save initial status to S3 via PROXY /upload (bucket+objectKey+token) + RATE LIMIT (user or IP) + DIAGNOSTICS

import crypto from 'crypto'
import { getServerSession } from 'next-auth/next'
import { authOptions } from './auth/[...nextauth]'
import { getClientIp, checkAndConsume } from '../../lib/rateLimiter.js'

const PROXY_BASE_URL = process.env.PROXY_BASE_URL;             // e.g. https://proxy.cadconverts.com
const APS_BUCKET     = process.env.APS_BUCKET || process.env.BUCKET_NAME; // OSS/S3 bucket name

async function getApsToken() {
  const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SCOPES } = process.env;
  if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) throw new Error('APS credentials missing');
  const scopes = APS_SCOPES || 'data:read data:write bucket:read bucket:create';
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: scopes,
    client_id: APS_CLIENT_ID,
    client_secret: APS_CLIENT_SECRET,
  });
  const r = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`APS token failed: ${await r.text()}`);
  return r.json(); // { access_token }
}

async function saveInitialStatus({ jobId, method, filename, size }) {
  if (!PROXY_BASE_URL) throw new Error('Missing PROXY_BASE_URL');
  if (!APS_BUCKET)     throw new Error('Missing APS_BUCKET (bucket name)');

  const key = `jobs/${jobId}/status.json`;
  const statusObj = {
    jobId,
    status: 'queued',
    method,
    received: { filename, size },
    updatedAt: new Date().toISOString(),
  };
  const bodyStr = JSON.stringify(statusObj);
  const contentLength = Buffer.byteLength(bodyStr);

  const { access_token } = await getApsToken(); // APS token for proxy
  const url = `${PROXY_BASE_URL}/upload?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(key)}&token=${encodeURIComponent(access_token)}`;

  const up = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(contentLength),
    },
    body: bodyStr,
  });

  const txt = await up.text();
  if (!up.ok) throw new Error(`/upload failed: ${txt}`);

  return { saved: true, key, size: contentLength, proxy: PROXY_BASE_URL, bucket: APS_BUCKET };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    // --- Auth session (NextAuth) ---
    const session = await getServerSession(req, res, authOptions);
    const userEmail = session?.user?.email ? String(session.user.email).toLowerCase() : null;

    // --- Rate limit: logged-in users vs anonymous IPs ---
    const ip = getClientIp(req);
    const isLoggedIn = Boolean(userEmail);
    const key = isLoggedIn ? `user:${userEmail}` : `ip:${ip}`;
    const dailyLimit = isLoggedIn ? 10 : 2;               // you can tweak these numbers
    const ttlSeconds = 24 * 60 * 60;

    const rl = await checkAndConsume(key, dailyLimit, ttlSeconds);
    if (!rl.ok) {
      return res.status(429).json({
        ok: false,
        error: 'Rate limit exceeded',
        message: isLoggedIn
          ? 'You have reached today’s free conversion limit for your account.'
          : 'You have reached today’s free conversion limit for your IP. Sign in for higher limits.',
        scope: isLoggedIn ? 'user' : 'ip',
        identifier: isLoggedIn ? userEmail : ip,
        limit: dailyLimit,
        remaining: rl.remaining,
        resetAt: rl.resetAt
      });
    }

    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const preferHighQuality = !!body.preferHighQuality;
    const filename = body.filename ?? null;
    const size     = body.size ?? null;

    const jobId  = (crypto.randomUUID ? crypto.randomUUID() : crypto.createHash('sha256').update(String(Date.now())+Math.random()).digest('hex').slice(0,36));
    const method = preferHighQuality ? 'da' : 'md';

    let persist = { saved: false };
    try {
      persist = await saveInitialStatus({ jobId, method, filename, size });
    } catch (e) {
      persist = { saved: false, error: String(e?.message || e) };
    }

    return res.status(200).json({
      ok: true,
      version: 'start@2.3',
      jobId,
      status: 'queued',
      method,
      received: { filename, size },
      rateLimit: {
        scope: isLoggedIn ? 'user' : 'ip',
        identifier: isLoggedIn ? userEmail : ip,
        limit: dailyLimit,
        remaining: rl.remaining,
        resetAt: rl.resetAt
      },
      persist
    });
  } catch (err) {
    console.error('[api/convert-start] error:', err);
    return res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
}
