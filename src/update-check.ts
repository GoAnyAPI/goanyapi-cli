import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const REGISTRY_DIST_TAGS_URL =
  'https://registry.npmjs.org/-/package/%40goanyapi%2Fcli/dist-tags';
const SUCCESS_CACHE_TTL_MS = 60 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 3_000;

export type ReleaseChannel = 'latest' | 'next';

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  channel: ReleaseChannel;
  installCommand: string;
}

interface UpdateCache {
  channel: ReleaseChannel;
  checkedAt: number;
  latestVersion: string | null;
}

interface ParsedVersion {
  core: [number, number, number];
  prerelease: string[];
}

export interface UpdateCheckOptions {
  currentVersion: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: number;
  timeoutMs?: number;
  cacheFile?: string;
}

function parseVersion(version: string): ParsedVersion | null {
  const match = version.match(
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/
  );
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split('.') ?? [],
  };
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0) return right.length === 0 ? 0 : 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      return Number(leftPart) > Number(rightPart) ? 1 : -1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateVersion = parseVersion(candidate);
  const currentVersion = parseVersion(current);
  if (!candidateVersion || !currentVersion) return false;

  for (let index = 0; index < 3; index += 1) {
    const candidatePart = candidateVersion.core[index] ?? 0;
    const currentPart = currentVersion.core[index] ?? 0;
    if (candidatePart !== currentPart) return candidatePart > currentPart;
  }
  return (
    comparePrerelease(candidateVersion.prerelease, currentVersion.prerelease) > 0
  );
}

export function releaseChannelForVersion(version: string): ReleaseChannel {
  const prerelease = version.split('-', 2)[1];
  return prerelease === 'next' || prerelease?.startsWith('next.') === true
    ? 'next'
    : 'latest';
}

function flagEnabled(value: string | undefined): boolean {
  return Boolean(value && !['0', 'false', 'no'].includes(value.toLowerCase()));
}

export function shouldCheckForUpdates(
  env: NodeJS.ProcessEnv,
  interactive: boolean
): boolean {
  return (
    interactive &&
    !flagEnabled(env.CI) &&
    !flagEnabled(env.GOANYAPI_NO_UPDATE_CHECK)
  );
}

function defaultCacheFile(env: NodeJS.ProcessEnv): string {
  if (process.platform === 'win32') {
    return join(env.LOCALAPPDATA || homedir(), 'GoAnyAPI', 'cli-update.json');
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Caches', 'GoAnyAPI', 'cli-update.json');
  }
  return join(
    env.XDG_CACHE_HOME || join(homedir(), '.cache'),
    'goanyapi',
    'cli-update.json'
  );
}

async function readCache(cacheFile: string): Promise<UpdateCache | null> {
  try {
    const value = JSON.parse(await readFile(cacheFile, 'utf8')) as UpdateCache;
    if (
      (value.channel === 'latest' || value.channel === 'next') &&
      Number.isFinite(value.checkedAt) &&
      (typeof value.latestVersion === 'string' || value.latestVersion === null)
    ) {
      return value;
    }
  } catch {
    // Missing or invalid cache files are treated as a cache miss.
  }
  return null;
}

async function writeCache(cacheFile: string, value: UpdateCache): Promise<void> {
  try {
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(value), {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch {
    // An unwritable cache must never prevent the CLI command from running.
  }
}

function updateInfo(
  currentVersion: string,
  latestVersion: string | null,
  channel: ReleaseChannel
): UpdateInfo | null {
  if (!latestVersion || !isNewerVersion(latestVersion, currentVersion)) {
    return null;
  }
  return {
    currentVersion,
    latestVersion,
    channel,
    installCommand:
      'npm install -g @goanyapi/cli' + (channel === 'next' ? '@next' : ''),
  };
}

export async function checkForUpdate(
  options: UpdateCheckOptions
): Promise<UpdateInfo | null> {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();
  const channel = releaseChannelForVersion(options.currentVersion);
  const cacheFile = options.cacheFile ?? defaultCacheFile(env);
  const cached = await readCache(cacheFile);
  if (cached?.channel === channel) {
    const ttl = cached.latestVersion
      ? SUCCESS_CACHE_TTL_MS
      : FAILURE_CACHE_TTL_MS;
    if (now - cached.checkedAt >= 0 && now - cached.checkedAt < ttl) {
      return updateInfo(options.currentVersion, cached.latestVersion, channel);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  let latestVersion: string | null = null;
  try {
    const response = await (options.fetch ?? globalThis.fetch)(
      REGISTRY_DIST_TAGS_URL,
      {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      }
    );
    if (response.ok) {
      const tags = (await response.json()) as Record<string, unknown>;
      const value = tags[channel];
      latestVersion = typeof value === 'string' ? value : null;
    }
  } catch {
    latestVersion = null;
  } finally {
    clearTimeout(timeout);
  }

  await writeCache(cacheFile, { channel, checkedAt: now, latestVersion });
  return updateInfo(options.currentVersion, latestVersion, channel);
}

export function renderUpdateNotice(info: UpdateInfo): string {
  return [
    '',
    `Update available: ${info.currentVersion} -> ${info.latestVersion}`,
    `Run: ${info.installCommand}`,
    '',
  ].join('\n');
}
