import { spawn } from 'node:child_process';
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  inspectForUpdate,
  resolveUpdateCacheFile,
  type UpdateInfo,
} from './update-check.js';

const INSTALL_FAILURE_BACKOFF_MS = 15 * 60 * 1000;
const INSTALL_TIMEOUT_MS = 60_000;
const LOCK_STALE_MS = 10 * 60 * 1000;
const MAX_COMMAND_OUTPUT = 4_000;

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface UpdateCommandResult {
  ok: boolean;
  message?: string;
}

export type UpdateCommandRunner = (
  command: string,
  args: string[],
  timeoutMs: number
) => Promise<UpdateCommandResult>;

export interface CliUpdateOptions {
  currentVersion: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: number;
  checkTimeoutMs?: number;
  installTimeoutMs?: number;
  cacheFile?: string;
  stateFile?: string;
  lockFile?: string;
  executablePath?: string;
  runCommand?: UpdateCommandRunner;
  checkOnly?: boolean;
  force?: boolean;
  automatic?: boolean;
}

export type CliUpdateStatus =
  | 'up_to_date'
  | 'check_failed'
  | 'available'
  | 'updated'
  | 'install_failed'
  | 'busy'
  | 'deferred';

export interface CliUpdateResult {
  status: CliUpdateStatus;
  currentVersion: string;
  latestVersion: string | null;
  update?: UpdateInfo;
  packageManager?: PackageManager;
  message?: string;
}

interface InstallState {
  installedVersion?: string;
  installedAt?: number;
  failedVersion?: string;
  failedAt?: number;
}

function enabledManager(value: string | undefined): PackageManager | null {
  return value === 'npm' ||
    value === 'pnpm' ||
    value === 'yarn' ||
    value === 'bun'
    ? value
    : null;
}

function pathStartsWith(path: string, parent: string | undefined): boolean {
  if (!parent) return false;
  const normalizedPath = resolve(path).toLowerCase();
  const normalizedParent = resolve(parent).toLowerCase();
  return normalizedPath === normalizedParent ||
    normalizedPath.startsWith(normalizedParent + '\\') ||
    normalizedPath.startsWith(normalizedParent + '/');
}

export function detectPackageManager(options: {
  env?: NodeJS.ProcessEnv;
  executablePath?: string;
} = {}): PackageManager {
  const env = options.env ?? process.env;
  const override = enabledManager(
    env.GOANYAPI_PACKAGE_MANAGER?.trim().toLowerCase()
  );
  if (override) return override;

  const userAgent = env.npm_config_user_agent?.toLowerCase() ?? '';
  for (const manager of ['pnpm', 'yarn', 'bun', 'npm'] as const) {
    if (userAgent.startsWith(manager + '/')) return manager;
  }

  const executablePath = options.executablePath ?? process.argv[1] ?? '';
  if (pathStartsWith(executablePath, env.PNPM_HOME)) return 'pnpm';
  if (pathStartsWith(executablePath, env.BUN_INSTALL)) return 'bun';

  const normalized = executablePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/.pnpm/') || normalized.includes('/pnpm/')) {
    return 'pnpm';
  }
  if (normalized.includes('/.bun/') || normalized.includes('/bun/')) {
    return 'bun';
  }
  if (normalized.includes('/yarn/')) return 'yarn';
  return 'npm';
}

export function packageManagerInstallCommand(
  manager: PackageManager,
  channel: 'latest' | 'next'
) {
  const packageSpec = `@goanyapi/cli@${channel}`;
  if (manager === 'pnpm') return { command: 'pnpm', args: ['add', '--global', packageSpec] };
  if (manager === 'yarn') return { command: 'yarn', args: ['global', 'add', packageSpec] };
  if (manager === 'bun') return { command: 'bun', args: ['add', '--global', packageSpec] };
  return { command: 'npm', args: ['install', '--global', packageSpec] };
}

function conciseFailure(output: string, fallback: string) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? fallback;
}

export const runUpdateCommand: UpdateCommandRunner = (
  command,
  args,
  timeoutMs
) => new Promise((resolveResult) => {
  let settled = false;
  let output = '';
  const finish = (result: UpdateCommandResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolveResult(result);
  };
  const child = spawn(command, args, {
    windowsHide: true,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const append = (chunk: Buffer | string) => {
    output = (output + chunk.toString()).slice(-MAX_COMMAND_OUTPUT);
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  child.once('error', (error) => finish({ ok: false, message: error.message }));
  child.once('exit', (code) => finish(
    code === 0
      ? { ok: true }
      : {
          ok: false,
          message: conciseFailure(
            output,
            `Package manager exited with code ${code ?? 'unknown'}.`
          ),
        }
  ));
  const timer = setTimeout(() => {
    child.kill();
    finish({ ok: false, message: `Package manager timed out after ${timeoutMs}ms.` });
  }, timeoutMs);
});

async function readInstallState(stateFile: string): Promise<InstallState> {
  try {
    const value = JSON.parse(await readFile(stateFile, 'utf8')) as InstallState;
    return typeof value === 'object' && value !== null ? value : {};
  } catch {
    return {};
  }
}

async function writeInstallState(stateFile: string, state: InstallState) {
  try {
    await mkdir(dirname(stateFile), { recursive: true });
    await writeFile(stateFile, JSON.stringify(state), {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch {
    // Update state is advisory and must never block CLI commands.
  }
}

async function acquireUpdateLock(lockFile: string, now: number) {
  await mkdir(dirname(lockFile), { recursive: true });

  const tryCreate = async () => {
    const handle = await open(lockFile, 'wx', 0o600);
    await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: now }));
    return async () => {
      await handle.close().catch(() => undefined);
      await unlink(lockFile).catch(() => undefined);
    };
  };

  try {
    return await tryCreate();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }

  try {
    const lock = JSON.parse(await readFile(lockFile, 'utf8')) as { createdAt?: number };
    if (
      typeof lock.createdAt === 'number' &&
      now - lock.createdAt >= LOCK_STALE_MS
    ) {
      await unlink(lockFile);
      return await tryCreate();
    }
  } catch {
    // A malformed or concurrently removed lock is treated as busy.
  }
  return null;
}

export async function updateCli(
  options: CliUpdateOptions
): Promise<CliUpdateResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();
  const cacheFile = options.cacheFile ?? resolveUpdateCacheFile(env);
  const stateFile = options.stateFile ?? join(dirname(cacheFile), 'cli-update-state.json');
  const lockFile = options.lockFile ?? join(dirname(cacheFile), 'cli-update.lock');
  const inspection = await inspectForUpdate({
    currentVersion: options.currentVersion,
    env,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    now,
    ...(options.checkTimeoutMs !== undefined
      ? { timeoutMs: options.checkTimeoutMs }
      : {}),
    cacheFile,
    ...(options.force !== undefined ? { force: options.force } : {}),
  });

  if (inspection.status === 'failed') {
    return {
      status: 'check_failed',
      currentVersion: options.currentVersion,
      latestVersion: null,
      message: 'Could not query the npm registry.',
    };
  }
  if (inspection.status === 'up_to_date' || !inspection.update) {
    return {
      status: 'up_to_date',
      currentVersion: options.currentVersion,
      latestVersion: inspection.latestVersion,
    };
  }
  if (options.checkOnly) {
    return {
      status: 'available',
      currentVersion: options.currentVersion,
      latestVersion: inspection.latestVersion,
      update: inspection.update,
    };
  }

  let state = await readInstallState(stateFile);
  if (
    options.automatic &&
    state.failedVersion === inspection.update.latestVersion &&
    typeof state.failedAt === 'number' &&
    now - state.failedAt >= 0 &&
    now - state.failedAt < INSTALL_FAILURE_BACKOFF_MS
  ) {
    return {
      status: 'deferred',
      currentVersion: options.currentVersion,
      latestVersion: inspection.latestVersion,
      update: inspection.update,
    };
  }

  const releaseLock = await acquireUpdateLock(lockFile, now).catch(() => null);
  if (!releaseLock) {
    return {
      status: 'busy',
      currentVersion: options.currentVersion,
      latestVersion: inspection.latestVersion,
      update: inspection.update,
    };
  }

  try {
    state = await readInstallState(stateFile);
    if (
      state.installedVersion === inspection.update.latestVersion &&
      typeof state.installedAt === 'number' &&
      now - state.installedAt >= 0 &&
      now - state.installedAt < LOCK_STALE_MS
    ) {
      return {
        status: 'busy',
        currentVersion: options.currentVersion,
        latestVersion: inspection.latestVersion,
        update: inspection.update,
      };
    }

    const packageManager = detectPackageManager({
      env,
      ...(options.executablePath
        ? { executablePath: options.executablePath }
        : {}),
    });
    const install = packageManagerInstallCommand(
      packageManager,
      inspection.update.channel
    );
    let result: UpdateCommandResult;
    try {
      result = await (options.runCommand ?? runUpdateCommand)(
        install.command,
        install.args,
        options.installTimeoutMs ?? INSTALL_TIMEOUT_MS
      );
    } catch (error) {
      result = {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Package manager update failed.',
      };
    }
    if (!result.ok) {
      await writeInstallState(stateFile, {
        ...state,
        failedVersion: inspection.update.latestVersion,
        failedAt: now,
      });
      return {
        status: 'install_failed',
        currentVersion: options.currentVersion,
        latestVersion: inspection.latestVersion,
        update: inspection.update,
        packageManager,
        message: result.message ?? 'Package manager update failed.',
      };
    }

    await writeInstallState(stateFile, {
      installedVersion: inspection.update.latestVersion,
      installedAt: now,
    });
    return {
      status: 'updated',
      currentVersion: options.currentVersion,
      latestVersion: inspection.latestVersion,
      update: inspection.update,
      packageManager,
    };
  } finally {
    await releaseLock();
  }
}

export function renderAutomaticUpdate(result: CliUpdateResult): string | null {
  if (result.status === 'updated' && result.latestVersion) {
    return `GoAnyAPI CLI auto-updated: v${result.currentVersion} -> v${result.latestVersion} (active next run)\n`;
  }
  if (result.status === 'install_failed') {
    return `Warning: auto-update failed; continuing with v${result.currentVersion}. ${result.message ?? ''}`.trimEnd() + '\n';
  }
  if (result.status === 'check_failed') {
    return `Warning: update check failed; continuing with v${result.currentVersion}.\n`;
  }
  return null;
}
