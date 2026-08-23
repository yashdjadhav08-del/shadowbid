/**
 * Compiles the ShadowBid Compact contract into managed/shadowbid.
 * Uses the `compact` toolchain manager (https://github.com/midnightntwrk/compact).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';

const candidates =
  process.platform === 'win32'
    ? [
        join(process.env.USERPROFILE ?? '', '.local', 'bin', 'compact.exe'),
        join(process.env.USERPROFILE ?? '', '.compact', 'bin', 'compact.exe'),
      ]
    : [
        join(process.env.HOME ?? '', '.local', 'bin', 'compact'),
        join(process.env.HOME ?? '', '.compact', 'bin', 'compact'),
      ];

const compactBin = candidates.find((p) => existsSync(p)) ?? 'compact';

const result = spawnSync(
  compactBin,
  ['compile', 'contracts/shadowbid.compact', 'managed/shadowbid'],
  { cwd: root, stdio: 'inherit' },
);

if (result.error || result.status !== 0) {
  console.error(
    '\n[compile-contract] Failed. Install the Compact toolchain first:\n' +
      '  curl --proto \'=https\' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh\n',
  );
  process.exit(result.status ?? 1);
}
