import path from 'node:path';
import { copyDatabaseIfMissing, DATABASE_FILE_NAME, getProjectDatabasePath } from '../server/storagePaths.js';

export const PRODUCT_NAME = 'Prompt Vault';
export const FEEDBACK_EMAIL = '3560585211@qq.com';

export function getDatabasePath(userDataPath) {
  return path.join(userDataPath, DATABASE_FILE_NAME);
}

export function getInitialProjectDatabasePath(appRoot) {
  return getProjectDatabasePath(appRoot);
}

export function getDistPath(appRoot) {
  return path.join(appRoot, 'dist');
}

export function getWindowOptions() {
  return {
    title: PRODUCT_NAME,
    width: 1280,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#f6f8fb',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };
}

export function getApplicationMenuTemplate() {
  return [
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: `反馈邮箱：${FEEDBACK_EMAIL}`,
          enabled: false
        }
      ]
    }
  ];
}

export function migrateInitialDatabase({ appRoot, userDataPath }) {
  const target = getDatabasePath(userDataPath);
  const source = getInitialProjectDatabasePath(appRoot);
  return copyDatabaseIfMissing({ source, target });
}
