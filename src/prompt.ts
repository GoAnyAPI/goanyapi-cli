import { createInterface } from 'node:readline';

type MutableReadLine = ReturnType<typeof createInterface> & {
  _writeToOutput?: (value: string) => void;
};

export function promptSecret(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(
      new Error(
        'Interactive input requires a TTY. Set GOANYAPI_API_KEY and run auth set-key again.'
      )
    );
  }

  return new Promise((resolve, reject) => {
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    }) as MutableReadLine;
    process.stdout.write(label);
    readline._writeToOutput = () => {};
    readline.question('', (answer) => {
      process.stdout.write('\n');
      readline.close();
      resolve(answer.trim());
    });
    readline.once('SIGINT', () => {
      process.stdout.write('\n');
      readline.close();
      reject(new Error('Input cancelled.'));
    });
  });
}

