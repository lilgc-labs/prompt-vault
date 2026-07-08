import { app, BrowserWindow, Menu, shell } from 'electron';
import { buildApp } from '../server/app.js';
import { openDatabase } from '../server/database.js';
import { getApplicationMenuTemplate, getDatabasePath, getDistPath, getWindowOptions, migrateInitialDatabase } from './desktopConfig.js';

let fastifyApp;
let store;
let mainWindow;

async function startServer() {
  const appRoot = app.getAppPath();
  const userDataPath = app.getPath('userData');
  migrateInitialDatabase({ appRoot, userDataPath });

  store = openDatabase(getDatabasePath(userDataPath));
  fastifyApp = await buildApp(store, {
    logger: false,
    serveStatic: true,
    staticRoot: getDistPath(appRoot)
  });

  await fastifyApp.listen({ host: '127.0.0.1', port: 0 });
  const address = fastifyApp.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine desktop server port');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function createWindow() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(getApplicationMenuTemplate()));
  const serverUrl = await startServer();
  mainWindow = new BrowserWindow(getWindowOptions());

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(serverUrl);
}

async function shutdown() {
  if (fastifyApp) {
    await fastifyApp.close();
    fastifyApp = undefined;
  }
  if (store) {
    store.close();
    store = undefined;
  }
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (event) => {
  if (!fastifyApp && !store) {
    return;
  }
  event.preventDefault();
  shutdown()
    .catch((error) => console.error(error))
    .finally(() => app.exit(0));
});
