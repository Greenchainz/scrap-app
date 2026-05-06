import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './routers/_app';
import { createContext } from './trpc';

const app = express();

app.use(cors());
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
