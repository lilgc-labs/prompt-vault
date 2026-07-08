import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { api } from './api';
import type { Scene } from './shared/types';

const { scenesMock, createSceneMock, createdScene } = vi.hoisted(() => {
  const scene: Scene = {
    id: 'scene_desktop_feedback',
    name: '桌面测试场景',
    description: '桌面测试场景 场景下的 Prompt 资产',
    icon: '✦',
    color: '#246bfe',
    promptCount: 0,
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-17T00:00:00.000Z'
  };

  return {
    createdScene: scene,
    scenesMock: vi.fn(async (): Promise<Scene[]> => []),
    createSceneMock: vi.fn(async () => scene)
  };
});

vi.mock('./api', () => ({
  api: {
    scenes: scenesMock,
    tags: vi.fn(async () => []),
    prompts: vi.fn(async () => []),
    versions: vi.fn(async () => []),
    createScene: createSceneMock
  }
}));

describe('scene creation', () => {
  afterEach(() => {
    vi.clearAllMocks();
    scenesMock.mockResolvedValue([] as Scene[]);
  });

  it('creates a scene from an in-app dialog instead of the browser prompt API', async () => {
    const promptSpy = vi.spyOn(window, 'prompt');
    scenesMock.mockResolvedValueOnce([] as Scene[]).mockResolvedValueOnce([createdScene]);
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '新增场景' }));
    fireEvent.change(screen.getByLabelText('场景名称'), { target: { value: '桌面测试场景' } });
    fireEvent.click(screen.getByRole('button', { name: '创建场景' }));

    await waitFor(() => {
      expect(api.createScene).toHaveBeenCalledWith({
        name: '桌面测试场景',
        description: '桌面测试场景 场景下的 Prompt 资产',
        icon: '✦',
        color: '#246bfe'
      });
    });
    expect(promptSpy).not.toHaveBeenCalled();
  });
});
