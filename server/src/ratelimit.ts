// In-memory fixed-window rate limiter for the API.
//
// Throttles requests per client key (IP) to protect the costly OpenAI/Storage
// endpoints from abuse — including abuse using an extracted API key, which
// per-key auth alone cannot stop. The core (FixedWindowRateLimiter) is pure and
// dependency-free so it is easy to unit test; rateLimit() wraps it as Express
// middleware.
//
// NOTE: state is in-memory and per-process — fine for a single instance, but a
// shared store (e.g. Redis) is needed if the server scales to multiple replicas.

import type { Request, Response, NextFunction } from 'express';

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number; // epoch ms when the current window resets
};

type Bucket = { count: number; resetAt: number };

export class FixedWindowRateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(windowMs: number, max: number) {
    this.windowMs = windowMs;
    this.max = max;
  }

  // Records a hit for `key` at time `now` (ms) and returns the decision.
  hit(key: string, now: number = Date.now()): RateLimitResult {
    const existing = this.buckets.get(key);
    if (!existing || now >= existing.resetAt) {
      const resetAt = now + this.windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.max - 1, limit: this.max, resetAt };
    }
    existing.count += 1;
    return {
      allowed: existing.count <= this.max,
      remaining: Math.max(0, this.max - existing.count),
      limit: this.max,
      resetAt: existing.resetAt,
    };
  }

  // Drops expired buckets so memory stays bounded under client churn.
  prune(now: number = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}

export type RateLimitOptions = {
  windowMs: number;
  max: number;
};

// Builds Express middleware enforcing the limiter. When `max` <= 0 the
// middleware is a no-op (disabled). Emits standard RateLimit-* headers and
// responds 429 with Retry-After when the client exceeds the window budget.
export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max } = options;

  if (max <= 0) {
    return (_req: Request, _res: Response, next: NextFunction): void => next();
  }

  const limiter = new FixedWindowRateLimiter(windowMs, max);

  // Periodically prune expired buckets; don't keep the event loop alive for it.
  // setInterval's return type varies by lib (Node Timeout vs DOM number); treat
  // it structurally so .unref() is called only when the runtime provides it.
  const pruneTimer: unknown = setInterval(() => limiter.prune(), windowMs);
  if (
    pruneTimer !== null &&
    typeof pruneTimer === 'object' &&
    typeof (pruneTimer as { unref?: unknown }).unref === 'function'
  ) {
    (pruneTimer as { unref: () => void }).unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const result = limiter.hit(key, now);
    const retryAfterSec = Math.max(0, Math.ceil((result.resetAt - now) / 1000));

    res.setHeader('RateLimit-Limit', String(result.limit));
    res.setHeader('RateLimit-Remaining', String(result.remaining));
    res.setHeader('RateLimit-Reset', String(retryAfterSec));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: 'Too many requests, please slow down.' });
      return;
    }
    next();
  };
}
