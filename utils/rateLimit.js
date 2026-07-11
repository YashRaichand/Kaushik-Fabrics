// Simple in-memory rate limiter (per Node process). This is sufficient for a
// single Render instance MVP. Before scaling to multiple instances, swap
// this for a Redis-backed limiter (e.g. rate-limiter-flexible) so counts are
// shared across processes.

const attempts = new Map();

function rateLimit({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  return (req, res, next) => {
    const key = req.ip + ':' + req.path;
    const now = Date.now();
    const entry = attempts.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }

    entry.count += 1;
    attempts.set(key, entry);

    if (entry.count > max) {
      const secondsLeft = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).render('too-many-requests', { secondsLeft });
    }

    next();
  };
}

module.exports = { rateLimit };
