// Test endpoint to verify shared rate limiter is working
export default async function handler(req, res) {
  const { provider, action } = req.query;

  try {
    // Dynamically import to avoid issues if module has problems
    const limiter = await import('../../lib/providerRateLimiter.js');

    if (action === 'config') {
      // Return all provider configurations
      const providers = limiter.getConfiguredProviders();
      const configs = {};
      for (const p of providers) {
        const config = limiter.getProviderConfig(p);
        configs[p] = {
          ...config,
          limitPerSec: (config.limit / (config.windowMs / 1000)).toFixed(2),
        };
      }
      return res.status(200).json({ providers: configs });
    }

    if (action === 'usage' && provider) {
      // Get current usage for a provider
      const usage = await limiter.getProviderUsage(provider);
      return res.status(200).json({ provider, usage });
    }

    if (action === 'reserve' && provider) {
      // Test a reservation
      const startTime = Date.now();
      const result = await limiter.reserveProviderCredits(provider, 1, 'test');
      const duration = Date.now() - startTime;

      return res.status(200).json({
        provider,
        result,
        duration_ms: duration,
      });
    }

    if (action === 'cleanup') {
      const deleted = await limiter.cleanupProviderBuckets(null, 5);
      return res.status(200).json({ deleted });
    }

    return res.status(200).json({
      message: 'Rate limiter test endpoint',
      availableActions: ['config', 'usage', 'reserve', 'cleanup'],
      example: '?action=config or ?action=reserve&provider=kraken',
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 5),
    });
  }
}
