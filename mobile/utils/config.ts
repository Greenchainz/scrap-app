const ENV = process.env['NODE_ENV'] ?? 'development';

const API_URLS: Record<string, string> = {
  development: 'http://localhost:3000',
  staging: 'https://scrap-app-staging.azurecontainerapps.io',
  production: 'https://scrap-app.azurecontainerapps.io',
};

export const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? API_URLS[ENV] ?? API_URLS['development']!;
