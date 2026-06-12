import { spawn } from 'node:child_process';

const child = spawn('electron-vite', ['dev'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
