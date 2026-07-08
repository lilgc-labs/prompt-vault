import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./api', () => ({
  api: {
    scenes: vi.fn(async () => []),
    tags: vi.fn(async () => []),
    prompts: vi.fn(async () => []),
    versions: vi.fn(async () => [])
  }
}));

describe('App copy', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses the updated all-prompts collection headline', async () => {
    render(<App />);

    await waitFor(() => {
      const heading = screen.getByRole('heading', {
        level: 1,
        name: '驱动高效工作与日常创作的 Prompt 资产库'
      });
      expect(heading).toBeTruthy();
    });
  });
});
