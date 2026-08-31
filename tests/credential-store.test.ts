import assert from 'node:assert/strict';
import test from 'node:test';

import { createSystemCredentialStore } from '../src/credential-store.js';

test('Linux Secret Service treats a missing credential as signed out', async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const store = createSystemCredentialStore({
    platform: 'linux',
    runner: async (command, args) => {
      calls.push({ command, args });
      return { code: 1, stdout: '' };
    },
  });

  assert.equal(await store.load(), null);
  await store.clear();
  assert.deepEqual(
    calls.map((call) => call.args[0]),
    ['lookup', 'clear']
  );
});

test('Windows Credential Locker receives saved secrets through stdin', async () => {
  let receivedStdin = '';
  let receivedArgs: string[] = [];
  const store = createSystemCredentialStore({
    platform: 'win32',
    runner: async (_command, args, stdin) => {
      receivedArgs = args;
      receivedStdin = stdin ?? '';
      return { code: 0, stdout: '' };
    },
  });

  await store.save({ kind: 'api_key', apiKey: 'ga_secret' });
  assert.equal(receivedStdin, '{"kind":"api_key","apiKey":"ga_secret"}');
  assert.equal(receivedArgs.includes('ga_secret'), false);
});
