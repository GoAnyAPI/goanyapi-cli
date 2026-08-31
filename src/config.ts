import { createRequire } from 'node:module';

export interface DefaultEndpoints {
  oauthIssuer: string;
  oauthResource: string;
  apiBaseUrl: string;
}

const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json') as { version: string };

export const VERSION = packageMetadata.version;

export function resolveDefaultEndpoints(version: string): DefaultEndpoints {
  const prerelease = version.split('-', 2)[1];
  const isNext = prerelease === 'next' || prerelease?.startsWith('next.') === true;

  if (isNext) {
    return {
      oauthIssuer: 'https://www2.goanyapi.com',
      oauthResource: 'https://api.goanyapi.com',
      apiBaseUrl: 'https://api2.goanyapi.com',
    };
  }

  return {
    oauthIssuer: 'https://goanyapi.com',
    oauthResource: 'https://api.goanyapi.com',
    apiBaseUrl: 'https://api.goanyapi.com',
  };
}

export const DEFAULT_ENDPOINTS = resolveDefaultEndpoints(VERSION);
