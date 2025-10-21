// pages/api/debug-rl.js
import { Redis } from '@upstash/redis';

export default async function handler(req, res) {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL || '';
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || '';
    const hasEnv = Boolean(url && token);

    let ping = null, incr = null, ttl = null, err = null;
    if (hasEnv) {
      try {
        const redis = new Redis({ url, token });
        ping = await redis.ping();
        incr = await redis.incr('debug:rl');
        // asigurăm TTL pe cheia de test (60s)
        await redis.expire('debug:rl', 60);
        ttl = await redis.ttl('debug:rl');
      } catch (e) {
        err = String(e?.message || e);
      }
    }

    res.status(200).json({
      ok: true,
      version: 'debug-rl@1',
      hasEnv,
      ping,
      incr,
      ttl,
      error: err
    });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
}
