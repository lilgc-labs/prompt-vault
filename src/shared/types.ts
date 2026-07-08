export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Scene {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  promptCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Prompt {
  id: string;
  title: string;
  description: string;
  content: string;
  sceneId: string;
  scene?: Scene | null;
  tags: Tag[];
  useCase: string;
  modelHint: string;
  favorite: boolean;
  isPinned: boolean;
  pinnedAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptVersion {
  id: string;
  promptId: string;
  title: string;
  description: string;
  content: string;
  sceneId?: string;
  useCase: string;
  modelHint: string;
  tags: Tag[];
  changeNote: string;
  createdBy: string;
  createdAt: string;
  isPinned: boolean;
}

export interface ExportPackage {
  schemaVersion: 1 | 2;
  author?: string;
  prompts: Prompt[];
  versions: PromptVersion[];
  tags: Tag[];
  scenes?: Scene[];
  exportedAt: string;
}

export interface PromptInput {
  title: string;
  description: string;
  content: string;
  sceneId?: string;
  tagIds: string[];
  useCase: string;
  modelHint: string;
  favorite: boolean;
  createdBy: string;
  changeNote: string;
}

export interface PromptFilters {
  q?: string;
  sceneId?: string;
  tag?: string;
  useCase?: string;
  modelHint?: string;
  favorite?: boolean;
}

export interface ImportConflict {
  incomingId: string;
  title: string;
  existingId: string;
  reason: 'id' | 'title';
}

export interface ImportPreview {
  valid: boolean;
  errors: string[];
  promptCount: number;
  versionCount: number;
  tagCount: number;
  conflicts: ImportConflict[];
}

export type ImportMode = 'skip' | 'overwrite';

export interface PromptSaveResult {
  prompt: Prompt;
  versionCreated: boolean;
  message: string;
}

export type PromptQualityLevel = '待打磨' | '可复用' | '结构清晰' | '高质量模板';

export interface PromptQuality {
  level: PromptQualityLevel;
  score: number;
  checks: Array<{
    key: string;
    label: string;
    passed: boolean;
  }>;
}
