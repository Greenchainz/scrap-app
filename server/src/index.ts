import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './routers/_app';
import { createContext } from './trpc';

const app = express();

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

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      process.stderr.write(`tRPC error on ${path}: ${error.message}\n`);
    },
  }),
);

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
app.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`Server running on port ${PORT}\n`);
});

export { appRouter };
export type { AppRouter } from './routers/_app';
