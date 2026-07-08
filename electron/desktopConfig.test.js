import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { FEEDBACK_EMAIL, getApplicationMenuTemplate, getDatabasePath, getInitialProjectDatabasePath, getWindowOptions, migrateInitialDatabase } from './desktopConfig.js';

describe('desktop config', () => {
  it('stores the desktop database under Electron userData', () => {
    expect(getDatabasePath('C:\\Users\\qa\\AppData\\Roaming\\Prompt Vault')).toBe(
      path.join('C:\\Users\\qa\\AppData\\Roaming\\Prompt Vault', 'prompt-vault.sqlite')
    );
  });

  it('locates the development database for one-time migration', () => {
    expect(getInitialProjectDatabasePath('C:\\repo\\prompt-tool')).toBe(
      path.join('C:\\repo\\prompt-tool', 'data', 'prompt-vault.sqlite')
    );
  });

  it('uses locked-down BrowserWindow web preferences', () => {
    expect(getWindowOptions()).toMatchObject({
      title: 'Prompt Vault',
      width: 1280,
      height: 860,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
  });

  it('copies an existing project database into userData on first launch', () => {
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-vault-root-'));
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-vault-user-data-'));
    const source = getInitialProjectDatabasePath(appRoot);
    fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, 'sqlite-data');
    fs.writeFileSync(`${source}-wal`, 'wal-data');

    const target = migrateInitialDatabase({ appRoot, userDataPath });

    expect(target).toBe(getDatabasePath(userDataPath));
    expect(fs.readFileSync(target, 'utf8')).toBe('sqlite-data');
    expect(fs.readFileSync(`${target}-wal`, 'utf8')).toBe('wal-data');
  });

  it('adds the feedback email to the Help menu', () => {
    const helpMenu = getApplicationMenuTemplate().find((item) => item.role === 'help');

    expect(FEEDBACK_EMAIL).toBe('3560585211@qq.com');
    expect(helpMenu?.submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: `反馈邮箱：${FEEDBACK_EMAIL}`
        })
      ])
    );
  });
});
