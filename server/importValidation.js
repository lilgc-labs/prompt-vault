const REQUIRED_PROMPT_FIELDS = ['id', 'title', 'content', 'createdAt', 'updatedAt'];
const REQUIRED_VERSION_FIELDS = ['id', 'promptId', 'content', 'createdAt'];
const REQUIRED_TAG_FIELDS = ['id', 'name', 'color', 'createdAt'];
const REQUIRED_SCENE_FIELDS = ['id', 'name', 'color', 'createdAt'];

export function validatePackage(value) {
  const errors = [];

  if (!value || typeof value !== 'object') {
    return emptyPreview(['导入文件不是有效的 JSON 对象']);
  }

  if (![1, 2].includes(value.schemaVersion)) {
    errors.push('不支持的 schemaVersion，当前仅支持 1 或 2');
  }

  if (!Array.isArray(value.prompts)) {
    errors.push('prompts 必须是数组');
  }

  if (!Array.isArray(value.versions)) {
    errors.push('versions 必须是数组');
  }

  if (!Array.isArray(value.tags)) {
    errors.push('tags 必须是数组');
  }

  const prompts = Array.isArray(value.prompts) ? value.prompts : [];
  const versions = Array.isArray(value.versions) ? value.versions : [];
  const tags = Array.isArray(value.tags) ? value.tags : [];
  const scenes = Array.isArray(value.scenes) ? value.scenes : [];

  checkRequired(prompts, 'prompts', REQUIRED_PROMPT_FIELDS, errors);
  checkRequired(versions, 'versions', REQUIRED_VERSION_FIELDS, errors);
  checkRequired(tags, 'tags', REQUIRED_TAG_FIELDS, errors);
  checkRequired(scenes, 'scenes', REQUIRED_SCENE_FIELDS, errors);

  return {
    valid: errors.length === 0,
    errors,
    promptCount: prompts.length,
    versionCount: versions.length,
    tagCount: tags.length,
    conflicts: []
  };
}

function checkRequired(items, label, fields, errors) {
  items.forEach((item, index) => {
    fields.forEach((field) => {
      if (!(field in item)) {
        errors.push(`${label}[${index}] 缺少 ${field}`);
      }
    });
  });
}

function emptyPreview(errors) {
  return {
    valid: false,
    errors,
    promptCount: 0,
    versionCount: 0,
    tagCount: 0,
    conflicts: []
  };
}
