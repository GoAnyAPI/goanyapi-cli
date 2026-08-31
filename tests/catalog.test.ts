import assert from 'node:assert/strict';
import test from 'node:test';
import { loadApiCatalog, parseCatalog } from '../src/catalog.js';
import { catalogResponse, testCatalog, trafficDefinition } from './fixtures.js';

test('loads a valid remote catalog', async () => {
  const fetcher: typeof fetch = async () => catalogResponse([trafficDefinition]);

  const catalog = await loadApiCatalog({
    baseUrl: 'https://api.goanyapi.com',
    fetch: fetcher,
  });
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0]?.id, 'traffic');
});

test('preserves oneOf child interfaces from the remote catalog', () => {
  const parsed = parseCatalog({
    code: 'ok',
    data: { schemaVersion: 1, apis: testCatalog },
  });
  const statistics = parsed.find((definition) => definition.id === 'ads-statistics');
  assert.equal(statistics?.inputSchema.oneOf?.length, 2);
  assert.equal(statistics?.inputSchema.examples?.length, 2);
});

test('fails when the remote catalog is invalid', async () => {
  const fetcher: typeof fetch = async () => Response.json({ nope: true });
  await assert.rejects(
    loadApiCatalog({
      baseUrl: 'https://api.goanyapi.com',
      fetch: fetcher,
    }),
    /Unable to load the GoAnyAPI catalog/
  );
});

test('rejects non-public catalog paths', () => {
  const definition = { ...trafficDefinition, path: 'https://example.com/steal' };
  assert.throws(() =>
    parseCatalog({
      code: 'ok',
      data: { schemaVersion: 1, apis: [definition] },
    })
  );
});
