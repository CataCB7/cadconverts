// lib/rateLimiter.js
// Rate-limit pe IP / userId cu Upstash Redis (REST).

import { Redis } from '@upstash/redis';

const redis = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
})();

export function getClientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').toString();
  if (xff) return xff.split(',')[0].trim();
  const ip = (req.socket?.remoteAddress || '').replace('::ffff:', '');
  return ip || '0.0.0.0';
}

/**
 * checkAndConsume(key, limit, windowSeconds)
 * ex: key="ip:1.2.3.4", limit=2, windowSeconds=86400 (24h)
 * return { ok, remaining, used, resetAt }
 */
export async function checkAndConsume(key, limit = 2, windowSeconds = 86400) {
  if (!redis) {
    // fallback dev: nu blocăm dacă lipsește configurația
    return { ok: true, remaining: limit - 1, used: 1, resetAt: Date.now() + windowSeconds * 1000, devBypass: true };
  }

  const used = await redis.incr(key);
  let ttl = await redis.ttl(key);
  if (ttl === -1) {
    await redis.expire(key, windowSeconds);
    ttl = windowSeconds;
  }

  if (Number(used) > limit) {
    return { ok: false, remaining: 0, used: Number(used) - 1, resetAt: Date.now() + ttl * 1000 };
  }

  return { ok: true, remaining: Math.max(0, limit - Number(used)), used: Number(used), resetAt: Date.now() + ttl * 1000 };
}
