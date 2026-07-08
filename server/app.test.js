import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from './app.js';
import { createMemoryStore } from './database.js';

let app;
let store;

beforeEach(async () => {
  store = createMemoryStore(false);
  app = await buildApp(store);
});

afterEach(async () => {
  await app.close();
  store.close();
});

async function injectJson(method, url, payload) {
  const response = await app.inject({
    method,
    url,
    payload
  });

  return {
    statusCode: response.statusCode,
    body: response.body ? JSON.parse(response.body) : undefined
  };
}

describe('prompt API', () => {
  it('creates, edits, and restores prompt versions', async () => {
    const tag = store.createTag({ name: '调研', color: '#246bfe' });
    const create = await injectJson('POST', '/api/prompts', {
      title: '调研模板',
      description: 'demo',
      content: '第一版 {{行业}}',
      tagIds: [tag.id],
      useCase: '调研',
      modelHint: 'GPT-5.4',
      favorite: false,
      createdBy: 'QA',
      changeNote: '初版'
    });

    expect(create.statusCode).toBe(201);
    const promptId = create.body.id;

    for (const [index, content] of ['第二版', '第三版', '第四版'].entries()) {
      const update = await injectJson('PUT', `/api/prompts/${promptId}`, {
        ...create.body,
        content,
        tagIds: [tag.id],
        changeNote: `第 ${index + 2} 次`
      });
      expect(update.statusCode).toBe(200);
      expect(update.body.versionCreated).toBe(true);
    }

    const versions = await injectJson('GET', `/api/prompts/${promptId}/versions`);
    expect(versions.body).toHaveLength(4);
    expect(versions.body[0].content).toBe('第四版');

    const restore = await injectJson('POST', `/api/prompts/${promptId}/restore/${versions.body[3].id}`, {});
    expect(restore.statusCode).toBe(200);
    expect(restore.body.prompt.content).toBe('第一版 {{行业}}');

    const restoredVersions = await injectJson('GET', `/api/prompts/${promptId}/versions`);
    expect(restoredVersions.body).toHaveLength(5);
  });

  it('manages scenes and filters prompts by scene', async () => {
    const academic = await injectJson('POST', '/api/scenes', {
      name: '学术论文润色',
      description: '论文润色和审稿回复',
      icon: '✦',
      color: '#4f46e5'
    });
    const product = await injectJson('POST', '/api/scenes', {
      name: 'AI 产品经理',
      description: '产品需求和方案表达',
      icon: '◆',
      color: '#246bfe'
    });

    expect(academic.statusCode).toBe(201);
    expect(product.statusCode).toBe(201);

    await injectJson('POST', '/api/prompts', {
      title: '摘要润色',
      description: '',
      content: '你是学术写作专家，请润色 {{摘要}}。',
      sceneId: academic.body.id,
      tagIds: [],
      useCase: '',
      modelHint: 'GPT-5.4',
      favorite: false,
      createdBy: 'QA',
      changeNote: '初版'
    });

    const filtered = await injectJson('GET', `/api/prompts?sceneId=${academic.body.id}`);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].sceneId).toBe(academic.body.id);

    const deleteUsed = await injectJson('DELETE', `/api/scenes/${academic.body.id}`);
    expect(deleteUsed.statusCode).toBe(204);

    const migrated = await injectJson('GET', '/api/prompts?q=摘要润色');
    expect(migrated.body).toHaveLength(1);
    expect(migrated.body[0].scene.name).toBe('未分组 Prompt');
    expect(migrated.body[0].useCase).toBe('未分组 Prompt');

    const deletedSceneFilter = await injectJson('GET', `/api/prompts?sceneId=${academic.body.id}`);
    expect(deletedSceneFilter.body).toHaveLength(0);

    const deleteEmpty = await injectJson('DELETE', `/api/scenes/${product.body.id}`);
    expect(deleteEmpty.statusCode).toBe(204);
  });

  it('keeps the uncategorized scene last and prevents deleting it', async () => {
    const scene = await injectJson('POST', '/api/scenes', {
      name: '临时场景',
      description: '临时 Prompt',
      icon: '◆',
      color: '#246bfe'
    });
    const created = await injectJson('POST', '/api/prompts', {
      title: '未分组迁移验证',
      description: '',
      content: 'searchable uncategorized migration body',
      sceneId: scene.body.id,
      tagIds: [],
      useCase: '',
      modelHint: '',
      favorite: false,
      createdBy: 'QA',
      changeNote: 'Initial'
    });

    const deleted = await injectJson('DELETE', `/api/scenes/${scene.body.id}`);
    expect(deleted.statusCode).toBe(204);

    const scenes = await injectJson('GET', '/api/scenes');
    const uncategorized = scenes.body.at(-1);
    expect(uncategorized.name).toBe('未分组 Prompt');
    expect(uncategorized.promptCount).toBe(1);

    const protectedDelete = await injectJson('DELETE', `/api/scenes/${uncategorized.id}`);
    expect(protectedDelete.statusCode).toBe(409);

    const prompt = store.getPrompt(created.body.id);
    expect(prompt.sceneId).toBe(uncategorized.id);
    expect((await injectJson('GET', '/api/prompts?q=uncategorized')).body).toHaveLength(1);
  });

  it('saves metadata without creating a version when prompt body is unchanged', async () => {
    const created = await injectJson('POST', '/api/prompts', {
      title: 'PRD 评审',
      description: '旧描述',
      content: '你是产品专家，请评审 {{PRD}}。',
      tagIds: [],
      useCase: 'AI 产品经理',
      modelHint: 'GPT-5.4',
      favorite: false,
      createdBy: 'QA',
      changeNote: '初版'
    });

    const update = await injectJson('PUT', `/api/prompts/${created.body.id}`, {
      ...created.body,
      title: 'PRD 评审模板',
      description: '新描述',
      content: '你是产品专家，请评审 {{PRD}}。\n\n',
      tagIds: [],
      changeNote: '只改元信息'
    });

    expect(update.statusCode).toBe(200);
    expect(update.body.versionCreated).toBe(false);
    expect(update.body.message).toContain('未创建新版本');
    expect(update.body.prompt.title).toBe('PRD 评审模板');

    const versions = await injectJson('GET', `/api/prompts/${created.body.id}/versions`);
    expect(versions.body).toHaveLength(1);
  });

  it('searches title, content, and tags through SQLite FTS', async () => {
    const tag = store.createTag({ name: '营销', color: '#10a37f' });
    await injectJson('POST', '/api/prompts', {
      title: '发布文案',
      description: '',
      content: '请为新品写一段官网首屏文案',
      tagIds: [tag.id],
      useCase: '运营',
      modelHint: 'GPT-5.4',
      favorite: true,
      createdBy: 'QA',
      changeNote: '初版'
    });

    expect((await injectJson('GET', '/api/prompts?q=新品')).body).toHaveLength(1);
    expect((await injectJson('GET', '/api/prompts?q=营销')).body).toHaveLength(1);
    expect((await injectJson('GET', `/api/prompts?tag=${tag.id}`)).body).toHaveLength(1);
    expect((await injectJson('GET', '/api/prompts?favorite=true')).body).toHaveLength(1);
  });

  it('deletes a prompt with its versions, tag links, and search index', async () => {
    const tag = store.createTag({ name: '逻辑检查', color: '#d1495b' });
    const create = await injectJson('POST', '/api/prompts', {
      title: 'Delete regression',
      description: 'temporary prompt',
      content: 'The searchable body should disappear.',
      tagIds: [tag.id],
      useCase: 'QA',
      modelHint: '',
      favorite: false,
      createdBy: 'QA',
      changeNote: 'Initial'
    });
    await injectJson('PUT', `/api/prompts/${create.body.id}`, {
      ...create.body,
      content: 'The updated searchable body should also disappear.',
      tagIds: [tag.id],
      changeNote: 'Update'
    });

    const deleted = await injectJson('DELETE', `/api/prompts/${create.body.id}`);

    expect(deleted.statusCode).toBe(204);
    expect(store.getPrompt(create.body.id)).toBeNull();
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM prompt_versions WHERE prompt_id = ?').get(create.body.id).count).toBe(0);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM prompt_tags WHERE prompt_id = ?').get(create.body.id).count).toBe(0);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM prompt_search WHERE prompt_id = ?').get(create.body.id).count).toBe(0);
    expect((await injectJson('GET', '/api/prompts?q=searchable')).body).toHaveLength(0);
  });

  it('pins prompts globally and sorts pinned prompts before recent unpinned prompts', async () => {
    const first = await injectJson('POST', '/api/prompts', {
      title: 'Pinned candidate',
      description: '',
      content: 'Older prompt',
      tagIds: [],
      useCase: 'QA',
      modelHint: '',
      favorite: false,
      createdBy: 'QA',
      changeNote: 'Initial'
    });
    const second = await injectJson('POST', '/api/prompts', {
      title: 'Recent unpinned',
      description: '',
      content: 'Newer prompt',
      tagIds: [],
      useCase: 'QA',
      modelHint: '',
      favorite: false,
      createdBy: 'QA',
      changeNote: 'Initial'
    });

    const pinned = await injectJson('PATCH', `/api/prompts/${first.body.id}/pin`, { isPinned: true });
    const list = await injectJson('GET', '/api/prompts');
    const unpinned = await injectJson('PATCH', `/api/prompts/${first.body.id}/pin`, { isPinned: false });

    expect(pinned.statusCode).toBe(200);
    expect(pinned.body.isPinned).toBe(true);
    expect(pinned.body.pinnedAt).toBeTruthy();
    expect(list.body[0].id).toBe(first.body.id);
    expect(list.body[1].id).toBe(second.body.id);
    expect(unpinned.body.isPinned).toBe(false);
    expect(unpinned.body.pinnedAt).toBe('');
  });

  it('consolidates noisy tags into the core tag set', async () => {
    const caption = store.createTag({ name: 'Caption', color: '#f59e0b' });
    const reviewer = store.createTag({ name: 'Reviewer', color: '#246bfe' });
    const source = store.createTag({ name: 'awesome-ai-research-writing', color: '#64748b' });
    const create = await injectJson('POST', '/api/prompts', {
      title: 'Noisy tags',
      description: '',
      content: 'Review the figure caption.',
      tagIds: [caption.id, reviewer.id, source.id],
      useCase: '论文投稿预审',
      modelHint: '',
      favorite: false,
      createdBy: 'QA',
      changeNote: 'Initial'
    });

    store.consolidateCoreTags();

    const promptTagNames = store.getPrompt(create.body.id).tags.map((tag) => tag.name).sort();
    const allTagNames = store.listTags().map((tag) => tag.name);
    expect(promptTagNames).toEqual(['图表可视化', '投稿评审']);
    expect(allTagNames.every((name) => ['学术写作', '中文论文', 'Word', '润色改写', '压缩扩展', '逻辑审校', '去 AI 味', '图表可视化', '投稿评审', '业务通用'].includes(name))).toBe(true);
    expect(allTagNames).not.toContain('awesome-ai-research-writing');
  });

  it('previews and applies imports with conflict handling', async () => {
    const created = await injectJson('POST', '/api/prompts', {
      title: '内部评审',
      description: '',
      content: '旧内容',
      tagIds: [],
      useCase: '评审',
      modelHint: '本地模型',
      favorite: false,
      createdBy: 'QA',
      changeNote: '初版'
    });

    const pkg = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      tags: [],
      prompts: [
        {
          ...created.body,
          id: 'prompt_imported_same_title',
          content: '导入内容',
          tags: []
        }
      ],
      versions: [
        {
          id: 'version_imported_1',
          promptId: 'prompt_imported_same_title',
          title: '内部评审',
          description: '',
          content: '导入内容',
          useCase: '评审',
          modelHint: '本地模型',
          tags: [],
          changeNote: '导入版本',
          createdBy: 'QA',
          createdAt: new Date().toISOString(),
          isPinned: false
        }
      ]
    };

    const preview = await injectJson('POST', '/api/import/preview', pkg);
    expect(preview.statusCode).toBe(200);
    expect(preview.body.conflicts).toHaveLength(1);

    const skipped = await injectJson('POST', '/api/import/apply', { package: pkg, mode: 'skip' });
    expect(skipped.body.skippedPrompts).toBe(1);
    expect(store.listPrompts()).toHaveLength(1);

    const overwritten = await injectJson('POST', '/api/import/apply', { package: pkg, mode: 'overwrite' });
    expect(overwritten.body.overwrittenPrompts).toBe(1);
    expect(store.listPrompts()).toHaveLength(1);
    expect(store.getPrompt('prompt_imported_same_title').content).toBe('导入内容');
  });

  it('exports v2 packages with scenes and imports v1 packages through useCase scene fallback', async () => {
    const created = await injectJson('POST', '/api/prompts', {
      title: '论文润色',
      description: '',
      content: '请润色 {{原文}} 并说明修改理由。',
      tagIds: [],
      useCase: '学术论文润色',
      modelHint: 'GPT-5.4',
      favorite: false,
      createdBy: 'QA',
      changeNote: '初版'
    });

    const exported = await injectJson('POST', '/api/export', {});
    expect(exported.body.schemaVersion).toBe(2);
    expect(exported.body.author).toBe('guochen');
    expect(exported.body.scenes.length).toBeGreaterThan(0);

    const emptyStore = createMemoryStore(false);
    const emptyApp = await buildApp(emptyStore);
    const v1Package = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      tags: [],
      prompts: [
        {
          ...created.body,
          id: 'prompt_v1_import',
          title: 'V1 需求拆解',
          useCase: 'AI 产品经理',
          tags: []
        }
      ],
      versions: []
    };

    const response = await emptyApp.inject({
      method: 'POST',
      url: '/api/import/apply',
      payload: { package: v1Package, mode: 'skip' }
    });
    expect(response.statusCode).toBe(200);
    const imported = emptyStore.getPrompt('prompt_v1_import');
    expect(imported.scene?.name).toBe('AI 产品经理');
    await emptyApp.close();
    emptyStore.close();
  });

  it('serves static files from a caller-provided root', async () => {
    const staticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-vault-static-'));
    fs.writeFileSync(path.join(staticRoot, 'index.html'), '<!doctype html><title>Desktop Fixture</title>');
    const staticStore = createMemoryStore(false);
    const staticApp = await buildApp(staticStore, {
      serveStatic: true,
      staticRoot
    });

    const response = await staticApp.inject({
      method: 'GET',
      url: '/desktop-route'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Desktop Fixture');

    await staticApp.close();
    staticStore.close();
  });
});
