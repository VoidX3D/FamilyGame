export function createRateLimiter({ limit, windowMs }) {
  const buckets = new Map();

  function hit(key) {
    const time = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || time - bucket.startedAt >= windowMs) {
      bucket = { startedAt: time, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    if (buckets.size > 5000) {
      for (const [bucketKey, value] of buckets) {
        if (time - value.startedAt >= windowMs) buckets.delete(bucketKey);
      }
    }

    return {
      ok: bucket.count <= limit,
      retryAfterMs: Math.max(0, bucket.startedAt + windowMs - time),
    };
  }

  hit.reset = (key) => buckets.delete(key);
  return hit;
}
