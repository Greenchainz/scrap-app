import { router } from '../trpc';
import { scrapRouter } from './scrap';
import { yardsRouter } from './yards';

export const appRouter = router({
  scrap: scrapRouter,
  yards: yardsRouter,
});

export type AppRouter = typeof appRouter;
