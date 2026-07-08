import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4317);
const baseUrl = `http://${host}:${port}`;
const healthUrl = `${baseUrl}/api/health`;

let serverProcess;

async function main() {
  if (await isHealthy()) {
    openBrowser(baseUrl);
    console.log(`Prompt Vault is already running: ${baseUrl}`);
    return;
  }

  await ensureBuild();
  serverProcess = spawn(process.execPath, ['--experimental-sqlite', 'server/index.js', '--serve-static'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOST: host,
      PORT: String(port)
    },
    stdio: 'inherit'
  });

  serverProcess.on('exit', (code) => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });

  await waitForHealth();
  openBrowser(baseUrl);
  console.log(`Prompt Vault web is ready: ${baseUrl}`);
  console.log('Keep this window open while using the website. Press Ctrl+C to stop the local server.');
  process.stdin.resume();
}

async function ensureBuild() {
  if (fs.existsSync(path.join(projectRoot, 'dist', 'index.html'))) {
    return;
  }

  console.log('No production build found. Building Prompt Vault once...');
  await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit'
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function isHealthy() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await isHealthy()) {
      return;
    }
    await delay(500);
  }
  throw new Error(`Prompt Vault did not become ready at ${baseUrl}`);
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }

  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(command, [url], { detached: true, stdio: 'ignore' }).unref();
}

function shutdown() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((error) => {
  console.error(error);
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
  process.exit(1);
});
