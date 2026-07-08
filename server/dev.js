import { spawn } from 'node:child_process';
import { buildDevProcessSpecs } from './devProcesses.js';

const processes = buildDevProcessSpecs().map((spec) =>
  spawn(spec.command, spec.args, { stdio: 'inherit' })
);

function shutdown(code = 0) {
  for (const child of processes) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

processes.forEach((child) => {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
