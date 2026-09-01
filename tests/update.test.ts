import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  detectPackageManager,
  packageManagerInstallCommand,
  renderAutomaticUpdate,
  updateCli,
  type UpdateCommandRunner,
} from '../src/update.js';

test('detects supported global package managers and builds safe commands', () => {
  assert.equal(
    detectPackageManager({ env: { GOANYAPI_PACKAGE_MANAGER: 'pnpm' } }),
    'pnpm'
  );
  assert.equal(
    detectPackageManager({
      env: { PNPM_HOME: '/opt/pnpm' },
      executablePath: '/opt/pnpm/global/5/node_modules/@goanyapi/cli/dist/bin.js',
    }),
    'pnpm'
  );
  assert.deepEqual(packageManagerInstallCommand('npm', 'latest'), {
    command: 'npm',
    args: ['install', '--global', '@goanyapi/cli@latest'],
  });
  assert.deepEqual(packageManagerInstallCommand('yarn', 'next'), {
    command: 'yarn',
    args: ['global', 'add', '@goanyapi/cli@next'],
  });
  assert.deepEqual(packageManagerInstallCommand('bun', 'latest'), {
    command: 'bun',
    args: ['add', '--global', '@goanyapi/cli@latest'],
  });
});

test('installs an available update once and leaves the current process running', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goanyapi-auto-update-'));
  const cacheFile = join(directory, 'check.json');
  const stateFile = join(directory, 'state.json');
  const lockFile = join(directory, 'update.lock');
  const calls: Array<{ command: string; args: string[]; timeoutMs: number }> = [];
  const runner: UpdateCommandRunner = async (command, args, timeoutMs) => {
    calls.push({ command, args, timeoutMs });
    return { ok: true };
  };

  try {
    const first = await updateCli({
      currentVersion: '0.0.5',
      env: { GOANYAPI_PACKAGE_MANAGER: 'pnpm' },
      fetch: async () => Response.json({ latest: '0.0.6' }),
      now: 1_000,
      cacheFile,
      stateFile,
      lockFile,
      automatic: true,
      runCommand: runner,
    });
    const concurrentOldProcess = await updateCli({
      currentVersion: '0.0.5',
      env: { GOANYAPI_PACKAGE_MANAGER: 'pnpm' },
      fetch: async () => Response.json({ latest: '0.0.6' }),
      now: 2_000,
      cacheFile,
      stateFile,
      lockFile,
      automatic: true,
      runCommand: runner,
    });

    assert.equal(first.status, 'updated');
    assert.equal(concurrentOldProcess.status, 'busy');
    assert.deepEqual(calls, [{
      command: 'pnpm',
      args: ['add', '--global', '@goanyapi/cli@latest'],
      timeoutMs: 60_000,
    }]);
    assert.match(renderAutomaticUpdate(first) ?? '', /active next run/);
    await assert.rejects(access(lockFile));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('backs off after an automatic install failure and remains fail-open', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goanyapi-auto-update-'));
  const cacheFile = join(directory, 'check.json');
  const stateFile = join(directory, 'state.json');
  const lockFile = join(directory, 'update.lock');
  let calls = 0;
  const runner: UpdateCommandRunner = async () => {
    calls += 1;
    return { ok: false, message: 'EACCES' };
  };

  try {
    const failed = await updateCli({
      currentVersion: '0.0.5',
      fetch: async () => Response.json({ latest: '0.0.6' }),
      now: 1_000,
      cacheFile,
      stateFile,
      lockFile,
      automatic: true,
      runCommand: runner,
    });
    const deferred = await updateCli({
      currentVersion: '0.0.5',
      fetch: async () => Response.json({ latest: '0.0.6' }),
      now: 2_000,
      cacheFile,
      stateFile,
      lockFile,
      automatic: true,
      runCommand: runner,
    });

    assert.equal(failed.status, 'install_failed');
    assert.equal(failed.message, 'EACCES');
    assert.match(renderAutomaticUpdate(failed) ?? '', /continuing with v0\.0\.5/);
    assert.equal(deferred.status, 'deferred');
    assert.equal(calls, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('does not install while another process owns the update lock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goanyapi-auto-update-'));
  const cacheFile = join(directory, 'check.json');
  const lockFile = join(directory, 'update.lock');
  await mkdir(directory, { recursive: true });
  await writeFile(lockFile, JSON.stringify({ pid: 123, createdAt: 1_000 }));
  let installed = false;

  try {
    const result = await updateCli({
      currentVersion: '0.0.5',
      fetch: async () => Response.json({ latest: '0.0.6' }),
      now: 2_000,
      cacheFile,
      lockFile,
      automatic: true,
      runCommand: async () => {
        installed = true;
        return { ok: true };
      },
    });

    assert.equal(result.status, 'busy');
    assert.equal(installed, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('manual check reports an update without installing it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goanyapi-update-check-'));
  let installed = false;
  try {
    const result = await updateCli({
      currentVersion: '0.0.5',
      fetch: async () => Response.json({ latest: '0.0.6' }),
      cacheFile: join(directory, 'check.json'),
      force: true,
      checkOnly: true,
      runCommand: async () => {
        installed = true;
        return { ok: true };
      },
    });

    assert.equal(result.status, 'available');
    assert.equal(result.latestVersion, '0.0.6');
    assert.equal(installed, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('converts a thrown package-manager error into a fail-open result', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'goanyapi-auto-update-'));
  try {
    const result = await updateCli({
      currentVersion: '0.0.5',
      fetch: async () => Response.json({ latest: '0.0.6' }),
      cacheFile: join(directory, 'check.json'),
      stateFile: join(directory, 'state.json'),
      lockFile: join(directory, 'update.lock'),
      automatic: true,
      runCommand: async () => {
        throw new Error('spawn failed');
      },
    });

    assert.equal(result.status, 'install_failed');
    assert.equal(result.message, 'spawn failed');
    assert.match(renderAutomaticUpdate(result) ?? '', /continuing with v0\.0\.5/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
