// Dev launcher: on Linux, prepend the vendored CUDA libs (.cuda-libs) to
// LD_LIBRARY_PATH so node-llama-cpp's CUDA prebuilt can load, then run
// electron-vite dev. On other platforms (or when libs are absent) it just runs
// electron-vite dev unchanged — node-llama-cpp falls back to CPU.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const env = { ...process.env };
const libs = join(process.cwd(), '.cuda-libs');
if (process.platform === 'linux' && existsSync(libs)) {
  env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH ? `${libs}:${env.LD_LIBRARY_PATH}` : libs;
}

const child = spawn('electron-vite', ['dev'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
