import type {
  CredentialStore,
  OAuthCredential,
} from './credential-store.js';
import { UsageError } from './errors.js';
import { refreshOAuthCredential } from './oauth.js';

export type RequestCredential = {
  token: string;
  source: 'api_key' | 'oauth';
  oauth?: OAuthCredential;
};

export async function resolveRequestCredential(options: {
  explicitApiKey: string;
  store: CredentialStore;
  fetch?: typeof fetch | undefined;
  now?: number | undefined;
}): Promise<RequestCredential> {
  if (options.explicitApiKey) {
    return { token: options.explicitApiKey, source: 'api_key' };
  }

  const stored = await options.store.load();
  if (!stored) {
    throw new UsageError(
      'Authentication is required. Run goanyapi login or set GOANYAPI_API_KEY.'
    );
  }
  if (stored.kind === 'api_key') {
    return { token: stored.apiKey, source: 'api_key' };
  }

  const now = options.now ?? Date.now();
  let oauth = stored;
  if (oauth.expiresAt <= now + 60_000) {
    oauth = await refreshOAuthCredential(oauth, {
      fetch: options.fetch,
      now,
    });
    await options.store.save(oauth);
  }
  return { token: oauth.accessToken, source: 'oauth', oauth };
}

export async function refreshRequestCredential(options: {
  credential: RequestCredential;
  store: CredentialStore;
  fetch?: typeof fetch | undefined;
  now?: number | undefined;
}): Promise<RequestCredential> {
  if (options.credential.source !== 'oauth' || !options.credential.oauth) {
    return options.credential;
  }
  const oauth = await refreshOAuthCredential(options.credential.oauth, {
    fetch: options.fetch,
    now: options.now,
  });
  await options.store.save(oauth);
  return { token: oauth.accessToken, source: 'oauth', oauth };
}
