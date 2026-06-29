/**
 * Azure Maps token vending via managed identity.
 *
 * In production (Azure Container Apps), DefaultAzureCredential automatically
 * picks up the system-assigned managed identity — no secrets needed.
 *
 * In local dev, DefaultAzureCredential falls through to the Azure CLI
 * credential (`az login`), so the same code path works with zero config.
 *
 * The token is cached in memory until it's within 5 minutes of expiry,
 * avoiding a round-trip to AAD on every map render.
 */
import { DefaultAzureCredential } from '@azure/identity';

// Azure Maps resource scope — same for all Maps accounts
const MAPS_SCOPE = 'https://atlas.microsoft.com/.default';

// 5-minute safety margin before the token actually expires
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

type CachedToken = {
  token: string;
  expiresAtMs: number;
};

let cached: CachedToken | null = null;
let credential: DefaultAzureCredential | null = null;

function getCredential(): DefaultAzureCredential {
  if (!credential) credential = new DefaultAzureCredential();
  return credential;
}

/**
 * Returns a short-lived AAD access token for Azure Maps.
 * Automatically refreshes when within 5 minutes of expiry.
 */
export async function getMapsToken(): Promise<{ token: string; expiresAtMs: number }> {
  const now = Date.now();

  if (cached && cached.expiresAtMs - now > REFRESH_BUFFER_MS) {
    return cached;
  }

  const tokenResponse = await getCredential().getToken(MAPS_SCOPE);

  if (!tokenResponse) {
    throw new Error('Failed to acquire Azure Maps token — check managed identity configuration');
  }

  cached = {
    token: tokenResponse.token,
    // expiresOnTimestamp is already epoch milliseconds.
    expiresAtMs: tokenResponse.expiresOnTimestamp,
  };

  return cached;
}
