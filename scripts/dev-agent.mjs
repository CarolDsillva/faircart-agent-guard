// Runs the Agent Guard API (port 8787) and the web console (port 5173) together.
import { spawn } from 'node:child_process';

const procs = [
  spawn('npm run dev -w @faircart/server', { stdio: ['ignore', 'inherit', 'inherit'], shell: true, env: { ...process.env, PORT: '8787' } }),
  spawn('npm run dev -w @faircart/web', { stdio: ['ignore', 'inherit', 'inherit'], shell: true, env: { ...process.env, PORT: '5173' } }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => code && process.exit(code)));
