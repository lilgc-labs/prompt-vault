import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { prepareSharedDatabase } from './storagePaths.js';
import { boolToInt, createId, intToBool, nowIso, parseJsonArray } from './utils.js';

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), 'data');
const LEGACY_DB_PATH = path.join(DEFAULT_DATA_DIR, 'prompt-vault.sqlite');
const UNCATEGORIZED_SCENE_NAME = '未分组 Prompt';
const LEGACY_UNCATEGORIZED_SCENE_NAME = '未分类';
const UNCATEGORIZED_SCENE = {
  id: 'scene_uncategorized_prompt',
  name: UNCATEGORIZED_SCENE_NAME,
  description: '删除场景或尚未归类的 Prompt 会暂存于此。',
  icon: '∅',
  color: '#64748b'
};
const CORE_TAGS = [
  { id: 'tag_core_academic_writing', name: '学术写作', color: '#246bfe' },
  { id: 'tag_core_chinese_paper', name: '中文论文', color: '#4f46e5' },
  { id: 'tag_core_word', name: 'Word', color: '#0891b2' },
  { id: 'tag_core_polish', name: '润色改写', color: '#10a37f' },
  { id: 'tag_core_expand_condense', name: '压缩扩展', color: '#f59e0b' },
  { id: 'tag_core_logic', name: '逻辑审校', color: '#d1495b' },
  { id: 'tag_core_de_ai', name: '去 AI 味', color: '#8b5cf6' },
  { id: 'tag_core_visual', name: '图表可视化', color: '#0ea5e9' },
  { id: 'tag_core_review', name: '投稿评审', color: '#0f766e' },
  { id: 'tag_core_business', name: '业务通用', color: '#64748b' }
];

const SOURCE_ONLY_TAGS = new Set(['awesome-ai-research-writing', '开源导入']);

const TAG_ALIASES = new Map([
  ['学术写作', ['学术写作']],
  ['中文论文', ['中文论文']],
  ['Word', ['Word']],
  ['润色改写', ['润色改写', '润色', '改写', '语言优化', '学术表达', '自然表达']],
  ['压缩扩展', ['压缩扩展', '缩写', '内容压缩', '字数控制', '扩写', '内容扩展', '论证补强']],
  ['逻辑审校', ['逻辑审校', '逻辑检查', '学术审校', '论证结构', '修订', '质量检查']],
  ['去 AI 味', ['去 AI 味', '去AI味']],
  ['图表可视化', ['图表可视化', 'Caption', '图题', '表题', '可视化', '图表选型', '实验绘图', '数据呈现', '架构图', '技术路线', '论文图表', '论文表格']],
  ['投稿评审', ['投稿评审', 'Reviewer', '投稿预审', '论文评审']],
  ['业务通用', ['业务通用', '调研', '营销', '模板', '敏感业务']]
]);

const TAG_ALIAS_LOOKUP = new Map(
  [...TAG_ALIASES.entries()].flatMap(([coreName, aliases]) => aliases.map((alias) => [normalizeTagName(alias), coreName]))
);

export function getDefaultDatabasePath() {
  return process.env.PROMPT_VAULT_DB || prepareSharedDatabase({ source: LEGACY_DB_PATH });
}

export function openDatabase(dbPath = getDefaultDatabasePath()) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  seedIfEmpty(db);
  const store = createStore(db);
  store.consolidateCoreTags();
  return store;
}

export function createMemoryStore(seed = true) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  if (seed) {
    seedIfEmpty(db);
  }
  const store = createStore(db);
  if (seed) {
    store.consolidateCoreTags();
  }
  return store;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '◎',
      color TEXT NOT NULL DEFAULT '#246bfe',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      scene_id TEXT NOT NULL DEFAULT '',
      use_case TEXT NOT NULL DEFAULT '',
      model_hint TEXT NOT NULL DEFAULT '',
      favorite INTEGER NOT NULL DEFAULT 0,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      pinned_at TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompt_tags (
      prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (prompt_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS prompt_versions (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      scene_id TEXT NOT NULL DEFAULT '',
      use_case TEXT NOT NULL DEFAULT '',
      model_hint TEXT NOT NULL DEFAULT '',
      tag_snapshot TEXT NOT NULL DEFAULT '[]',
      change_note TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS prompt_search USING fts5(
      prompt_id UNINDEXED,
      title,
      description,
      content,
      use_case,
      model_hint,
      tag_names
    );
  `);
  ensureColumn(db, 'prompts', 'scene_id', "ALTER TABLE prompts ADD COLUMN scene_id TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'prompts', 'is_pinned', "ALTER TABLE prompts ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, 'prompts', 'pinned_at', "ALTER TABLE prompts ADD COLUMN pinned_at TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, 'prompt_versions', 'scene_id', "ALTER TABLE prompt_versions ADD COLUMN scene_id TEXT NOT NULL DEFAULT ''");
  backfillScenes(db);
  ensureUncategorizedSceneRecord(db);
}

function ensureColumn(db, table, column, alterSql) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  if (!exists) {
    db.exec(alterSql);
  }
}

function backfillScenes(db) {
  const timestamp = nowIso();
  const rows = db.prepare(`
    SELECT DISTINCT COALESCE(NULLIF(use_case, ''), ?) AS name
    FROM prompts
    WHERE scene_id = ''
  `).all(UNCATEGORIZED_SCENE_NAME);

  for (const row of rows) {
    const sceneName = normalizeSceneName(row.name);
    const sceneId = sceneName === UNCATEGORIZED_SCENE_NAME ? UNCATEGORIZED_SCENE.id : sceneIdFromName(sceneName);
    db.prepare(`
      INSERT OR IGNORE INTO scenes (id, name, description, icon, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      sceneId,
      sceneName,
      sceneDescription(sceneName),
      sceneIcon(sceneName),
      sceneColor(sceneName),
      timestamp,
      timestamp
    );
    db.prepare(`
      UPDATE prompts
      SET scene_id = ?, use_case = ?
      WHERE scene_id = '' AND COALESCE(NULLIF(use_case, ''), ?) = ?
    `).run(sceneId, sceneName, UNCATEGORIZED_SCENE_NAME, row.name);
  }
}

function ensureUncategorizedSceneRecord(db) {
  const timestamp = nowIso();
  const current = db.prepare('SELECT id FROM scenes WHERE name = ?').get(UNCATEGORIZED_SCENE_NAME);
  const legacy = db.prepare('SELECT id FROM scenes WHERE name = ?').get(LEGACY_UNCATEGORIZED_SCENE_NAME);

  if (!current && legacy) {
    db.prepare(`
      UPDATE scenes
      SET name = ?, description = ?, icon = ?, color = ?, updated_at = ?
      WHERE id = ?
    `).run(
      UNCATEGORIZED_SCENE.name,
      UNCATEGORIZED_SCENE.description,
      UNCATEGORIZED_SCENE.icon,
      UNCATEGORIZED_SCENE.color,
      timestamp,
      legacy.id
    );
    db.prepare('UPDATE prompts SET use_case = ? WHERE scene_id = ?').run(UNCATEGORIZED_SCENE.name, legacy.id);
    db.prepare('UPDATE prompt_versions SET use_case = ? WHERE scene_id = ?').run(UNCATEGORIZED_SCENE.name, legacy.id);
    return;
  }

  if (current && legacy && current.id !== legacy.id) {
    db.prepare('UPDATE prompts SET scene_id = ?, use_case = ? WHERE scene_id = ?').run(
      current.id,
      UNCATEGORIZED_SCENE.name,
      legacy.id
    );
    db.prepare('UPDATE prompt_versions SET scene_id = ?, use_case = ? WHERE scene_id = ?').run(
      current.id,
      UNCATEGORIZED_SCENE.name,
      legacy.id
    );
    db.prepare('DELETE FROM scenes WHERE id = ?').run(legacy.id);
  }

  db.prepare(`
    INSERT OR IGNORE INTO scenes (id, name, description, icon, color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    UNCATEGORIZED_SCENE.id,
    UNCATEGORIZED_SCENE.name,
    UNCATEGORIZED_SCENE.description,
    UNCATEGORIZED_SCENE.icon,
    UNCATEGORIZED_SCENE.color,
    timestamp,
    timestamp
  );

  db.prepare(`
    UPDATE scenes
    SET description = ?, icon = ?, color = ?
    WHERE name = ?
  `).run(
    UNCATEGORIZED_SCENE.description,
    UNCATEGORIZED_SCENE.icon,
    UNCATEGORIZED_SCENE.color,
    UNCATEGORIZED_SCENE.name
  );
}

function seedIfEmpty(db) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM prompts').get().count;
  if (count > 0) {
    return;
  }

  const createdAt = nowIso();
  const tags = [
    { id: 'tag_research', name: '调研', color: '#246bfe', created_at: createdAt },
    { id: 'tag_marketing', name: '营销', color: '#10a37f', created_at: createdAt },
    { id: 'tag_private', name: '敏感业务', color: '#d1495b', created_at: createdAt },
    { id: 'tag_template', name: '模板', color: '#8b5cf6', created_at: createdAt }
  ];

  const insertTag = db.prepare('INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)');
  tags.forEach((tag) => insertTag.run(tag.id, tag.name, tag.color, tag.created_at));

  const samples = [
    {
      id: 'prompt_market_scan',
      title: '竞品信息快速梳理',
      description: '把散落的竞品资料整理成结构化摘要，适合产品和市场团队复用。',
      content:
        '你是一名资深市场研究员。请基于以下资料，输出 {{行业}} 中 {{竞品名称}} 的定位、核心功能、目标用户、价格策略和可借鉴机会。资料：{{资料}}',
      use_case: '市场调研',
      model_hint: 'GPT-5.4',
      favorite: 1,
      created_by: '产品团队',
      tagIds: ['tag_research', 'tag_template']
    },
    {
      id: 'prompt_launch_copy',
      title: '新品发布文案',
      description: '根据产品卖点生成不同渠道的发布文案。',
      content:
        '请为 {{产品名称}} 写一组新品发布文案。目标用户是 {{目标用户}}，核心卖点是 {{核心卖点}}。请分别输出官网首屏、朋友圈短文案和邮件标题。',
      use_case: '营销运营',
      model_hint: 'GPT-5.4',
      favorite: 0,
      created_by: '运营团队',
      tagIds: ['tag_marketing', 'tag_template']
    },
    {
      id: 'prompt_internal_review',
      title: '内部方案评审',
      description: '用于评审包含敏感业务上下文的内部方案。',
      content:
        '你是一个严谨的业务评审专家。请评估以下内部方案的风险、依赖、成本和可执行性。请不要输出原始敏感信息，只给出脱敏后的评审结论。方案：{{方案内容}}',
      use_case: '内部评审',
      model_hint: '本地模型',
      favorite: 1,
      created_by: '策略团队',
      tagIds: ['tag_private']
    }
  ];

  const store = createStore(db);
  samples.forEach((sample) => {
    store.createPrompt({
      title: sample.title,
      description: sample.description,
      content: sample.content,
      useCase: sample.use_case,
      modelHint: sample.model_hint,
      favorite: Boolean(sample.favorite),
      createdBy: sample.created_by,
      tagIds: sample.tagIds,
      changeNote: '初始化示例'
    }, sample.id);
  });
}

export function createStore(db) {
  const store = {
    db,
    close() {
      db.close();
    },
    listScenes() {
      return db.prepare(`
        SELECT
          s.id,
          s.name,
          s.description,
          s.icon,
          s.color,
          s.created_at AS createdAt,
          s.updated_at AS updatedAt,
          COUNT(p.id) AS promptCount
        FROM scenes s
        LEFT JOIN prompts p ON p.scene_id = s.id
        GROUP BY s.id
        ORDER BY CASE WHEN s.name = $uncategorized THEN 1 ELSE 0 END ASC, s.updated_at DESC, s.name ASC
      `).all({ uncategorized: UNCATEGORIZED_SCENE_NAME });
    },
    getScene(id) {
      if (!id) {
        return null;
      }
      return db.prepare(`
        SELECT
          s.id,
          s.name,
          s.description,
          s.icon,
          s.color,
          s.created_at AS createdAt,
          s.updated_at AS updatedAt,
          COUNT(p.id) AS promptCount
        FROM scenes s
        LEFT JOIN prompts p ON p.scene_id = s.id
        WHERE s.id = ?
        GROUP BY s.id
      `).get(id) || null;
    },
    getSceneByName(name) {
      if (!name) {
        return null;
      }
      return db.prepare(`
        SELECT
          s.id,
          s.name,
          s.description,
          s.icon,
          s.color,
          s.created_at AS createdAt,
          s.updated_at AS updatedAt,
          COUNT(p.id) AS promptCount
        FROM scenes s
        LEFT JOIN prompts p ON p.scene_id = s.id
        WHERE s.name = ?
        GROUP BY s.id
      `).get(name) || null;
    },
    createScene(input = {}) {
      const name = normalizeSceneName(input.name || UNCATEGORIZED_SCENE_NAME);
      const existing = this.getScene(input.id) || this.getSceneByName(name);
      if (existing) {
        return existing;
      }

      const timestamp = input.createdAt || nowIso();
      const id = input.id || sceneIdFromName(name);
      db.prepare(`
        INSERT INTO scenes (id, name, description, icon, color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        name,
        (input.description || sceneDescription(name)).trim(),
        input.icon || sceneIcon(name),
        input.color || sceneColor(name),
        timestamp,
        input.updatedAt || timestamp
      );
      return this.getScene(id);
    },
    updateScene(id, input = {}) {
      const existing = this.getScene(id);
      if (!existing) {
        return null;
      }
      const name = (input.name ?? existing.name).trim();
      db.prepare(`
        UPDATE scenes
        SET name = ?, description = ?, icon = ?, color = ?, updated_at = ?
        WHERE id = ?
      `).run(
        name,
        (input.description ?? existing.description).trim(),
        input.icon ?? existing.icon,
        input.color ?? existing.color,
        nowIso(),
        id
      );
      db.prepare('UPDATE prompts SET use_case = ? WHERE scene_id = ?').run(name, id);
      db.prepare('SELECT id FROM prompts WHERE scene_id = ?').all(id).forEach((row) => this.reindexPrompt(row.id));
      return this.getScene(id);
    },
    deleteScene(id) {
      const existing = this.getScene(id);
      if (!existing) {
        return false;
      }
      if (existing.name === UNCATEGORIZED_SCENE_NAME) {
        const error = new Error('未分组 Prompt 是系统默认分组，不能删除');
        error.statusCode = 409;
        throw error;
      }

      const fallback = this.getOrCreateUncategorizedScene();
      const movedPromptIds = db.prepare('SELECT id FROM prompts WHERE scene_id = ?').all(id).map((row) => row.id);
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE prompts SET scene_id = ?, use_case = ?, updated_at = ? WHERE scene_id = ?').run(
          fallback.id,
          fallback.name,
          nowIso(),
          id
        );
        db.prepare('UPDATE prompt_versions SET scene_id = ?, use_case = ? WHERE scene_id = ?').run(fallback.id, fallback.name, id);
        db.prepare('UPDATE scenes SET updated_at = ? WHERE id = ?').run(nowIso(), fallback.id);
        const result = db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
        db.exec('COMMIT');
        movedPromptIds.forEach((promptId) => this.reindexPrompt(promptId));
        return result.changes > 0;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    getOrCreateUncategorizedScene() {
      ensureUncategorizedSceneRecord(db);
      return this.getSceneByName(UNCATEGORIZED_SCENE_NAME);
    },
    isUncategorizedScene(scene) {
      return scene?.name === UNCATEGORIZED_SCENE_NAME;
    },
    resolveScene(sceneId, useCase) {
      const byId = this.getScene(sceneId);
      if (byId) {
        return byId;
      }
      const name = normalizeSceneName(useCase || UNCATEGORIZED_SCENE_NAME);
      return this.getSceneByName(name) || this.createScene({ name });
    },
    listTags() {
      return db.prepare('SELECT id, name, color, created_at AS createdAt FROM tags ORDER BY name ASC').all();
    },
    createTag(input) {
      const id = input.id || createId('tag');
      const createdAt = input.createdAt || nowIso();
      db.prepare('INSERT OR IGNORE INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(
        id,
        input.name.trim(),
        input.color || '#246bfe',
        createdAt
      );
      return this.getTag(id) || this.getTagByName(input.name);
    },
    getTag(id) {
      return db.prepare('SELECT id, name, color, created_at AS createdAt FROM tags WHERE id = ?').get(id);
    },
    getTagByName(name) {
      return db.prepare('SELECT id, name, color, created_at AS createdAt FROM tags WHERE name = ?').get(name);
    },
    deleteTag(id) {
      db.prepare('DELETE FROM tags WHERE id = ?').run(id);
    },
    consolidateCoreTags() {
      const timestamp = nowIso();
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const tag of CORE_TAGS) {
          db.prepare('INSERT OR IGNORE INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(
            tag.id,
            tag.name,
            tag.color,
            timestamp
          );
        }

        const coreByName = new Map(CORE_TAGS.map((tag) => [tag.name, this.getTagByName(tag.name)]));
        const rows = db.prepare(`
          SELECT pt.prompt_id AS promptId, t.id AS tagId, t.name AS tagName
          FROM prompt_tags pt
          INNER JOIN tags t ON t.id = pt.tag_id
        `).all();

        for (const row of rows) {
          const coreName = tagCoreName(row.tagName);
          if (!coreName) {
            continue;
          }
          const coreTag = coreByName.get(coreName);
          if (!coreTag || coreTag.id === row.tagId) {
            continue;
          }
          db.prepare('INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)').run(row.promptId, coreTag.id);
          db.prepare('DELETE FROM prompt_tags WHERE prompt_id = ? AND tag_id = ?').run(row.promptId, row.tagId);
        }

        const coreIds = CORE_TAGS.map((tag) => this.getTagByName(tag.name)?.id).filter(Boolean);
        const placeholders = coreIds.map(() => '?').join(', ');
        if (coreIds.length) {
          db.prepare(`DELETE FROM tags WHERE id NOT IN (${placeholders})`).run(...coreIds);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      db.prepare('SELECT id FROM prompts').all().forEach((row) => this.reindexPrompt(row.id));
      return this.listTags();
    },
    listPrompts(filters = {}) {
      const clauses = [];
      const params = {};

      if (filters.q) {
        const term = String(filters.q).trim();
        if (term) {
          clauses.push(`(
            p.id IN (
              SELECT prompt_id FROM prompt_search
              WHERE prompt_search MATCH $match
            )
            OR p.title LIKE $like ESCAPE '\\'
            OR p.description LIKE $like ESCAPE '\\'
            OR p.content LIKE $like ESCAPE '\\'
            OR p.use_case LIKE $like ESCAPE '\\'
            OR p.model_hint LIKE $like ESCAPE '\\'
            OR p.id IN (
              SELECT pt.prompt_id
              FROM prompt_tags pt
              INNER JOIN tags t ON t.id = pt.tag_id
              WHERE t.name LIKE $like ESCAPE '\\'
            )
          )`);
          params.match = buildFtsQuery(term);
          params.like = `%${escapeLike(term)}%`;
        }
      }

      if (filters.tag) {
        clauses.push('p.id IN (SELECT prompt_id FROM prompt_tags WHERE tag_id = $tag)');
        params.tag = filters.tag;
      }

      if (filters.sceneId) {
        clauses.push('p.scene_id = $sceneId');
        params.sceneId = filters.sceneId;
      }

      if (filters.useCase) {
        clauses.push('p.use_case = $useCase');
        params.useCase = filters.useCase;
      }

      if (filters.modelHint) {
        clauses.push('p.model_hint = $modelHint');
        params.modelHint = filters.modelHint;
      }

      if (typeof filters.favorite === 'boolean') {
        clauses.push('p.favorite = $favorite');
        params.favorite = boolToInt(filters.favorite);
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = db.prepare(`
        SELECT p.*
        FROM prompts p
        ${where}
        ORDER BY p.is_pinned DESC, p.pinned_at DESC, p.updated_at DESC
      `).all(params);

      return rows.map((row) => this.mapPrompt(row));
    },
    getPrompt(id) {
      const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
      return row ? this.mapPrompt(row) : null;
    },
    createPrompt(input, forcedId) {
      const id = forcedId || createId('prompt');
      const timestamp = nowIso();
      const normalized = normalizePromptInput(input);
      const scene = this.resolveScene(normalized.sceneId, normalized.useCase);
      normalized.sceneId = scene.id;
      normalized.useCase = scene.name;

      const tx = db.prepare(`
        INSERT INTO prompts (
          id, title, description, content, scene_id, use_case, model_hint, favorite, is_pinned, pinned_at,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      tx.run(
        id,
        normalized.title,
        normalized.description,
        normalized.content,
        normalized.sceneId,
        normalized.useCase,
        normalized.modelHint,
        boolToInt(normalized.favorite),
        0,
        '',
        normalized.createdBy,
        timestamp,
        timestamp
      );

      this.setPromptTags(id, normalized.tagIds);
      this.createVersion(id, normalized, timestamp, true);
      this.reindexPrompt(id);
      return this.getPrompt(id);
    },
    updatePrompt(id, input) {
      const existing = this.getPrompt(id);
      if (!existing) {
        return null;
      }

      const timestamp = nowIso();
      const normalized = normalizePromptInput(input, existing);
      const scene = this.resolveScene(normalized.sceneId, normalized.useCase);
      normalized.sceneId = scene.id;
      normalized.useCase = scene.name;
      const versionCreated = hasPromptBodyChanged(existing.content, normalized.content);

      db.prepare(`
        UPDATE prompts
        SET title = ?, description = ?, content = ?, scene_id = ?, use_case = ?, model_hint = ?,
            favorite = ?, created_by = ?, updated_at = ?
        WHERE id = ?
      `).run(
        normalized.title,
        normalized.description,
        normalized.content,
        normalized.sceneId,
        normalized.useCase,
        normalized.modelHint,
        boolToInt(normalized.favorite),
        normalized.createdBy,
        timestamp,
        id
      );

      this.setPromptTags(id, normalized.tagIds);
      if (versionCreated) {
        this.createVersion(id, normalized, timestamp);
      }
      this.reindexPrompt(id);
      return {
        prompt: this.getPrompt(id),
        versionCreated,
        message: versionCreated ? 'Prompt 已保存并生成新版本' : '已保存元信息，Prompt 正文未变化，未创建新版本'
      };
    },
    deletePrompt(id) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM prompt_search WHERE prompt_id = ?').run(id);
        const result = db.prepare('DELETE FROM prompts WHERE id = ?').run(id);
        db.exec('COMMIT');
        return result.changes > 0;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    setFavorite(id, favorite) {
      const prompt = this.getPrompt(id);
      if (!prompt) {
        return null;
      }
      db.prepare('UPDATE prompts SET favorite = ?, updated_at = ? WHERE id = ?').run(boolToInt(favorite), nowIso(), id);
      this.reindexPrompt(id);
      return this.getPrompt(id);
    },
    setPinned(id, isPinned) {
      const prompt = this.getPrompt(id);
      if (!prompt) {
        return null;
      }
      db.prepare('UPDATE prompts SET is_pinned = ?, pinned_at = ?, updated_at = ? WHERE id = ?').run(
        boolToInt(isPinned),
        isPinned ? nowIso() : '',
        nowIso(),
        id
      );
      this.reindexPrompt(id);
      return this.getPrompt(id);
    },
    listVersions(promptId) {
      return db.prepare(`
        SELECT *
        FROM prompt_versions
        WHERE prompt_id = ?
        ORDER BY created_at DESC
      `).all(promptId).map(mapVersionRow);
    },
    getVersion(versionId) {
      const row = db.prepare('SELECT * FROM prompt_versions WHERE id = ?').get(versionId);
      return row ? mapVersionRow(row) : null;
    },
    pinVersion(versionId, isPinned) {
      db.prepare('UPDATE prompt_versions SET is_pinned = ? WHERE id = ?').run(boolToInt(isPinned), versionId);
      return this.getVersion(versionId);
    },
    restoreVersion(promptId, versionId, restoredBy = '本地用户') {
      const version = this.getVersion(versionId);
      if (!version || version.promptId !== promptId) {
        return null;
      }

      const tagIds = version.tags.map((tag) => {
        const existing = this.getTag(tag.id) || this.getTagByName(tag.name);
        if (existing) {
          return existing.id;
        }
        return this.createTag(tag).id;
      });

      return this.updatePrompt(promptId, {
        title: version.title,
        description: version.description,
        content: version.content,
        sceneId: version.sceneId,
        useCase: version.useCase,
        modelHint: version.modelHint,
        favorite: this.getPrompt(promptId)?.favorite || false,
        createdBy: restoredBy,
        tagIds,
        changeNote: `恢复版本：${version.changeNote || version.createdAt}`
      });
    },
    exportPackage() {
      const prompts = this.listPrompts();
      const tags = this.listTags();
      const scenes = this.listScenes();
      const versions = prompts.flatMap((prompt) => this.listVersions(prompt.id));
      return {
        schemaVersion: 2,
        author: 'guochen',
        prompts,
        versions,
        tags,
        scenes,
        exportedAt: nowIso()
      };
    },
    previewImport(pkg) {
      const conflicts = [];
      for (const prompt of pkg.prompts || []) {
        const byId = this.getPrompt(prompt.id);
        if (byId) {
          conflicts.push({ incomingId: prompt.id, title: prompt.title, existingId: byId.id, reason: 'id' });
          continue;
        }
        const byTitle = db.prepare('SELECT id FROM prompts WHERE title = ?').get(prompt.title);
        if (byTitle) {
          conflicts.push({ incomingId: prompt.id, title: prompt.title, existingId: byTitle.id, reason: 'title' });
        }
      }

      return {
        valid: true,
        errors: [],
        promptCount: pkg.prompts?.length || 0,
        versionCount: pkg.versions?.length || 0,
        tagCount: pkg.tags?.length || 0,
        conflicts
      };
    },
    applyImport(pkg, mode = 'skip') {
      const preview = this.previewImport(pkg);
      const skipped = new Set();
      const overwritten = [];
      let importedPrompts = 0;
      let importedTags = 0;
      let importedVersions = 0;

      for (const tag of pkg.tags || []) {
        const existing = this.getTag(tag.id) || this.getTagByName(tag.name);
        if (!existing) {
          this.createTag(tag);
          importedTags += 1;
        }
      }

      for (const scene of pkg.scenes || []) {
        if (!this.getScene(scene.id) && !this.getSceneByName(scene.name)) {
          this.createScene(scene);
        }
      }

      for (const conflict of preview.conflicts) {
        if (mode === 'skip') {
          skipped.add(conflict.incomingId);
        } else {
          this.deletePrompt(conflict.existingId);
          overwritten.push(conflict.existingId);
        }
      }

      for (const prompt of pkg.prompts || []) {
        if (skipped.has(prompt.id)) {
          continue;
        }
        const scene = this.resolveScene(prompt.sceneId, prompt.useCase);
        const tagIds = (prompt.tags || []).map((tag) => {
          const existing = this.getTag(tag.id) || this.getTagByName(tag.name) || this.createTag(tag);
          return existing.id;
        });
        db.prepare(`
          INSERT INTO prompts (
            id, title, description, content, scene_id, use_case, model_hint, favorite, is_pinned, pinned_at,
            created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          prompt.id,
          prompt.title,
          prompt.description || '',
          prompt.content,
          scene.id,
          scene.name,
          prompt.modelHint || '',
          boolToInt(prompt.favorite),
          boolToInt(prompt.isPinned),
          prompt.pinnedAt || '',
          prompt.createdBy || '',
          prompt.createdAt || nowIso(),
          prompt.updatedAt || nowIso()
        );
        this.setPromptTags(prompt.id, tagIds);
        this.reindexPrompt(prompt.id);
        importedPrompts += 1;
      }

      const importedPromptIds = new Set((pkg.prompts || []).filter((prompt) => !skipped.has(prompt.id)).map((prompt) => prompt.id));
      for (const version of pkg.versions || []) {
        if (!importedPromptIds.has(version.promptId)) {
          continue;
        }
        const exists = this.getVersion(version.id);
        if (exists) {
          continue;
        }
        db.prepare(`
          INSERT INTO prompt_versions (
            id, prompt_id, title, description, content, scene_id, use_case, model_hint, tag_snapshot,
            change_note, created_by, created_at, is_pinned
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          version.id,
          version.promptId,
          version.title,
          version.description || '',
          version.content,
          version.sceneId || '',
          version.useCase || '',
          version.modelHint || '',
          JSON.stringify(version.tags || []),
          version.changeNote || '',
          version.createdBy || '',
          version.createdAt || nowIso(),
          boolToInt(version.isPinned)
        );
        importedVersions += 1;
      }

      this.consolidateCoreTags();

      return {
        importedPrompts,
        importedTags,
        importedVersions,
        skippedPrompts: skipped.size,
        overwrittenPrompts: overwritten.length
      };
    },
    createVersion(promptId, input, timestamp = nowIso(), isPinned = false) {
      const tags = this.getPromptTags(input.tagIds || []);
      const id = createId('version');
      db.prepare(`
        INSERT INTO prompt_versions (
          id, prompt_id, title, description, content, scene_id, use_case, model_hint, tag_snapshot,
          change_note, created_by, created_at, is_pinned
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        promptId,
        input.title,
        input.description,
        input.content,
        input.sceneId || '',
        input.useCase,
        input.modelHint,
        JSON.stringify(tags),
        input.changeNote || '更新 Prompt',
        input.createdBy,
        timestamp,
        boolToInt(isPinned)
      );
      return this.getVersion(id);
    },
    setPromptTags(promptId, tagIds) {
      db.prepare('DELETE FROM prompt_tags WHERE prompt_id = ?').run(promptId);
      const insert = db.prepare('INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id) VALUES (?, ?)');
      tagIds.forEach((tagId) => {
        if (this.getTag(tagId)) {
          insert.run(promptId, tagId);
        }
      });
    },
    getPromptTags(tagIds) {
      if (!tagIds?.length) {
        return [];
      }
      return tagIds.map((id) => this.getTag(id)).filter(Boolean);
    },
    tagsForPrompt(promptId) {
      return db.prepare(`
        SELECT t.id, t.name, t.color, t.created_at AS createdAt
        FROM tags t
        INNER JOIN prompt_tags pt ON pt.tag_id = t.id
        WHERE pt.prompt_id = ?
        ORDER BY t.name ASC
      `).all(promptId);
    },
    mapPrompt(row) {
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        content: row.content,
        sceneId: row.scene_id,
        scene: this.getScene(row.scene_id),
        tags: this.tagsForPrompt(row.id),
        useCase: row.use_case,
        modelHint: row.model_hint,
        favorite: intToBool(row.favorite),
        isPinned: intToBool(row.is_pinned),
        pinnedAt: row.pinned_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    },
    reindexPrompt(promptId) {
      const prompt = this.getPrompt(promptId);
      db.prepare('DELETE FROM prompt_search WHERE prompt_id = ?').run(promptId);
      if (!prompt) {
        return;
      }
      db.prepare(`
        INSERT INTO prompt_search (prompt_id, title, description, content, use_case, model_hint, tag_names)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        prompt.id,
        prompt.title,
        prompt.description,
        prompt.content,
        prompt.useCase,
        prompt.modelHint,
        prompt.tags.map((tag) => tag.name).join(' ')
      );
    },
    facets() {
      return {
        tags: this.listTags(),
        useCases: db.prepare('SELECT DISTINCT use_case AS value FROM prompts WHERE use_case != "" ORDER BY use_case').all().map((row) => row.value),
        modelHints: db.prepare('SELECT DISTINCT model_hint AS value FROM prompts WHERE model_hint != "" ORDER BY model_hint').all().map((row) => row.value)
      };
    }
  };

  return store;
}

function normalizePromptInput(input, fallback = {}) {
  const title = (input.title ?? fallback.title ?? '').trim();
  if (!title) {
    throw new Error('标题不能为空');
  }

  const content = (input.content ?? fallback.content ?? '').trim();
  if (!content) {
    throw new Error('Prompt 正文不能为空');
  }

  return {
    title,
    description: (input.description ?? fallback.description ?? '').trim(),
    content,
    sceneId: (input.sceneId ?? fallback.sceneId ?? '').trim(),
    tagIds: Array.isArray(input.tagIds) ? input.tagIds : (fallback.tags || []).map((tag) => tag.id),
    useCase: (input.useCase ?? fallback.useCase ?? '').trim(),
    modelHint: (input.modelHint ?? fallback.modelHint ?? '').trim(),
    favorite: Boolean(input.favorite ?? fallback.favorite ?? false),
    createdBy: (input.createdBy ?? fallback.createdBy ?? '本地用户').trim() || '本地用户',
    changeNote: (input.changeNote ?? '更新 Prompt').trim()
  };
}

function normalizePromptBody(content) {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

function hasPromptBodyChanged(previous, next) {
  return normalizePromptBody(previous) !== normalizePromptBody(next);
}

function mapVersionRow(row) {
  return {
    id: row.id,
    promptId: row.prompt_id,
    title: row.title,
    description: row.description,
    content: row.content,
    sceneId: row.scene_id,
    useCase: row.use_case,
    modelHint: row.model_hint,
    tags: parseJsonArray(row.tag_snapshot),
    changeNote: row.change_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    isPinned: intToBool(row.is_pinned)
  };
}

function buildFtsQuery(term) {
  return term
    .split(/\s+/)
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join(' OR ');
}

function escapeLike(term) {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function tagCoreName(name) {
  const normalized = normalizeTagName(name);
  if (SOURCE_ONLY_TAGS.has(normalized)) {
    return null;
  }
  return TAG_ALIAS_LOOKUP.get(normalized) || null;
}

function normalizeTagName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function normalizeSceneName(name) {
  const normalized = String(name || '').trim();
  if (!normalized || normalized === LEGACY_UNCATEGORIZED_SCENE_NAME) {
    return UNCATEGORIZED_SCENE_NAME;
  }
  return normalized;
}

function sceneIdFromName(name) {
  const normalized = normalizeSceneName(name);
  let hash = 0;
  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `scene_${hash.toString(16)}`;
}

function sceneIcon(name) {
  if (/论文|学术|润色|paper|academic/i.test(name)) return '✦';
  if (/产品|PM|需求|PRD/i.test(name)) return '◆';
  if (/竞品|市场|调研/i.test(name)) return '◇';
  if (/文案|营销|运营/i.test(name)) return '●';
  if (/敏感|内部|评审/i.test(name)) return '◈';
  return '◎';
}

function sceneColor(name) {
  if (/论文|学术|润色|paper|academic/i.test(name)) return '#4f46e5';
  if (/产品|PM|需求|PRD/i.test(name)) return '#246bfe';
  if (/竞品|市场|调研/i.test(name)) return '#0891b2';
  if (/文案|营销|运营/i.test(name)) return '#10a37f';
  if (/敏感|内部|评审/i.test(name)) return '#d1495b';
  return '#64748b';
}

function sceneDescription(name) {
  if (/论文|学术|润色|paper|academic/i.test(name)) return '论文润色、摘要优化、审稿回复等学术写作场景';
  if (/产品|PM|需求|PRD/i.test(name)) return 'AI 产品经理的需求、方案、评审与表达场景';
  if (/竞品|市场|调研/i.test(name)) return '竞品分析、行业调研和信息结构化场景';
  if (/文案|营销|运营/i.test(name)) return '内容生成、营销表达和运营策划场景';
  if (/敏感|内部|评审/i.test(name)) return '适合本地保存的内部敏感 Prompt';
  return `${name} 场景下的 Prompt 资产`;
}
