import { buildApp } from './app.js';
import { openDatabase } from './database.js';

const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || '127.0.0.1';
const store = openDatabase();
const app = await buildApp(store, {
  logger: true,
  serveStatic: process.env.NODE_ENV === 'production' || process.argv.includes('--serve-static')
});

const shutdown = async () => {
  await app.close();
  store.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ host, port });
