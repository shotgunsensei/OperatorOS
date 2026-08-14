const isProduction = process.env.NODE_ENV === 'production';

function trimSlash(url: string): string {
  return url.replace(/\/$/, '');
}

export function resolveServerApiOrigin(): string {
  const internalApiUrl = process.env.INTERNAL_API_URL;
  const publicApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const configuredUrl = internalApiUrl || publicApiUrl;

  if (!configuredUrl) {
    const message =
      'Missing API URL configuration: set INTERNAL_API_URL or NEXT_PUBLIC_API_URL for production builds.';
    if (isProduction) throw new Error(message);
    console.warn(message);
    return 'http://localhost:5001';
  }

  return trimSlash(configuredUrl);
}

