// pages/api/convert-start.js (DEBUG MODE)
import crypto from 'crypto'
import { getClientIp, checkAndConsume } from '../../lib/rateLimiter.js'

const PROXY_BASE_URL = process.env.PROXY_BASE_URL;
const APS_BUCKET     = process.env.APS_BUCKET || process.env.BUCKET_NAME;

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
  return r.json();
}

async function saveInitialStatus({ jobId, method, filename, size }) {
  if (!PROXY_BASE_URL) throw new Error('Missing PROXY_BASE_URL');
  if (!APS_BUCKET)     throw new Error('Missing APS_BUCKET');

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

  const { access_token } = await getApsToken();
  const url = `${PROXY_BASE_URL}/upload?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(key)}&token=${encodeURIComponent(access_token)}`;

  const up = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json','Content-Length': String(contentLength) },
    body: bodyStr,
  });

  const txt = await up.text();
  if (!up.ok) throw new Error(`/upload failed: ${txt}`);

  return { saved: true, key, size: contentLength, proxy: PROXY_BASE_URL, bucket: APS_BUCKET };
}

export default async function handler(req, res) {
  const DEBUG = String(req.query?.debug ?? '').trim() === '1';

  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        version: 'start@debug',
        allow: ['POST'],
        env: { hasProxy: !!PROXY_BASE_URL, hasBucket: !!APS_BUCKET }
      });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', ['GET','POST']);
      return res.status(405).json({ ok:false, error:'Method Not Allowed' });
    }

    // 1) Import next-auth LAZY
    let session = null;
    try {
      const { getServerSession } = await import('next-auth/next');
      const { authOptions }     = await import('./auth/[...nextauth]');
      session = await getServerSession(req, res, authOptions);
    } catch (e) {
      if (DEBUG) return res.status(500).json({ ok:false, step:'import-auth', message:String(e?.message||e) });
      throw e;
    }

    // 2) Rate limit (Upstash)
    const userEmail = session?.user?.email ? String(session.user.email).toLowerCase() : null;
    const ip = getClientIp(req);
    const isLoggedIn = !!userEmail;
    const rlKey = isLoggedIn ? `user:${userEmail}` : `ip:${ip}`;
    const dailyLimit = isLoggedIn ? 10 : 2;
    const ttlSeconds = 24*60*60;

    let rl;
    try {
      rl = await checkAndConsume(rlKey, dailyLimit, ttlSeconds);
    } catch (e) {
      if (DEBUG) return res.status(500).json({ ok:false, step:'rate-limit', message:String(e?.message||e) });
      throw e;
    }
    if (!rl?.ok) {
      return res.status(429).json({
        ok:false,
        error:'Rate limit exceeded',
        scope: isLoggedIn ? 'user' : 'ip',
        identifier: isLoggedIn ? userEmail : ip,
        limit: dailyLimit,
        remaining: rl?.remaining ?? 0,
        resetAt: rl?.resetAt ?? null
      });
    }

    // 3) Parse body
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const preferHighQuality = !!body.preferHighQuality;
    const filename = body.filename ?? null;
    const size     = body.size ?? null;

    const jobId  = (crypto.randomUUID ? crypto.randomUUID() :
      crypto.createHash('sha256').update(String(Date.now())+Math.random()).digest('hex').slice(0,36));
    const method = preferHighQuality ? 'da' : 'md';

    // 4) Persist status
    let persist = { saved:false };
    try {
      persist = await saveInitialStatus({ jobId, method, filename, size });
    } catch (e) {
      if (DEBUG) return res.status(500).json({ ok:false, step:'persist-status', message:String(e?.message||e) });
      // în producție nu vrem să ardem detalii; dar tot întoarcem 200 ca să nu blocăm pasul următor
      persist = { saved:false, error: 'persist failed' };
    }

    // 5) Done
    return res.status(200).json({
      ok:true,
      version: 'start@debug',
      jobId,
      status:'queued',
      method,
      received:{ filename, size },
      rateLimit:{ scope:isLoggedIn?'user':'ip', identifier:isLoggedIn?userEmail:ip, limit:dailyLimit, remaining:rl.remaining, resetAt:rl.resetAt },
      persist
    });

  } catch (err) {
    console.error('[convert-start][FATAL]', err);
    return res.status(500).json({ ok:false, error:'Internal Server Error' });
  }
}
