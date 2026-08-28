import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('[start-dev] Starting Live Sync Server on port 5176...');
const serverProc = spawn('node', ['server/liveServer.mjs'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

console.log('[start-dev] Starting Vite dev server...');
const viteProc = spawn('npx', ['vite'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

process.on('SIGINT', () => {
  serverProc.kill();
  viteProc.kill();
  process.exit();
});
