import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const services = [
  {
    name: 'api',
    cwd: resolve(root, 'apps/api'),
    cmd: 'npx',
    args: ['tsx', 'watch', 'src/index.ts'],
    env: { PORT: '5001' },
    color: '\x1b[36m',
  },
  {
    name: 'runner',
    cwd: resolve(root, 'apps/runner-gateway'),
    cmd: 'npx',
    args: ['tsx', 'watch', 'src/index.ts'],
    env: { PORT: '5002' },
    color: '\x1b[33m',
  },
  {
    name: 'web',
    cwd: resolve(root, 'apps/web'),
    cmd: 'npx',
    args: ['next', 'dev', '-p', '5000'],
    env: { NEXT_PUBLIC_API_URL: 'http://localhost:5001' },
    color: '\x1b[35m',
  },
];

const reset = '\x1b[0m';
const children = [];

for (const svc of services) {
  const child = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    env: { ...process.env, ...svc.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  const prefix = `${svc.color}[${svc.name}]${reset}`;

  child.stdout.on('data', (data) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      console.log(`${prefix} ${line}`);
    }
  });

  child.stderr.on('data', (data) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      console.error(`${prefix} ${line}`);
    }
  });

  child.on('exit', (code) => {
    console.log(`${prefix} exited with code ${code}`);
  });

  children.push(child);
  console.log(`${prefix} started (pid ${child.pid})`);
}

function cleanup() {
  for (const child of children) {
    child.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
