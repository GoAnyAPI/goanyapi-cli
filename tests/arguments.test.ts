import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArguments, parseCommandParameters } from '../src/arguments.js';
import { UsageError } from '../src/errors.js';
import { DEFAULT_ENDPOINTS } from '../src/config.js';
import { testCatalog } from './fixtures.js';

function api(id: string) {
  const definition = testCatalog.find((item) => item.id === id);
  assert.ok(definition);
  return definition;
}

test('parses global options independently of API arguments', () => {
  const parsed = parseArguments(
    ['traffic', '--domain', 'example.com', '--output=json', '--timeout', '2'],
    { GOANYAPI_API_KEY: 'env-key' }
  );
  assert.deepEqual(parsed.rest, ['traffic', '--domain', 'example.com']);
  assert.equal(parsed.globals.apiKey, 'env-key');
  assert.equal(parsed.globals.baseUrl, DEFAULT_ENDPOINTS.apiBaseUrl);
  assert.equal(parsed.globals.output, 'json');
  assert.equal(parsed.globals.timeoutMs, 2_000);
});

test('allows the release default API URL to be overridden', () => {
  const parsed = parseArguments([], {
    GOANYAPI_BASE_URL: 'https://custom-api.example.com/',
  });

  assert.equal(parsed.globals.baseUrl, 'https://custom-api.example.com');
});

test('coerces schema values and supports a required positional', () => {
  assert.deepEqual(
    parseCommandParameters(api('traffic'), ['example.com', '--month', '6']),
    { domain: 'example.com', month: 6 }
  );
});

test('accepts kebab-case aliases for camelCase API fields', () => {
  assert.deepEqual(
    parseCommandParameters(api('transparency'), ['--creative-ids', 'a,b']),
    { creativeIds: 'a,b' }
  );
  assert.deepEqual(
    parseCommandParameters(api('bing-serp'), ['--q', 'test', '--set-lang', 'en-US']),
    { q: 'test', setLang: 'en-US' }
  );
});

test('maps child interface names to actions and validates their oneOf branch', () => {
  assert.deepEqual(
    parseCommandParameters(api('ads-statistics'), [
      'advertiser-search',
      '--keyword',
      'ai',
    ]),
    { action: 'advertiserSearch', keyword: 'ai' }
  );
  assert.throws(
    () => parseCommandParameters(api('ads-statistics'), ['advertiser-search']),
    (error) => error instanceof UsageError && /--keyword/.test(error.message)
  );
  assert.throws(
    () =>
      parseCommandParameters(api('ads-statistics'), [
        'advertiser-statistics',
        '--advertiser-id',
        'not-numeric',
        '--start-day',
        '2026-03-01',
        '--end-day',
        '2026-03-31',
      ]),
    (error) => error instanceof UsageError && /invalid format/.test(error.message)
  );
});

test('requires exactly one transparency mode', () => {
  assert.deepEqual(
    parseCommandParameters(api('transparency'), ['--domain', 'example.com']),
    { domain: 'example.com' }
  );
  assert.throws(
    () =>
      parseCommandParameters(api('transparency'), [
        '--domain',
        'example.com',
        '--keyword',
        'ai',
      ]),
    (error) => error instanceof UsageError && /exactly one mode/.test(error.message)
  );
});

test('rejects missing, unknown, and invalid enum parameters', () => {
  assert.throws(
    () => parseCommandParameters(api('traffic'), []),
    (error) => error instanceof UsageError && /Missing required/.test(error.message)
  );
  assert.throws(
    () => parseCommandParameters(api('dr'), ['--other', 'x']),
    (error) => error instanceof UsageError && /Unknown option/.test(error.message)
  );
  assert.throws(
    () => parseCommandParameters(api('traffic'), ['example.com', '--month', '4']),
    (error) => error instanceof UsageError && /must be one of/.test(error.message)
  );
});

test('parses credit activity pagination and filters', () => {
  assert.deepEqual(
    parseCommandParameters(api('activity-credits'), [
      '--page',
      '2',
      '--size',
      '50',
      '--type',
      'consume',
      '--request-status',
      'failed',
    ]),
    {
      page: 2,
      size: 50,
      type: 'consume',
      requestStatus: 'failed',
    }
  );
  assert.throws(
    () => parseCommandParameters(api('activity-credits'), ['--page', '0']),
    (error) => error instanceof UsageError && /at least 1/.test(error.message)
  );
  assert.throws(
    () => parseCommandParameters(api('activity-credits'), ['--size', '101']),
    (error) => error instanceof UsageError && /at most 100/.test(error.message)
  );
});
