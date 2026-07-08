import type { ExportPackage, ImportPreview } from './types';

const REQUIRED_PROMPT_FIELDS = ['id', 'title', 'content', 'createdAt', 'updatedAt'];
const REQUIRED_VERSION_FIELDS = ['id', 'promptId', 'content', 'createdAt'];
const REQUIRED_TAG_FIELDS = ['id', 'name', 'color', 'createdAt'];
const REQUIRED_SCENE_FIELDS = ['id', 'name', 'color', 'createdAt'];

export function validateExportPackage(value: unknown): ImportPreview {
  const errors: string[] = [];

  if (!value || typeof value !== 'object') {
    return emptyPreview(['导入文件不是有效的 JSON 对象']);
  }

  const candidate = value as Partial<ExportPackage>;
  if (![1, 2].includes(candidate.schemaVersion || 0)) {
    errors.push('不支持的 schemaVersion，当前仅支持 1 或 2');
  }

  if (!Array.isArray(candidate.prompts)) {
    errors.push('prompts 必须是数组');
  }

  if (!Array.isArray(candidate.versions)) {
    errors.push('versions 必须是数组');
  }

  if (!Array.isArray(candidate.tags)) {
    errors.push('tags 必须是数组');
  }

  const prompts = Array.isArray(candidate.prompts) ? candidate.prompts : [];
  const versions = Array.isArray(candidate.versions) ? candidate.versions : [];
  const tags = Array.isArray(candidate.tags) ? candidate.tags : [];
  const scenes = Array.isArray(candidate.scenes) ? candidate.scenes : [];

  prompts.forEach((prompt, index) => {
    REQUIRED_PROMPT_FIELDS.forEach((field) => {
      if (!(field in prompt)) {
        errors.push(`prompts[${index}] 缺少 ${field}`);
      }
    });
  });

  versions.forEach((version, index) => {
    REQUIRED_VERSION_FIELDS.forEach((field) => {
      if (!(field in version)) {
        errors.push(`versions[${index}] 缺少 ${field}`);
      }
    });
  });

  tags.forEach((tag, index) => {
    REQUIRED_TAG_FIELDS.forEach((field) => {
      if (!(field in tag)) {
        errors.push(`tags[${index}] 缺少 ${field}`);
      }
    });
  });

  scenes.forEach((scene, index) => {
    REQUIRED_SCENE_FIELDS.forEach((field) => {
      if (!(field in scene)) {
        errors.push(`scenes[${index}] 缺少 ${field}`);
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    promptCount: prompts.length,
    versionCount: versions.length,
    tagCount: tags.length,
    conflicts: []
  };
}

function emptyPreview(errors: string[]): ImportPreview {
  return {
    valid: false,
    errors,
    promptCount: 0,
    versionCount: 0,
    tagCount: 0,
    conflicts: []
  };
}
