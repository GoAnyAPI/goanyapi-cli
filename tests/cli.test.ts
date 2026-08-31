import assert from 'node:assert/strict';
import test from 'node:test';
import { runCli, type CliDependencies } from '../src/cli.js';
import { DEFAULT_ENDPOINTS } from '../src/config.js';
import type {
  CredentialStore,
  StoredCredential,
} from '../src/credential-store.js';
import { catalogResponse } from './fixtures.js';

function capture() {
  let stdout = '';
  let stderr = '';
  return {
    writeOut: (text: string) => { stdout += text; },
    writeErr: (text: string) => { stderr += text; },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

function memoryStore(initial: StoredCredential | null = null) {
  let credential = initial;
  const store: CredentialStore = {
    async load() {
      return credential;
    },
    async save(value) {
      credential = value;
    },
    async clear() {
      credential = null;
    },
  };
  return { store, current: () => credential };
}

test('lists the remote APIs without authentication', async () => {
  const output = capture();
  const exitCode = await runCli(['list'], {
    fetch: async () => catalogResponse(),
    stdout: output.writeOut,
    stderr: output.writeErr,
    env: {},
  });
  assert.equal(exitCode, 0);
  assert.match(output.stdout(), /traffic/);
  assert.match(output.stdout(), /credits-balance/);
  assert.equal(output.stderr(), '');
});

test('shows help for API and utility commands', async () => {
  const apiHelp = capture();
  assert.equal(
    await runCli(['serp', '--help'], {
      fetch: async () => catalogResponse(),
      stdout: apiHelp.writeOut,
      stderr: apiHelp.writeErr,
      env: {},
    }),
    0
  );
  assert.match(apiHelp.stdout(), /--q <string> \(required\)/);

  const childHelp = capture();
  assert.equal(
    await runCli(['describe', 'ads-statistics'], {
      fetch: async () => catalogResponse(),
      stdout: childHelp.writeOut,
      stderr: childHelp.writeErr,
      env: {},
    }),
    0
  );
  assert.match(childHelp.stdout(), /Modes:/);
  assert.match(childHelp.stdout(), /advertiser-search/);
  assert.match(childHelp.stdout(), /goanyapi ads-statistics advertiser-search/);

  const listHelp = capture();
  assert.equal(
    await runCli(['list', '--help'], {
      stdout: listHelp.writeOut,
      stderr: listHelp.writeErr,
      env: {},
    }),
    0
  );
  assert.match(listHelp.stdout(), /goanyapi list/);
});

test('executes a catalog API and can print only data', async () => {
  const output = capture();
  const fetcher: typeof fetch = async (input) => {
    if (String(input).endsWith('/api/v1/mcp/catalog')) {
      return catalogResponse();
    }
    return Response.json({
      code: 'ok',
      message: 'ok',
      data: { remainingCredits: 42 },
    });
  };

  const exitCode = await runCli(
    ['balance', '--data-only', '--output', 'json'],
    {
      fetch: fetcher,
      stdout: output.writeOut,
      stderr: output.writeErr,
      env: { GOANYAPI_API_KEY: 'secret-key' },
    }
  );
  assert.equal(exitCode, 0);
  assert.equal(output.stdout(), '{"remainingCredits":42}\n');
  assert.equal(output.stderr(), '');
});

test('does not expose the API key in an authentication error', async () => {
  const output = capture();
  const credentials = memoryStore();
  const exitCode = await runCli(['credits-balance'], {
    fetch: async () => catalogResponse(),
    stdout: output.writeOut,
    stderr: output.writeErr,
    env: {},
    credentialStore: credentials.store,
  });
  assert.equal(exitCode, 2);
  assert.match(output.stderr(), /Authentication is required/);
});

test('saves OAuth login and reports authentication status', async () => {
  const output = capture();
  const credentials = memoryStore();
  const oauth = {
    kind: 'oauth' as const,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.parse('2030-01-01T00:00:00.000Z'),
    scope: 'api:invoke' as const,
    resource: 'https://api.goanyapi.com',
    clientId: 'goanyapi-cli' as const,
    issuer: 'https://goanyapi.com',
  };

  assert.equal(
    await runCli(['login'], {
      stdout: output.writeOut,
      stderr: output.writeErr,
      env: {},
      credentialStore: credentials.store,
      login: async () => oauth,
    }),
    0
  );
  assert.deepEqual(credentials.current(), oauth);

  assert.equal(
    await runCli(['auth', 'status'], {
      stdout: output.writeOut,
      stderr: output.writeErr,
      env: {},
      credentialStore: credentials.store,
    }),
    0
  );
  assert.match(output.stdout(), /Authenticated with OAuth/);
  assert.doesNotMatch(output.stdout(), /access-token|refresh-token/);
});

test('login uses release OAuth defaults independently from the API base URL', async () => {
  const output = capture();
  const credentials = memoryStore();
  let loginOptions:
    | Parameters<NonNullable<CliDependencies['login']>>[0]
    | undefined;
  const oauth = {
    kind: 'oauth' as const,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.parse('2030-01-01T00:00:00.000Z'),
    scope: 'api:invoke' as const,
    resource: DEFAULT_ENDPOINTS.oauthResource,
    clientId: 'goanyapi-cli' as const,
    issuer: DEFAULT_ENDPOINTS.oauthIssuer,
  };

  assert.equal(
    await runCli(['login', '--base-url', 'https://custom-api.example.com'], {
      stdout: output.writeOut,
      stderr: output.writeErr,
      env: {},
      credentialStore: credentials.store,
      login: async (options) => {
        loginOptions = options;
        return oauth;
      },
    }),
    0
  );
  assert.equal(loginOptions?.issuer, DEFAULT_ENDPOINTS.oauthIssuer);
  assert.equal(loginOptions?.resource, DEFAULT_ENDPOINTS.oauthResource);
});

test('auth set-key uses hidden prompt input and stores the key', async () => {
  const output = capture();
  const credentials = memoryStore();
  assert.equal(
    await runCli(['auth', 'set-key'], {
      stdout: output.writeOut,
      stderr: output.writeErr,
      env: {},
      credentialStore: credentials.store,
      promptSecret: async () => 'ga_saved',
    }),
    0
  );
  assert.deepEqual(credentials.current(), {
    kind: 'api_key',
    apiKey: 'ga_saved',
  });
  assert.doesNotMatch(output.stdout(), /ga_saved/);
});

test('refreshes OAuth once and retries an API request after 401', async () => {
  const output = capture();
  const credentials = memoryStore({
    kind: 'oauth',
    accessToken: 'expired-access',
    refreshToken: 'refresh-token',
    expiresAt: Date.parse('2030-01-01T00:00:00.000Z'),
    scope: 'api:invoke',
    resource: 'https://api.goanyapi.com',
    clientId: 'goanyapi-cli',
    issuer: 'https://goanyapi.com',
  });
  let apiCalls = 0;
  let refreshCalls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/v1/mcp/catalog')) {
      return catalogResponse();
    }
    if (url.endsWith('/.well-known/oauth-authorization-server')) {
      return Response.json({
        issuer: 'https://goanyapi.com',
        authorization_endpoint: 'https://goanyapi.com/oauth/authorize',
        token_endpoint: 'https://goanyapi.com/api/oauth/token',
        revocation_endpoint: 'https://goanyapi.com/api/oauth/revoke',
      });
    }
    if (url.endsWith('/api/oauth/token')) {
      refreshCalls += 1;
      assert.match(String(init?.body), /grant_type=refresh_token/);
      return Response.json({
        access_token: 'fresh-access',
        refresh_token: 'rotated-refresh',
        expires_in: 1800,
        token_type: 'Bearer',
        scope: 'api:invoke',
      });
    }
    apiCalls += 1;
    const authorization = new Headers(init?.headers).get('authorization');
    if (apiCalls === 1) {
      assert.equal(authorization, 'Bearer expired-access');
      return Response.json(
        { code: 'unauthorized', message: 'expired' },
        { status: 401 }
      );
    }
    assert.equal(authorization, 'Bearer fresh-access');
    return Response.json({ code: 'ok', data: { remainingCredits: 9 } });
  };

  assert.equal(
    await runCli(['balance', '--data-only', '--output', 'json'], {
      fetch: fetcher,
      stdout: output.writeOut,
      stderr: output.writeErr,
      env: {},
      credentialStore: credentials.store,
      now: () => Date.parse('2029-01-01T00:00:00.000Z'),
    }),
    0
  );
  assert.equal(apiCalls, 2);
  assert.equal(refreshCalls, 1);
  assert.equal(output.stdout(), '{"remainingCredits":9}\n');
  assert.deepEqual(credentials.current(), {
    kind: 'oauth',
    accessToken: 'fresh-access',
    refreshToken: 'rotated-refresh',
    expiresAt: Date.parse('2029-01-01T00:30:00.000Z'),
    scope: 'api:invoke',
    resource: 'https://api.goanyapi.com',
    clientId: 'goanyapi-cli',
    issuer: 'https://goanyapi.com',
  });
});
