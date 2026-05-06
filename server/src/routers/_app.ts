import { router } from '../trpc';
import { scrapRouter } from './scrap';

export const appRouter = router({
  scrap: scrapRouter,
});

export type AppRouter = typeof appRouter;
