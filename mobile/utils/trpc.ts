import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../server/src/routers/_app.js';
import { API_URL, API_KEY } from './config.js';

export const trpc = createTRPCReact<AppRouter>();

export function createTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        headers() {
          return API_KEY ? { authorization: `Bearer ${API_KEY}` } : {};
        },
      }),
    ],
  });
}
