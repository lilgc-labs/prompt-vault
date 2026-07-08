import { describe, expect, it } from 'vitest';
import { buildDevProcessSpecs } from './devProcesses.js';

describe('dev process specs', () => {
  it('starts development services with node instead of npm command shims', () => {
    const specs = buildDevProcessSpecs();

    expect(specs).toEqual([
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
    ]);
  });
});
