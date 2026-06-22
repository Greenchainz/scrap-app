import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingHttpHeaders } from 'node:http';

import { extractApiKey, isAuthorized } from './trpc';

// --- extractApiKey --------------------------------------------------------

test('extractApiKey reads a Bearer token from the Authorization header', () => {
  const headers: IncomingHttpHeaders = { authorization: 'Bearer secret-123' };
  assert.equal(extractApiKey(headers), 'secret-123');
});

test('extractApiKey trims surrounding whitespace from the token', () => {
  const headers: IncomingHttpHeaders = { authorization: 'Bearer   spaced-key  ' };
  assert.equal(extractApiKey(headers), 'spaced-key');
});

test('extractApiKey falls back to the x-api-key header', () => {
  const headers: IncomingHttpHeaders = { 'x-api-key': 'key-from-header' };
  assert.equal(extractApiKey(headers), 'key-from-header');
});

test('extractApiKey reads the first value of an x-api-key array', () => {
  const headers: IncomingHttpHeaders = { 'x-api-key': ['first-key', 'second-key'] };
  assert.equal(extractApiKey(headers), 'first-key');
});

test('extractApiKey returns undefined when no key header is present', () => {
  assert.equal(extractApiKey({}), undefined);
});

test('extractApiKey returns undefined for an empty Bearer token', () => {
  const headers: IncomingHttpHeaders = { authorization: 'Bearer ' };
  assert.equal(extractApiKey(headers), undefined);
});

test('extractApiKey ignores non-Bearer Authorization schemes', () => {
  const headers: IncomingHttpHeaders = { authorization: 'Basic dXNlcjpwYXNz' };
  assert.equal(extractApiKey(headers), undefined);
});

// --- isAuthorized ---------------------------------------------------------

test('isAuthorized allows any request when no key is configured (auth disabled)', () => {
  assert.equal(isAuthorized(undefined, undefined), true);
  assert.equal(isAuthorized('', 'anything'), true);
});

test('isAuthorized allows a matching key', () => {
  assert.equal(isAuthorized('secret', 'secret'), true);
});

test('isAuthorized rejects a mismatched key', () => {
  assert.equal(isAuthorized('secret', 'wrong'), false);
});

test('isAuthorized rejects a missing key when one is configured', () => {
  assert.equal(isAuthorized('secret', undefined), false);
  assert.equal(isAuthorized('secret', ''), false);
});
