import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  checkForUpdate,
  isNewerVersion,
  releaseChannelForVersion,
  renderUpdateNotice,
  shouldCheckForUpdates,
} from '../src/update-check.js';

test('selects npm dist-tags from the installed release channel', () => {
  assert.equal(releaseChannelForVersion('0.0.1-next.1'), 'next');
  assert.equal(releaseChannelForVersion('0.0.1'), 'latest');
});

test('compares stable and prerelease semantic versions', () => {
  assert.equal(isNewerVersion('0.0.1-next.2', '0.0.1-next.1'), true);
  assert.equal(isNewerVersion('0.0.1', '0.0.1-next.2'), true);
  assert.equal(isNewerVersion('0.0.1-next.1', '0.0.1-next.2'), false);
  assert.equal(isNewerVersion('invalid', '0.0.1'), false);
});

test('checks only interactive non-CI environments unless disabled', () => {
  assert.equal(shouldCheckForUpdates({}, true), true);
  assert.equal(shouldCheckForUpdates({ CI: 'true' }, true), false);
  assert.equal(
    shouldCheckForUpdates({ GOANYAPI_NO_UPDATE_CHECK: '1' }, true),
    false
  );
  assert.equal(shouldCheckForUpdates({}, false), false);
});

test('uses the next tag and caches a successful registry check', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goanyapi-update-'));
  const cacheFile = join(directory, 'update.json');
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return Response.json({ latest: '1.0.0', next: '0.0.1-next.2' });
  };

  try {
    const first = await checkForUpdate({
      currentVersion: '0.0.1-next.1',
      cacheFile,
      fetch: fetcher,
      now: 1_000,
    });
    const second = await checkForUpdate({
      currentVersion: '0.0.1-next.1',
      cacheFile,
      fetch: fetcher,
      now: 2_000,
    });
    const beforeExpiry = await checkForUpdate({
      currentVersion: '0.0.1-next.1',
      cacheFile,
      fetch: fetcher,
      now: 3_600_999,
    });
    const afterExpiry = await checkForUpdate({
      currentVersion: '0.0.1-next.1',
      cacheFile,
      fetch: fetcher,
      now: 3_601_000,
    });

    assert.equal(calls, 2);
    assert.deepEqual(second, first);
    assert.deepEqual(beforeExpiry, first);
    assert.deepEqual(afterExpiry, first);
    assert.equal(first?.latestVersion, '0.0.1-next.2');
    assert.equal(first?.installCommand, 'npm install -g @goanyapi/cli@next');
    assert.match(renderUpdateNotice(first!), /0\.0\.1-next\.2/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('retries a failed registry check after five minutes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goanyapi-update-'));
  const cacheFile = join(directory, 'update.json');
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response(null, { status: 503 })
      : Response.json({ latest: '0.0.2' });
  };

  try {
    const failed = await checkForUpdate({
      currentVersion: '0.0.1',
      cacheFile,
      fetch: fetcher,
      now: 1_000,
    });
    const cachedFailure = await checkForUpdate({
      currentVersion: '0.0.1',
      cacheFile,
      fetch: fetcher,
      now: 300_999,
    });
    const retried = await checkForUpdate({
      currentVersion: '0.0.1',
      cacheFile,
      fetch: fetcher,
      now: 301_000,
    });

    assert.equal(failed, null);
    assert.equal(cachedFailure, null);
    assert.equal(calls, 2);
    assert.equal(retried?.latestVersion, '0.0.2');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
