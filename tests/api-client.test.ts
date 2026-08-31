import assert from 'node:assert/strict';
import test from 'node:test';
import { callApi } from '../src/api-client.js';
import { ApiRequestError } from '../src/errors.js';
import { trafficDefinition } from './fixtures.js';

const traffic = trafficDefinition;

test('sends API key and schema parameters to GoAnyAPI', async () => {
  let requestUrl = '';
  let authorization = '';
  const fetcher: typeof fetch = async (input, init) => {
    requestUrl = String(input);
    authorization = new Headers(init?.headers).get('authorization') ?? '';
    return Response.json({ code: 'ok', data: { value: 1 } });
  };

  const response = await callApi({
    baseUrl: 'https://api.goanyapi.com',
    definition: traffic,
    parameters: { domain: 'example.com', month: 3 },
    credential: 'secret-key',
    timeoutMs: 1_000,
    fetch: fetcher,
  });

  assert.equal(
    requestUrl,
    'https://api.goanyapi.com/api/v1/traffic?domain=example.com&month=3'
  );
  assert.equal(authorization, 'Bearer secret-key');
  assert.deepEqual(response.body, { code: 'ok', data: { value: 1 } });
});

test('preserves structured GoAnyAPI errors', async () => {
  const fetcher: typeof fetch = async () =>
    Response.json(
      { code: 'insufficient_credits', message: 'Insufficient credits' },
      { status: 402 }
    );

  await assert.rejects(
    callApi({
      baseUrl: 'https://api.goanyapi.com',
      definition: traffic,
      parameters: { domain: 'example.com' },
      credential: 'secret-key',
      timeoutMs: 1_000,
      fetch: fetcher,
    }),
    (error) =>
      error instanceof ApiRequestError &&
      error.status === 402 &&
      /insufficient_credits/.test(error.message)
  );
});
