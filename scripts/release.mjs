import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packageMetadata = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
const dryRun = process.argv.includes('--dry-run');

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: new URL('..', import.meta.url),
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(
  `Preparing ${packageMetadata.name}@${packageMetadata.version} for npm release.`
);

run('pnpm', ['check']);
run('npm', ['pack', '--dry-run']);

if (dryRun) {
  console.log('\nDry run completed. Nothing was published.');
  process.exit(0);
}

run('npm', ['publish', '--access', 'public']);
console.log(
  `\nPublished ${packageMetadata.name}@${packageMetadata.version} successfully.`
);
