import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter (in production, use Redis)
interface RateLimitBucket {
  count: number;
  resetTime: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();

/**
 * Rate limit configuration per endpoint type
 */
const rateLimitConfig = {
  auth: { windowMs: 15 * 60 * 1000, maxRequests: 5 }, // 5 per 15 mins
  api: { windowMs: 60 * 1000, maxRequests: 100 }, // 100 per minute
  upload: { windowMs: 60 * 1000, maxRequests: 10 }, // 10 per minute
  payment: { windowMs: 60 * 1000, maxRequests: 20 }, // 20 per minute
  agent: { windowMs: 10 * 1000, maxRequests: 60 }, // 60 per 10 seconds (agent polling)
};

/**
 * Check if request is rate limited
 */
export function checkRateLimit(
  identifier: string,
  limiterType: keyof typeof rateLimitConfig = 'api'
): { allowed: boolean; retryAfter?: number } {
  const config = rateLimitConfig[limiterType];
  const now = Date.now();
  const bucket = rateLimitBuckets.get(identifier);

  // Create new bucket if doesn't exist
  if (!bucket) {
    rateLimitBuckets.set(identifier, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return { allowed: true };
  }

  // Reset if window has passed
  if (now > bucket.resetTime) {
    bucket.count = 1;
    bucket.resetTime = now + config.windowMs;
    return { allowed: true };
  }

  // Check if limit exceeded
  if (bucket.count >= config.maxRequests) {
    const retryAfter = Math.ceil((bucket.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Increment and allow
  bucket.count++;
  return { allowed: true };
}

/**
 * Get client IP for rate limiting
 */
export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) {
    return xRealIp.trim();
  }
  
  // Fallback - use a generic identifier
  return 'unknown';
}

/**
 * Middleware for security headers
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()'
  );
  
  return response;
}

/**
 * Clean up old rate limit buckets (run periodically)
 */
export function cleanupRateLimitBuckets() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (now > bucket.resetTime + 60000) { // Keep for 1 minute after reset
      rateLimitBuckets.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.debug(`[RateLimit] Cleaned up ${cleaned} expired buckets`);
  }
}

// Clean up every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimitBuckets, 5 * 60 * 1000);
}
