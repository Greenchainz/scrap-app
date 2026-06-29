import { router } from '../trpc';
import { scrapRouter } from './scrap';
import { yardsRouter } from './yards';
import { vehicleRouter } from './vehicle';

export const appRouter = router({
  scrap:   scrapRouter,
  yards:   yardsRouter,
  vehicle: vehicleRouter,
});

export type AppRouter = typeof appRouter;
