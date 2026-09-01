import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ENDPOINTS,
  VERSION,
  resolveDefaultEndpoints,
} from '../src/config.js';

test('next versions use the test environment', () => {
  assert.deepEqual(resolveDefaultEndpoints('0.0.1-next.1'), {
    oauthIssuer: 'https://www2.goanyapi.com',
    oauthResource: 'https://api.goanyapi.com',
    apiBaseUrl: 'https://api2.goanyapi.com',
  });
  assert.deepEqual(resolveDefaultEndpoints('0.0.1-next'), {
    oauthIssuer: 'https://www2.goanyapi.com',
    oauthResource: 'https://api.goanyapi.com',
    apiBaseUrl: 'https://api2.goanyapi.com',
  });
});

test('stable and unrelated prerelease versions use production', () => {
  assert.deepEqual(resolveDefaultEndpoints('0.0.1'), {
    oauthIssuer: 'https://goanyapi.com',
    oauthResource: 'https://api.goanyapi.com',
    apiBaseUrl: 'https://api.goanyapi.com',
  });
  assert.deepEqual(resolveDefaultEndpoints('0.0.1-beta.1'), {
    oauthIssuer: 'https://goanyapi.com',
    oauthResource: 'https://api.goanyapi.com',
    apiBaseUrl: 'https://api.goanyapi.com',
  });
});

test('current package version selects the exported defaults', () => {
  assert.equal(VERSION, '0.0.6');
  assert.equal(DEFAULT_ENDPOINTS.oauthIssuer, 'https://goanyapi.com');
  assert.equal(DEFAULT_ENDPOINTS.oauthResource, 'https://api.goanyapi.com');
  assert.equal(DEFAULT_ENDPOINTS.apiBaseUrl, 'https://api.goanyapi.com');
});
