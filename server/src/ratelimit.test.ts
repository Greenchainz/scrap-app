import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';

import { FixedWindowRateLimiter, rateLimit } from './ratelimit';

// --- FixedWindowRateLimiter ----------------------------------------------

test('allows requests up to the max within a window', () => {
  const limiter = new FixedWindowRateLimiter(1000, 3);
  assert.equal(limiter.hit('a', 0).allowed, true);
  assert.equal(limiter.hit('a', 100).allowed, true);
  assert.equal(limiter.hit('a', 200).allowed, true);
});

test('blocks requests beyond the max within a window', () => {
  const limiter = new FixedWindowRateLimiter(1000, 2);
  limiter.hit('a', 0);
  limiter.hit('a', 10);
  const third = limiter.hit('a', 20);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
});

test('reports remaining budget and a stable reset time within a window', () => {
  const limiter = new FixedWindowRateLimiter(1000, 3);
  const first = limiter.hit('a', 500);
  assert.equal(first.limit, 3);
  assert.equal(first.remaining, 2);
  assert.equal(first.resetAt, 1500); // now + windowMs
  const second = limiter.hit('a', 600);
  assert.equal(second.remaining, 1);
  assert.equal(second.resetAt, 1500); // unchanged within the window
});

test('starts a fresh window once the previous one elapses', () => {
  const limiter = new FixedWindowRateLimiter(1000, 1);
  assert.equal(limiter.hit('a', 0).allowed, true);
  assert.equal(limiter.hit('a', 500).allowed, false); // still in first window
  const afterReset = limiter.hit('a', 1000); // boundary -> new window
  assert.equal(afterReset.allowed, true);
  assert.equal(afterReset.resetAt, 2000);
});

test('tracks each key independently', () => {
  const limiter = new FixedWindowRateLimiter(1000, 1);
  assert.equal(limiter.hit('a', 0).allowed, true);
  assert.equal(limiter.hit('b', 0).allowed, true); // different key, own budget
  assert.equal(limiter.hit('a', 0).allowed, false);
});

test('prune drops only expired buckets', () => {
  const limiter = new FixedWindowRateLimiter(1000, 5);
  limiter.hit('a', 0); // resetAt 1000
  limiter.hit('b', 600); // resetAt 1600
  assert.equal(limiter.size, 2);
  limiter.prune(1200); // 'a' expired, 'b' still active
  assert.equal(limiter.size, 1);
  assert.equal(limiter.hit('b', 1200).remaining, 3); // 'b' window preserved
});

// --- rateLimit middleware -------------------------------------------------

type FakeRes = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  setHeader(key: string, value: string): void;
  status(code: number): FakeRes;
  json(payload: unknown): FakeRes;
};

function makeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(key, value) {
      res.headers[key] = value;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

function makeReq(ip: string): Request {
  return { ip, socket: { remoteAddress: ip } } as unknown as Request;
}

test('rateLimit middleware passes allowed requests through with headers', () => {
  const mw = rateLimit({ windowMs: 1000, max: 2 });
  const res = makeRes();
  let called = 0;
  const next: NextFunction = () => {
    called += 1;
  };
  mw(makeReq('1.1.1.1'), res as unknown as Response, next);
  assert.equal(called, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['RateLimit-Limit'], '2');
  assert.equal(res.headers['RateLimit-Remaining'], '1');
});

test('rateLimit middleware returns 429 once the budget is exceeded', () => {
  const mw = rateLimit({ windowMs: 60000, max: 1 });
  const ip = '2.2.2.2';
  mw(makeReq(ip), makeRes() as unknown as Response, () => {}); // first: allowed
  const res = makeRes();
  let called = 0;
  mw(makeReq(ip), res as unknown as Response, () => {
    called += 1;
  });
  assert.equal(called, 0);
  assert.equal(res.statusCode, 429);
  assert.notEqual(res.headers['Retry-After'], undefined);
});

test('rateLimit middleware is a no-op when max <= 0', () => {
  const mw = rateLimit({ windowMs: 1000, max: 0 });
  const res = makeRes();
  let called = 0;
  mw(makeReq('3.3.3.3'), res as unknown as Response, () => {
    called += 1;
  });
  assert.equal(called, 1);
  assert.equal(res.headers['RateLimit-Limit'], undefined); // disabled: no headers
});
