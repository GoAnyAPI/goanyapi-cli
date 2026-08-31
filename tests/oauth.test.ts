import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loginWithBrowser,
  OAUTH_CLIENT_ID,
  OAUTH_SCOPE,
  refreshOAuthCredential,
} from '../src/oauth.js';

const metadata = {
  issuer: 'https://goanyapi.com',
  authorization_endpoint: 'https://goanyapi.com/oauth/authorize',
  token_endpoint: 'https://goanyapi.com/api/oauth/token',
  revocation_endpoint: 'https://goanyapi.com/api/oauth/revoke',
};

test('browser login uses the fixed CLI client, PKCE, and loopback callback', async () => {
  let authorizationUrl: URL | undefined;
  let tokenBody: URLSearchParams | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/.well-known/oauth-authorization-server')) {
      return Response.json(metadata);
    }
    if (url.endsWith('/api/oauth/token')) {
      tokenBody = new URLSearchParams(String(init?.body));
      return Response.json({
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in: 1800,
        token_type: 'Bearer',
        scope: OAUTH_SCOPE,
      });
    }
    throw new Error('Unexpected URL: ' + url);
  };

  const credential = await loginWithBrowser({
    issuer: metadata.issuer,
    resource: 'https://api.goanyapi.com',
    fetch: fetcher,
    now: 1_000,
    openBrowser: async (value) => {
      authorizationUrl = new URL(value);
      const redirect = new URL(
        authorizationUrl.searchParams.get('redirect_uri') ?? ''
      );
      redirect.searchParams.set('code', 'authorization-code');
      redirect.searchParams.set(
        'state',
        authorizationUrl.searchParams.get('state') ?? ''
      );
      redirect.searchParams.set('iss', metadata.issuer);
      setTimeout(() => {
        void fetch(redirect);
      }, 10);
      return true;
    },
  });

  assert.equal(authorizationUrl?.searchParams.get('client_id'), OAUTH_CLIENT_ID);
  assert.equal(authorizationUrl?.searchParams.get('scope'), OAUTH_SCOPE);
  assert.equal(
    authorizationUrl?.searchParams.get('resource'),
    'https://api.goanyapi.com'
  );
  assert.equal(
    authorizationUrl?.searchParams.get('code_challenge_method'),
    'S256'
  );
  assert.match(
    authorizationUrl?.searchParams.get('redirect_uri') ?? '',
    /^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/
  );
  assert.equal(tokenBody?.get('client_id'), OAUTH_CLIENT_ID);
  assert.equal(tokenBody?.get('resource'), 'https://api.goanyapi.com');
  assert.ok((tokenBody?.get('code_verifier')?.length ?? 0) >= 43);
  assert.equal(credential.accessToken, 'access');
  assert.equal(credential.refreshToken, 'refresh');
  assert.equal(credential.expiresAt, 1_801_000);
});

test('refresh rotates the OAuth refresh token for the API resource', async () => {
  const bodies: URLSearchParams[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/.well-known/oauth-authorization-server')) {
      return Response.json(metadata);
    }
    bodies.push(new URLSearchParams(String(init?.body)));
    return Response.json({
      access_token: 'next-access',
      refresh_token: 'next-refresh',
      expires_in: 900,
      token_type: 'Bearer',
      scope: OAUTH_SCOPE,
    });
  };

  const refreshed = await refreshOAuthCredential(
    {
      kind: 'oauth',
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: 0,
      scope: OAUTH_SCOPE,
      resource: 'https://api.goanyapi.com',
      clientId: OAUTH_CLIENT_ID,
      issuer: 'https://goanyapi.com',
    },
    { fetch: fetcher, now: 5_000 }
  );

  assert.equal(bodies[0]?.get('grant_type'), 'refresh_token');
  assert.equal(bodies[0]?.get('refresh_token'), 'old-refresh');
  assert.equal(bodies[0]?.get('resource'), 'https://api.goanyapi.com');
  assert.equal(refreshed.refreshToken, 'next-refresh');
  assert.equal(refreshed.expiresAt, 905_000);
});
