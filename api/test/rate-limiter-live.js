// Live test endpoint for shared rate limiter
// Triggers multiple requests to verify global rate limiting is active

export default async function handler(req, res) {
  const { provider, count = '5', delay = '0' } = req.query;

  try {
    const limiter = await import('../../lib/providerRateLimiter.js');
    const config = limiter.getProviderConfig(provider);

    if (!config) {
      return res.status(400).json({
        error: `Unknown provider: ${provider}`,
        available: limiter.getConfiguredProviders(),
      });
    }

    const numRequests = parseInt(count) || 5;
    const delayMs = parseInt(delay) || 0;
    const results = [];
    let allowedCount = 0;
    let deniedCount = 0;
    let trackedCount = 0;

    for (let i = 0; i < numRequests; i++) {
      const startTime = Date.now();
      const result = await limiter.reserveProviderCredits(provider, 1, `test/${i}`);
      const duration = Date.now() - startTime;

      results.push({
        request: i + 1,
        allowed: result.allowed,
        tracked: result.tracked,
        used: result.used,
        limit: result.limit,
        duration_ms: duration,
        trackerError: result.trackerError || false,
      });

      if (result.allowed) allowedCount++;
      else deniedCount++;
      if (result.tracked) trackedCount++;

      if (delayMs > 0 && i < numRequests - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return res.status(200).json({
      provider,
      config: {
        windowMs: config.windowMs,
        limit: config.limit,
        name: config.name,
      },
      summary: {
        total: numRequests,
        allowed: allowedCount,
        denied: deniedCount,
        tracked: trackedCount,
      },
      results,
      rateLimiterActive: trackedCount > 0,
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 5),
    });
  }
}
