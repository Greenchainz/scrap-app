// Fail-fast environment validation. Call validateConfig() once at startup so the
// process refuses to boot with missing/empty required configuration instead of
// failing later on the first request (or, worse, silently misbehaving).
//
// Required vars are only enforced when NODE_ENV=production, keeping local/dev and
// test runs friction-free. In production we also warn when security-sensitive
// settings are left at their permissive dev defaults.

const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'BLOB_STORAGE_CONNECTION_STRING',
] as const;

export function validateConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env['NODE_ENV'] !== 'production') return;

  const missing = REQUIRED_IN_PRODUCTION.filter((key) => {
    const value = env[key];
    return value === undefined || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s) in production: ${missing.join(', ')}. ` +
        'Set them before starting the server.',
    );
  }

  // Non-fatal warnings: security defaults that should be tightened in production.
  if (!env['API_KEY'] || env['API_KEY'].trim() === '') {
    process.stderr.write(
      'WARNING: API_KEY is not set — the API is unauthenticated. Set API_KEY to require a key.\n',
    );
  }
  if (!env['ALLOWED_ORIGINS'] || env['ALLOWED_ORIGINS'].trim() === '' || env['ALLOWED_ORIGINS'] === '*') {
    process.stderr.write(
      'WARNING: ALLOWED_ORIGINS is permissive (*) — set a comma-separated allowlist to restrict browser origins.\n',
    );
  }
}
