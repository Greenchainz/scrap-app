import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './routers/_app';
import { createContext } from './trpc';
import { rateLimit } from './ratelimit';
import { runMigrations } from './migrate';
import { validateConfig } from './config';
import { pool } from './db';

// Resolves the Express "trust proxy" setting from TRUST_PROXY: a hop count, a
// boolean, or a subnet string. Defaults to 1 (trust the first proxy), which is
// correct behind Azure Container Apps ingress so X-Forwarded-For is honored.
function parseTrustProxy(value: string | undefined): number | boolean | string {
  if (value === undefined) return 1;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

const app = express();

// Real client IP comes from X-Forwarded-For behind a reverse proxy/ingress,
// which the per-IP rate limiter relies on.
app.set('trust proxy', parseTrustProxy(process.env['TRUST_PROXY']));

// CORS allowlist. Defaults to permissive ('*') to preserve existing behavior and
// native mobile clients (which send no Origin); set ALLOWED_ORIGINS to a
// comma-separated list in production to restrict browser origins.
const allowedOrigins = (process.env['ALLOWED_ORIGINS'] ?? '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = allowedOrigins.includes('*')
  ? {}
  : {
      origin(origin, callback) {
        // Allow non-browser clients (mobile apps, curl) that send no Origin.
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
    };

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Per-IP rate limit on the API. Tune via RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX;
// set RATE_LIMIT_MAX=0 to disable. The /health probe above is never limited.
const rateLimitWindowMs = parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '60000', 10);
const rateLimitMax = parseInt(process.env['RATE_LIMIT_MAX'] ?? '120', 10);

app.use(
  '/trpc',
  rateLimit({ windowMs: rateLimitWindowMs, max: rateLimitMax }),
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      process.stderr.write(`tRPC error on ${path}: ${error.message}\n`);
    },
  }),
);

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);

async function start(): Promise<void> {
  validateConfig();
  await runMigrations();
  const server = app.listen(PORT, '0.0.0.0', () => {
    process.stdout.write(`Server running on port ${PORT}\n`);
  });

  // Graceful shutdown: stop accepting connections, then drain the pg pool.
  // Azure Container Apps sends SIGTERM on every scale-in / revision swap.
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stdout.write(`${signal} received, shutting down gracefully\n`);

    const forceExit: unknown = setTimeout(() => {
      process.stderr.write('Forced shutdown after timeout\n');
      process.exit(1);
    }, 10000);
    // setTimeout's return type varies by lib (Node Timeout vs DOM number); treat
    // it structurally so .unref() is called only when the runtime provides it.
    if (
      forceExit !== null &&
      typeof forceExit === 'object' &&
      typeof (forceExit as { unref?: unknown }).unref === 'function'
    ) {
      (forceExit as { unref: () => void }).unref();
    }

    server.close(() => {
      pool
        .end()
        .then(() => {
          process.stdout.write('Shutdown complete\n');
          process.exit(0);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`Error during shutdown: ${message}\n`);
          process.exit(1);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal startup error: ${message}\n`);
  process.exit(1);
});

export { appRouter };
export type { AppRouter } from './routers/_app';
