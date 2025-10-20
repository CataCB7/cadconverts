// lib/limiter-oss.js
// Rate-limit pe IP stocat în APS OSS/S3 (prin proxy). Fără Buffer, safe la build.

const PROXY_BASE_URL = process.env.PROXY_BASE_URL;            // ex: https://proxy.cadconverts.com
const APS_BUCKET     = process.env.APS_BUCKET || process.env.BUCKET_NAME;
const REGION_HEADER  = { 'x-ads-region': 'US' };

// IP real din request (Vercel/Proxy friendly)
export function getClientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').toString();
  if (xff) return xff.split(',')[0].trim();
  const ip = (req.socket?.remoteAddress || '').replace('::ffff:', '');
  return ip || '0.0.0.0';
}

async function getApsToken() {
  const { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SCOPES } = process.env;
  if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) throw new Error('APS credentials missing');
  const scopes = APS_SCOPES || 'data:read data:write bucket:read bucket:create';
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: scopes,
    client_id: APS_CLIENT_ID,
    client_secret: APS_CLIENT_SECRET
  });
  const r = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!r.ok) throw new Error(`APS token failed: ${await r.text()}`);
  return r.json(); // { access_token }
}

function todayYMD() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}
function ipKey(ip) {
  const d = todayYMD();
  return `limits/ip/${d}/${ip}.json`;
}
function byteLen(str) {
  // fără Buffer: compatibil edge
  return new TextEncoder().encode(str).length;
}

// Citește JSON din OSS folosind /download-sign
async function readJson(objectKey) {
  const { access_token } = await getApsToken();
  const signUrl = `${PROXY_BASE_URL}/download-sign?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(objectKey)}&token=${encodeURIComponent(access_token)}`;
  const s = await fetch(signUrl, { headers: REGION_HEADER });
  if (s.status === 404) return null;
  const st = await s.text();
  if (!s.ok) throw new Error(`download-sign failed: ${st}`);
  const sj = st ? JSON.parse(st) : {};
  const url = sj.url || (Array.isArray(sj.urls) && sj.urls[0]) || sj.downloadUrl;
  if (!url) return null;
  const g = await fetch(url);
  if (!g.ok) return null;
  const txt = await g.text();
  try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

// Scrie JSON în OSS folosind /upload (cu Content-Length corect, fără Buffer)
async function writeJson(objectKey, data) {
  const bodyStr = JSON.stringify(data);
  const len = byteLen(bodyStr);
  const { access_token } = await getApsToken();
  const upUrl = `${PROXY_BASE_URL}/upload?bucket=${encodeURIComponent(APS_BUCKET)}&objectKey=${encodeURIComponent(objectKey)}&token=${encodeURIComponent(access_token)}`;
  const up = await fetch(upUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(len) },
    body: bodyStr
  });
  const t = await up.text();
  if (!up.ok) throw new Error(`/upload failed: ${t}`);
  return true;
}

/**
 * checkAndConsumeIp
 * - crește contorul pentru ip în fereastra curentă (ziua curentă UTC).
 * - limit: câte conversii per IP / zi.
 * returnează { ok, remaining, used, resetAt, key }
 */
export async function checkAndConsumeIp(req, limit = 2) {
  if (!PROXY_BASE_URL || !APS_BUCKET) {
    return { ok: true, remaining: limit - 1, used: 1, resetAt: Date.now() + 24*3600*1000, devBypass: true };
  }

  const ip = getClientIp(req);
  const key = ipKey(ip);

  const cur = await readJson(key).catch(() => null);
  const endOfDayUtc = new Date(new Date().toISOString().slice(0,10) + 'T23:59:59.999Z').getTime();

  if (!cur) {
    const doc = { ip, count: 1, firstAt: new Date().toISOString(), resetAt: new Date(endOfDayUtc).toISOString() };
    await writeJson(key, doc);
    return { ok: true, remaining: Math.max(0, limit - 1), used: 1, resetAt: endOfDayUtc, key };
  }

  const used = Number(cur.count || 0) + 1;
  if (used > limit) {
    return { ok: false, remaining: 0, used: used - 1, resetAt: new Date(cur.resetAt || endOfDayUtc).getTime(), key };
  }

  const doc = { ...cur, count: used, lastAt: new Date().toISOString(), resetAt: cur.resetAt || new Date(endOfDayUtc).toISOString() };
  await writeJson(key, doc);
  return { ok: true, remaining: Math.max(0, limit - used), used, resetAt: new Date(doc.resetAt).getTime(), key };
}
