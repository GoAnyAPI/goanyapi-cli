import { spawn } from 'node:child_process';

const SERVICE = '@goanyapi/cli';
const ACCOUNT = 'default';

export type OAuthCredential = {
  kind: 'oauth';
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: 'api:invoke';
  resource: string;
  clientId: 'goanyapi-cli';
  issuer: string;
};

export type ApiKeyCredential = {
  kind: 'api_key';
  apiKey: string;
};

export type StoredCredential = OAuthCredential | ApiKeyCredential;

export interface CredentialStore {
  load(): Promise<StoredCredential | null>;
  save(credential: StoredCredential): Promise<void>;
  clear(): Promise<void>;
}

type CommandResult = { code: number; stdout: string };
type CommandRunner = (
  command: string,
  args: string[],
  stdin?: string
) => Promise<CommandResult>;

export class CredentialStoreError extends Error {}

async function runCommand(
  command: string,
  args: string[],
  stdin = ''
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout }));
    child.stdin.end(stdin);
  });
}

function parseCredential(value: string): StoredCredential {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new CredentialStoreError('The saved GoAnyAPI credential is invalid.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new CredentialStoreError('The saved GoAnyAPI credential is invalid.');
  }
  const record = parsed as Record<string, unknown>;
  if (record.kind === 'api_key' && typeof record.apiKey === 'string') {
    return { kind: 'api_key', apiKey: record.apiKey };
  }
  if (
    record.kind === 'oauth' &&
    typeof record.accessToken === 'string' &&
    typeof record.refreshToken === 'string' &&
    typeof record.expiresAt === 'number' &&
    record.scope === 'api:invoke' &&
    typeof record.resource === 'string' &&
    record.clientId === 'goanyapi-cli' &&
    typeof record.issuer === 'string'
  ) {
    return record as OAuthCredential;
  }
  throw new CredentialStoreError('The saved GoAnyAPI credential is invalid.');
}

function powershell(script: string): string[] {
  return ['-NoProfile', '-NonInteractive', '-Command', script];
}

function windowsStore(runner: CommandRunner): CredentialStore {
  const prefix =
    '[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime] > $null;' +
    '[Windows.Security.Credentials.PasswordCredential,Windows.Security.Credentials,ContentType=WindowsRuntime] > $null;' +
    `$vault=New-Object Windows.Security.Credentials.PasswordVault;`;

  return {
    async load() {
      const script =
        prefix +
        `try{$cred=$vault.Retrieve('${SERVICE}','${ACCOUNT}');$cred.RetrievePassword();[Console]::Out.Write($cred.Password)}catch{exit 3}`;
      const result = await runner('powershell.exe', powershell(script));
      if (result.code === 3) return null;
      if (result.code !== 0) {
        throw new CredentialStoreError('Unable to read Windows Credential Locker.');
      }
      return parseCredential(result.stdout);
    },
    async save(credential) {
      const script =
        prefix +
        `try{$old=$vault.Retrieve('${SERVICE}','${ACCOUNT}');$vault.Remove($old)}catch{};` +
        `$secret=[Console]::In.ReadToEnd();$cred=New-Object Windows.Security.Credentials.PasswordCredential('${SERVICE}','${ACCOUNT}',$secret);$vault.Add($cred)`;
      const result = await runner(
        'powershell.exe',
        powershell(script),
        JSON.stringify(credential)
      );
      if (result.code !== 0) {
        throw new CredentialStoreError('Unable to save to Windows Credential Locker.');
      }
    },
    async clear() {
      const script =
        prefix +
        `try{$cred=$vault.Retrieve('${SERVICE}','${ACCOUNT}');$vault.Remove($cred)}catch{}`;
      const result = await runner('powershell.exe', powershell(script));
      if (result.code !== 0) {
        throw new CredentialStoreError('Unable to clear Windows Credential Locker.');
      }
    },
  };
}

function macStore(runner: CommandRunner): CredentialStore {
  return {
    async load() {
      const result = await runner('security', [
        'find-generic-password',
        '-a',
        ACCOUNT,
        '-s',
        SERVICE,
        '-w',
      ]);
      if (result.code === 44) return null;
      if (result.code !== 0) {
        throw new CredentialStoreError('Unable to read macOS Keychain.');
      }
      return parseCredential(result.stdout.trim());
    },
    async save(credential) {
      const result = await runner('security', [
        'add-generic-password',
        '-U',
        '-a',
        ACCOUNT,
        '-s',
        SERVICE,
        '-w',
        JSON.stringify(credential),
      ]);
      if (result.code !== 0) {
        throw new CredentialStoreError('Unable to save to macOS Keychain.');
      }
    },
    async clear() {
      const result = await runner('security', [
        'delete-generic-password',
        '-a',
        ACCOUNT,
        '-s',
        SERVICE,
      ]);
      if (result.code !== 0 && result.code !== 44) {
        throw new CredentialStoreError('Unable to clear macOS Keychain.');
      }
    },
  };
}

function linuxStore(runner: CommandRunner): CredentialStore {
  const unavailable =
    'Secret Service is unavailable. Install secret-tool/libsecret, or use GOANYAPI_API_KEY.';
  return {
    async load() {
      let result: CommandResult;
      try {
        result = await runner('secret-tool', [
          'lookup',
          'service',
          SERVICE,
          'account',
          ACCOUNT,
        ]);
      } catch {
        throw new CredentialStoreError(unavailable);
      }
      if (result.code === 1) return null;
      if (result.code !== 0) throw new CredentialStoreError(unavailable);
      if (!result.stdout.trim()) return null;
      return parseCredential(result.stdout.trim());
    },
    async save(credential) {
      let result: CommandResult;
      try {
        result = await runner(
          'secret-tool',
          [
            'store',
            '--label=GoAnyAPI CLI',
            'service',
            SERVICE,
            'account',
            ACCOUNT,
          ],
          JSON.stringify(credential)
        );
      } catch {
        throw new CredentialStoreError(unavailable);
      }
      if (result.code !== 0) throw new CredentialStoreError(unavailable);
    },
    async clear() {
      let result: CommandResult;
      try {
        result = await runner('secret-tool', [
          'clear',
          'service',
          SERVICE,
          'account',
          ACCOUNT,
        ]);
      } catch {
        throw new CredentialStoreError(unavailable);
      }
      if (result.code !== 0 && result.code !== 1) {
        throw new CredentialStoreError(unavailable);
      }
    },
  };
}

export function createSystemCredentialStore(options: {
  platform?: NodeJS.Platform;
  runner?: CommandRunner;
} = {}): CredentialStore {
  const platform = options.platform ?? process.platform;
  const runner = options.runner ?? runCommand;
  if (platform === 'win32') return windowsStore(runner);
  if (platform === 'darwin') return macStore(runner);
  return linuxStore(runner);
}
