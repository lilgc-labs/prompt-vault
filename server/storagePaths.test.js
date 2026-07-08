import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  copyDatabaseIfMissing,
  DATABASE_FILE_NAME,
  getProjectDatabasePath,
  getSharedDatabasePath,
  getUserDataPath
} from './storagePaths.js';

describe('storage paths', () => {
  it('uses the shared Prompt Vault app data directory on Windows', () => {
    const appData = path.join('C:\\Users\\qa', 'AppData', 'Roaming');

    expect(getUserDataPath({ APPDATA: appData }, 'win32', 'C:\\Users\\qa')).toBe(
      path.join(appData, 'Prompt Vault')
    );
    expect(getSharedDatabasePath({ userDataPath: path.join(appData, 'Prompt Vault') })).toBe(
      path.join(appData, 'Prompt Vault', DATABASE_FILE_NAME)
    );
  });

  it('locates the legacy project database for first-run migration', () => {
    expect(getProjectDatabasePath('C:\\repo\\prompt-tool')).toBe(
      path.join('C:\\repo\\prompt-tool', 'data', DATABASE_FILE_NAME)
    );
  });

  it('copies the legacy database and sidecars only when the shared database is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-vault-paths-'));
    const source = path.join(root, 'project', 'data', DATABASE_FILE_NAME);
    const target = path.join(root, 'user-data', DATABASE_FILE_NAME);
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, 'sqlite-data');
    fs.writeFileSync(`${source}-wal`, 'wal-data');

    copyDatabaseIfMissing({ source, target });

    expect(fs.readFileSync(target, 'utf8')).toBe('sqlite-data');
    expect(fs.readFileSync(`${target}-wal`, 'utf8')).toBe('wal-data');

    fs.writeFileSync(source, 'new-source-data');
    fs.writeFileSync(target, 'existing-target-data');
    copyDatabaseIfMissing({ source, target });

    expect(fs.readFileSync(target, 'utf8')).toBe('existing-target-data');
  });
});
