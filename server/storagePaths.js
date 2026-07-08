import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const APP_NAME = 'Prompt Vault';
export const DATABASE_FILE_NAME = 'prompt-vault.sqlite';

export function getUserDataPath(env = process.env, platform = process.platform, homeDir = os.homedir()) {
  if (env.PROMPT_VAULT_DATA_DIR) {
    return env.PROMPT_VAULT_DATA_DIR;
  }

  if (platform === 'win32') {
    return path.join(env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), APP_NAME);
  }

  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', APP_NAME);
  }

  return path.join(env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share'), 'prompt-vault');
}

export function getSharedDatabasePath(options = {}) {
  return path.join(
    options.userDataPath || getUserDataPath(options.env, options.platform, options.homeDir),
    DATABASE_FILE_NAME
  );
}

export function getProjectDatabasePath(appRoot = process.cwd()) {
  return path.join(appRoot, 'data', DATABASE_FILE_NAME);
}

export function copyDatabaseIfMissing({ source, target }) {
  if (fs.existsSync(target)) {
    return target;
  }

  if (!fs.existsSync(source)) {
    return target;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const sourceFile = `${source}${suffix}`;
    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, `${target}${suffix}`);
    }
  }

  return target;
}

export function prepareSharedDatabase(options = {}) {
  const target = options.target || getSharedDatabasePath(options);
  const source = options.source || getProjectDatabasePath(options.appRoot || process.cwd());
  return copyDatabaseIfMissing({ source, target });
}
