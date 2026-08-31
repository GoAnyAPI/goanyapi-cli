import { spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEFAULT_ENDPOINTS } from './config.js';
import type { OAuthCredential } from './credential-store.js';

export const OAUTH_CLIENT_ID = 'goanyapi-cli';
export const OAUTH_SCOPE = 'api:invoke';
export const DEFAULT_OAUTH_ISSUER = DEFAULT_ENDPOINTS.oauthIssuer;
export const DEFAULT_OAUTH_RESOURCE = DEFAULT_ENDPOINTS.oauthResource;

type OAuthMetadata = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export class OAuthError extends Error {}

function trimSlash(value: string) {
  return value.replace(/\/$/, '');
}

function isLoopback(url: URL) {
  return (
    url.hostname === '127.0.0.1' ||
    url.hostname === 'localhost' ||
    url.hostname === '[::1]' ||
    url.hostname === '::1'
  );
}

function validateEndpoint(value: unknown, issuer: URL, name: string): string {
  if (typeof value !== 'string') {
    throw new OAuthError('OAuth metadata is missing ' + name + '.');
  }
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new OAuthError('OAuth metadata contains an invalid ' + name + '.');
  }
  if (
    endpoint.origin !== issuer.origin ||
    (endpoint.protocol !== 'https:' &&
      !(endpoint.protocol === 'http:' && isLoopback(endpoint)))
  ) {
    throw new OAuthError('OAuth metadata contains an untrusted ' + name + '.');
  }
  return endpoint.href;
}

export async function loadOAuthMetadata(options: {
  issuer: string;
  fetch?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
}): Promise<OAuthMetadata> {
  const issuer = new URL(trimSlash(options.issuer));
  if (
    issuer.protocol !== 'https:' &&
    !(issuer.protocol === 'http:' && isLoopback(issuer))
  ) {
    throw new OAuthError('OAuth issuer must use HTTPS or loopback HTTP.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await (options.fetch ?? globalThis.fetch)(
      issuer.href.replace(/\/$/, '') +
        '/.well-known/oauth-authorization-server',
      {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      throw new OAuthError(
        'OAuth discovery failed with status ' + response.status + '.'
      );
    }
    const body = (await response.json()) as Record<string, unknown>;
    if (trimSlash(String(body.issuer || '')) !== trimSlash(issuer.href)) {
      throw new OAuthError('OAuth metadata issuer does not match.');
    }
    return {
      issuer: trimSlash(issuer.href),
      authorizationEndpoint: validateEndpoint(
        body.authorization_endpoint,
        issuer,
        'authorization_endpoint'
      ),
      tokenEndpoint: validateEndpoint(
        body.token_endpoint,
        issuer,
        'token_endpoint'
      ),
      revocationEndpoint: validateEndpoint(
        body.revocation_endpoint,
        issuer,
        'revocation_endpoint'
      ),
    };
  } catch (error) {
    if (error instanceof OAuthError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OAuthError('OAuth discovery timed out.');
    }
    throw new OAuthError(
      error instanceof Error ? error.message : 'OAuth discovery failed.'
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseTokenResponse(value: unknown): TokenResponse {
  if (!value || typeof value !== 'object') {
    throw new OAuthError('OAuth token response is invalid.');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.access_token !== 'string' ||
    typeof record.refresh_token !== 'string' ||
    typeof record.expires_in !== 'number' ||
    !Number.isFinite(record.expires_in) ||
    record.expires_in <= 0 ||
    record.token_type !== 'Bearer' ||
    record.scope !== OAUTH_SCOPE
  ) {
    throw new OAuthError('OAuth token response is invalid.');
  }
  return record as TokenResponse;
}

async function tokenRequest(options: {
  endpoint: string;
  body: URLSearchParams;
  fetch?: typeof fetch | undefined;
}): Promise<TokenResponse> {
  const response = await (options.fetch ?? globalThis.fetch)(options.endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: options.body,
  });
  const value = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!response.ok) {
    const description =
      value && typeof value.error_description === 'string'
        ? value.error_description
        : 'OAuth token request failed with status ' + response.status + '.';
    throw new OAuthError(description);
  }
  return parseTokenResponse(value);
}

function toCredential(options: {
  token: TokenResponse;
  issuer: string;
  resource: string;
  now?: number | undefined;
}): OAuthCredential {
  return {
    kind: 'oauth',
    accessToken: options.token.access_token,
    refreshToken: options.token.refresh_token,
    expiresAt: (options.now ?? Date.now()) + options.token.expires_in * 1000,
    scope: OAUTH_SCOPE,
    resource: trimSlash(options.resource),
    clientId: OAUTH_CLIENT_ID,
    issuer: trimSlash(options.issuer),
  };
}

export async function refreshOAuthCredential(
  credential: OAuthCredential,
  options: {
    fetch?: typeof fetch | undefined;
    now?: number | undefined;
  } = {}
): Promise<OAuthCredential> {
  const metadata = await loadOAuthMetadata({
    issuer: credential.issuer,
    fetch: options.fetch,
  });
  const token = await tokenRequest({
    endpoint: metadata.tokenEndpoint,
    fetch: options.fetch,
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credential.refreshToken,
      client_id: OAUTH_CLIENT_ID,
      resource: credential.resource,
    }),
  });
  return toCredential({
    token,
    issuer: metadata.issuer,
    resource: credential.resource,
    now: options.now,
  });
}

export async function revokeOAuthCredential(
  credential: OAuthCredential,
  options: { fetch?: typeof fetch | undefined } = {}
) {
  const metadata = await loadOAuthMetadata({
    issuer: credential.issuer,
    fetch: options.fetch,
  });
  const response = await (options.fetch ?? globalThis.fetch)(metadata.revocationEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: credential.refreshToken,
      token_type_hint: 'refresh_token',
      client_id: OAUTH_CLIENT_ID,
    }),
  });
  if (!response.ok) {
    throw new OAuthError(
      'OAuth revocation failed with status ' + response.status + '.'
    );
  }
}

export async function openSystemBrowser(url: string): Promise<boolean> {
  const command =
    process.platform === 'win32'
      ? 'rundll32.exe'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  const args =
    process.platform === 'win32'
      ? ['url.dll,FileProtocolHandler', url]
      : [url];
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    let settled = false;
    child.once('spawn', () => {
      settled = true;
      child.unref();
      resolve(true);
    });
    child.once('error', () => {
      if (!settled) resolve(false);
    });
  });
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

export async function loginWithBrowser(options: {
  issuer?: string | undefined;
  resource?: string | undefined;
  fetch?: typeof fetch | undefined;
  openBrowser?: ((url: string) => Promise<boolean>) | undefined;
  onStatus?: ((message: string) => void) | undefined;
  timeoutMs?: number | undefined;
  now?: number | undefined;
} = {}): Promise<OAuthCredential> {
  const issuer = trimSlash(options.issuer ?? DEFAULT_OAUTH_ISSUER);
  const resource = trimSlash(options.resource ?? DEFAULT_OAUTH_RESOURCE);
  const metadata = await loadOAuthMetadata({ issuer, fetch: options.fetch });
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256')
    .update(verifier)
    .digest('base64url');
  const state = randomBytes(24).toString('base64url');

  let resolveCallback!: (code: string) => void;
  let rejectCallback!: (error: Error) => void;
  const callback = new Promise<string>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.setHeader(
      'content-security-policy',
      "default-src 'none'; style-src 'unsafe-inline'"
    );
    if (request.method !== 'GET' || url.pathname !== '/oauth/callback') {
      response.statusCode = 404;
      response.end('Not Found');
      return;
    }
    if (!safeEqual(url.searchParams.get('state') ?? '', state)) {
      response.statusCode = 400;
      response.end('Invalid OAuth state. You may close this window.');
      return;
    }
    const callbackIssuer = url.searchParams.get('iss');
    if (callbackIssuer && trimSlash(callbackIssuer) !== metadata.issuer) {
      response.statusCode = 400;
      response.end('Invalid OAuth issuer. You may close this window.');
      rejectCallback(new OAuthError('OAuth callback issuer does not match.'));
      return;
    }
    const error = url.searchParams.get('error');
    if (error) {
      response.statusCode = 400;
      response.end('Authorization was not completed. You may close this window.');
      rejectCallback(
        new OAuthError(
          url.searchParams.get('error_description') || 'Authorization was denied.'
        )
      );
      return;
    }
    const code = url.searchParams.get('code') ?? '';
    if (!code) {
      response.statusCode = 400;
      response.end('Authorization code is missing. You may close this window.');
      rejectCallback(new OAuthError('OAuth callback did not include a code.'));
      return;
    }
    response.end(
      '<!doctype html><title>GoAnyAPI CLI</title><p>Authentication complete. You may close this window.</p>'
    );
    resolveCallback(code);
  });

  const port = await listen(server);
  const redirectUri = 'http://127.0.0.1:' + port + '/oauth/callback';
  const authorizationUrl = new URL(metadata.authorizationEndpoint);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('scope', OAUTH_SCOPE);
  authorizationUrl.searchParams.set('resource', resource);
  authorizationUrl.searchParams.set('code_challenge', challenge);
  authorizationUrl.searchParams.set('code_challenge_method', 'S256');
  authorizationUrl.searchParams.set('state', state);

  const opened = await (options.openBrowser ?? openSystemBrowser)(
    authorizationUrl.href
  );
  if (opened) {
    options.onStatus?.('Opening your browser for GoAnyAPI authorization...');
  } else {
    options.onStatus?.(
      'Open this URL in a browser to continue:\n' + authorizationUrl.href
    );
  }

  const timer = setTimeout(
    () => rejectCallback(new OAuthError('OAuth login timed out.')),
    options.timeoutMs ?? 5 * 60 * 1000
  );
  let code: string;
  try {
    code = await callback;
  } finally {
    clearTimeout(timer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  const token = await tokenRequest({
    endpoint: metadata.tokenEndpoint,
    fetch: options.fetch,
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      client_id: OAUTH_CLIENT_ID,
      resource,
    }),
  });
  return toCredential({
    token,
    issuer: metadata.issuer,
    resource,
    now: options.now,
  });
}
