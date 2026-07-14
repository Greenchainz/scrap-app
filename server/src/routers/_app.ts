import { router } from '../trpc';
import { scrapRouter } from './scrap';
import { yardsRouter } from './yards';
import { vehicleRouter } from './vehicle';
import { mapsRouter } from './maps';

export const appRouter = router({
  scrap:   scrapRouter,
  yards:   yardsRouter,
  vehicle: vehicleRouter,
  maps:    mapsRouter,
});

export type AppRouter = typeof appRouter;
