import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  CLIENT_INSTANCE_ID_PATTERN,
  createSystemInstallationStore,
  InstallationStoreError,
  resolveInstallationFile,
} from '../src/installation-store.js';

test('creates one persistent installation identity and reuses it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goanyapi-installation-'));
  try {
    const options = {
      platform: 'linux' as const,
      env: { XDG_CONFIG_HOME: directory },
      homeDirectory: directory,
      now: () => new Date('2026-08-31T08:00:00.000Z'),
    };
    const first = await createSystemInstallationStore(options).loadOrCreate();
    const second = await createSystemInstallationStore(options).loadOrCreate();

    assert.match(first, CLIENT_INSTANCE_ID_PATTERN);
    assert.equal(second, first);
    const saved = JSON.parse(
      await readFile(resolveInstallationFile(options), 'utf8')
    ) as Record<string, unknown>;
    assert.equal(saved.clientInstanceId, first);
    assert.equal(saved.createdAt, '2026-08-31T08:00:00.000Z');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('concurrent creation converges on the identity saved first', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goanyapi-installation-'));
  try {
    let counter = 0;
    const store = createSystemInstallationStore({
      platform: 'linux',
      env: { XDG_CONFIG_HOME: directory },
      homeDirectory: directory,
      generateId: () =>
        'gai_' + String(++counter).padStart(32, 'A').slice(-32),
    });
    const [first, second] = await Promise.all([
      store.loadOrCreate(),
      store.loadOrCreate(),
    ]);
    assert.equal(first, second);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects a corrupted installation identity instead of replacing it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goanyapi-installation-'));
  const options = {
    platform: 'linux' as const,
    env: { XDG_CONFIG_HOME: directory },
    homeDirectory: directory,
  };
  try {
    const file = resolveInstallationFile(options);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, '{"clientInstanceId":"broken"}', 'utf8');
    await assert.rejects(
      () => createSystemInstallationStore(options).loadOrCreate(),
      InstallationStoreError
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
