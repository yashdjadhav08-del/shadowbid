/**
 * Copies compiled Compact contract artifacts into public/ so they are served
 * over HTTP:
 *   - /managed/shadowbid/keys/<id>.prover|.verifier   (FetchZkConfigProvider)
 *   - /managed/shadowbid/zkir/<id>.bzkir              (FetchZkConfigProvider ZKIR)
 *     plus <id>.zkir for tooling that wants the textual IR.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const src = join(root, 'managed', 'shadowbid');
const dest = join(root, 'public', 'managed', 'shadowbid');

if (!existsSync(src)) {
  console.error(
    '[sync-assets] managed/shadowbid not found. Run `npm run compile-contract` first.',
  );
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
for (const dir of ['keys', 'zkir']) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
console.log('[sync-assets] ZK artifacts synced to public/managed/shadowbid');
