import type {
  ExportPackage,
  ImportMode,
  ImportPreview,
  Prompt,
  PromptFilters,
  PromptInput,
  PromptSaveResult,
  PromptVersion,
  Scene,
  Tag
} from './shared/types';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(path, {
    ...options,
    headers
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || body.error || `请求失败：${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  async prompts(filters: PromptFilters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '' && value !== false) {
        params.set(key, String(value));
      }
    });
    const suffix = params.toString() ? `?${params}` : '';
    return request<Prompt[]>(`/api/prompts${suffix}`);
  },
  prompt(id: string) {
    return request<Prompt>(`/api/prompts/${id}`);
  },
  createPrompt(input: PromptInput) {
    return request<Prompt>('/api/prompts', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  updatePrompt(id: string, input: PromptInput) {
    return request<PromptSaveResult>(`/api/prompts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    });
  },
  deletePrompt(id: string) {
    return request<void>(`/api/prompts/${id}`, {
      method: 'DELETE'
    });
  },
  setFavorite(id: string, favorite: boolean) {
    return request<Prompt>(`/api/prompts/${id}/favorite`, {
      method: 'PATCH',
      body: JSON.stringify({ favorite })
    });
  },
  setPinned(id: string, isPinned: boolean) {
    return request<Prompt>(`/api/prompts/${id}/pin`, {
      method: 'PATCH',
      body: JSON.stringify({ isPinned })
    });
  },
  versions(id: string) {
    return request<PromptVersion[]>(`/api/prompts/${id}/versions`);
  },
  restoreVersion(promptId: string, versionId: string) {
    return request<PromptSaveResult>(`/api/prompts/${promptId}/restore/${versionId}`, {
      method: 'POST',
      body: JSON.stringify({ restoredBy: '本地用户' })
    });
  },
  pinVersion(versionId: string, isPinned: boolean) {
    return request<PromptVersion>(`/api/versions/${versionId}/pin`, {
      method: 'PATCH',
      body: JSON.stringify({ isPinned })
    });
  },
  tags() {
    return request<Tag[]>('/api/tags');
  },
  scenes() {
    return request<Scene[]>('/api/scenes');
  },
  createScene(input: Pick<Scene, 'name' | 'description' | 'icon' | 'color'>) {
    return request<Scene>('/api/scenes', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  updateScene(id: string, input: Partial<Pick<Scene, 'name' | 'description' | 'icon' | 'color'>>) {
    return request<Scene>(`/api/scenes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    });
  },
  deleteScene(id: string) {
    return request<void>(`/api/scenes/${id}`, {
      method: 'DELETE'
    });
  },
  createTag(input: Pick<Tag, 'name' | 'color'>) {
    return request<Tag>('/api/tags', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  },
  facets() {
    return request<{ tags: Tag[]; useCases: string[]; modelHints: string[] }>('/api/facets');
  },
  exportPackage() {
    return request<ExportPackage>('/api/export', {
      method: 'POST',
      body: JSON.stringify({})
    });
  },
  previewImport(pkg: ExportPackage) {
    return request<ImportPreview>('/api/import/preview', {
      method: 'POST',
      body: JSON.stringify(pkg)
    });
  },
  applyImport(pkg: ExportPackage, mode: ImportMode) {
    return request<{
      importedPrompts: number;
      importedTags: number;
      importedVersions: number;
      skippedPrompts: number;
      overwrittenPrompts: number;
    }>('/api/import/apply', {
      method: 'POST',
      body: JSON.stringify({ package: pkg, mode })
    });
  }
};
