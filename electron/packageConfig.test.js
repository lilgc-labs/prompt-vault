import packageJson from '../package.json';
import { describe, expect, it } from 'vitest';

function collectNullPaths(value, prefix = 'config.forge') {
  if (value === null) {
    return [prefix];
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectNullPaths(item, `${prefix}[${index}]`));
  }
  return Object.entries(value).flatMap(([key, item]) => collectNullPaths(item, `${prefix}.${key}`));
}

describe('Electron Forge package config', () => {
  it('does not contain null values that Forge cannot proxify', () => {
    expect(collectNullPaths(packageJson.config.forge)).toEqual([]);
  });

  it('keeps build-only tooling out of production dependencies', () => {
    expect(packageJson.dependencies).not.toHaveProperty('vite');
    expect(packageJson.dependencies).not.toHaveProperty('@vitejs/plugin-react');
    expect(packageJson.devDependencies).toHaveProperty('vite');
    expect(packageJson.devDependencies).toHaveProperty('@vitejs/plugin-react');
  });
});
