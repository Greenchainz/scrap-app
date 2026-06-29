import { router, publicProcedure } from '../trpc';
import { getMapsToken } from '../maps';

export const mapsRouter = router({
  /**
   * Vends a short-lived Azure AD access token for Azure Maps.
   *
   * The mobile app calls this before rendering the map, then passes the token
   * to the atlas.js WebView using authType: 'anonymous'. This means the raw
   * subscription key never lives in the app bundle.
   *
   * Token is cached server-side for ~55 minutes (refreshed 5 min before expiry).
   */
  getToken: publicProcedure.query(async () => {
    const { token, expiresAtMs } = await getMapsToken();
    return { token, expiresAtMs };
  }),
});
