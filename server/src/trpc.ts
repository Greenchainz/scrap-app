import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { IncomingHttpHeaders } from 'node:http';
import { z } from 'zod';

// Pulls the caller-supplied API key from either `Authorization: Bearer <key>`
// or the `x-api-key` header. Pure + header-only so it is trivial to unit test.
export function extractApiKey(headers: IncomingHttpHeaders): string | undefined {
  const auth = headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim() || undefined;
  }
  const apiKeyHeader = headers['x-api-key'];
  if (typeof apiKeyHeader === 'string') return apiKeyHeader.trim() || undefined;
  if (Array.isArray(apiKeyHeader)) return apiKeyHeader[0]?.trim() || undefined;
  return undefined;
}

// Authorization decision. When no key is configured server-side, auth is
// disabled (dev-friendly, mirrors the ALLOWED_ORIGINS CORS default); when a key
// is configured, the request must present a matching key.
export function isAuthorized(
  configuredKey: string | undefined,
  providedKey: string | undefined,
): boolean {
  if (!configuredKey) return true;
  return !!providedKey && providedKey === configuredKey;
}

export const createContext = ({ req }: CreateExpressContextOptions) => ({
  apiKey: extractApiKey(req.headers),
});
export type Context = ReturnType<typeof createContext>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Gates a procedure behind the shared API key (no-op when API_KEY is unset).
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!isAuthorized(process.env['API_KEY'], ctx.apiKey)) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid or missing API key' });
  }
  return next();
});

export const staffProcedure = t.procedure.use(({ ctx, next }) => {
  // Falls back to API_KEY if STAFF_API_KEY is not configured.
  const staffKey = process.env['STAFF_API_KEY'] ?? process.env['API_KEY'];
  if (!isAuthorized(staffKey, ctx.apiKey)) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Staff access required' });
  }
  return next();
});

export { TRPCError, z };
