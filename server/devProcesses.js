export function buildDevProcessSpecs() {
  return [
    {
      name: 'api',
      command: process.execPath,
      args: ['--experimental-sqlite', 'server/index.js']
    },
    {
      name: 'web',
      command: process.execPath,
      args: ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1']
    }
  ];
}
