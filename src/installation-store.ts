import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const CLIENT_INSTANCE_ID_PATTERN = /^gai_[A-Za-z0-9_-]{32}$/;

type InstallationState = {
  version: 1;
  clientInstanceId: string;
  createdAt: string;
};

export interface InstallationStore {
  loadOrCreate(): Promise<string>;
}

export class InstallationStoreError extends Error {}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function parseInstallation(value: string): InstallationState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new InstallationStoreError(
      'The saved GoAnyAPI CLI installation identity is invalid.'
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new InstallationStoreError(
      'The saved GoAnyAPI CLI installation identity is invalid.'
    );
  }
  const record = parsed as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.clientInstanceId !== 'string' ||
    !CLIENT_INSTANCE_ID_PATTERN.test(record.clientInstanceId) ||
    typeof record.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(record.createdAt))
  ) {
    throw new InstallationStoreError(
      'The saved GoAnyAPI CLI installation identity is invalid.'
    );
  }
  return record as InstallationState;
}

export function resolveInstallationFile(options: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
} = {}): string {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homeDirectory = options.homeDirectory ?? homedir();

  if (platform === 'win32') {
    return join(
      env.LOCALAPPDATA || join(homeDirectory, 'AppData', 'Local'),
      'GoAnyAPI',
      'installation.json'
    );
  }
  if (platform === 'darwin') {
    return join(
      homeDirectory,
      'Library',
      'Application Support',
      'GoAnyAPI',
      'installation.json'
    );
  }
  return join(
    env.XDG_CONFIG_HOME || join(homeDirectory, '.config'),
    'goanyapi',
    'installation.json'
  );
}

export function createSystemInstallationStore(options: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  now?: () => Date;
  generateId?: () => string;
} = {}): InstallationStore {
  const file = resolveInstallationFile(options);
  const now = options.now ?? (() => new Date());
  const generateId =
    options.generateId ??
    (() => 'gai_' + randomBytes(24).toString('base64url'));

  const read = async () => parseInstallation(await readFile(file, 'utf8'));

  return {
    async loadOrCreate() {
      try {
        return (await read()).clientInstanceId;
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error;
      }

      const state: InstallationState = {
        version: 1,
        clientInstanceId: generateId(),
        createdAt: now().toISOString(),
      };
      if (!CLIENT_INSTANCE_ID_PATTERN.test(state.clientInstanceId)) {
        throw new InstallationStoreError(
          'Unable to generate a valid GoAnyAPI CLI installation identity.'
        );
      }

      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      try {
        await writeFile(file, JSON.stringify(state) + '\n', {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        });
        return state.clientInstanceId;
      } catch (error) {
        if (errorCode(error) === 'EEXIST') {
          return (await read()).clientInstanceId;
        }
        throw new InstallationStoreError(
          'Unable to save the GoAnyAPI CLI installation identity.'
        );
      }
    },
  };
}
