import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import {
  Archive,
  BadgeCheck,
  BookOpen,
  Copy,
  Download,
  FileDiff,
  Grid2X2,
  Heart,
  History,
  Import,
  List,
  Moon,
  PencilLine,
  Pin,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Star,
  Sun,
  Tags,
  Trash2,
  Upload,
  WandSparkles
} from 'lucide-react';
import { api } from './api';
import type {
  ExportPackage,
  ImportMode,
  ImportPreview,
  Prompt,
  PromptInput,
  PromptQuality,
  PromptVersion,
  Scene,
  Tag
} from './shared/types';
import {
  computePromptQuality,
  createDiffLines,
  createSearchSnippet,
  hasComparableVersions,
  normalizePromptBody,
  splitHighlightedText
} from './shared/promptUtils';

const AUTHOR = 'guochen';
const UNCATEGORIZED_SCENE_NAME = '未分组 Prompt';

const BLANK_FORM: PromptInput = {
  title: '',
  description: '',
  content: '',
  sceneId: '',
  tagIds: [],
  useCase: '',
  modelHint: '',
  favorite: false,
  createdBy: AUTHOR,
  changeNote: '创建 Prompt'
};

const SCENE_COLORS = ['#246bfe', '#4f46e5', '#0891b2', '#10a37f', '#d1495b', '#f59e0b'];
const SCENE_ICONS = ['✦', '◆', '◇', '●', '◈', '◎'];

export function App() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [screen, setScreen] = useState<'detail' | 'edit' | 'share'>('detail');
  const [form, setForm] = useState<PromptInput>(BLANK_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [compareIds, setCompareIds] = useState<[string, string]>(['', '']);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [importPackage, setImportPackage] = useState<ExportPackage | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('skip');
  const [sceneDialogOpen, setSceneDialogOpen] = useState(false);
  const [sceneName, setSceneName] = useState('');

  const selectedPrompt = prompts.find((prompt) => prompt.id === selectedId) || prompts[0] || null;
  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId) || null;
  const activeQuality = useMemo(
    () => computePromptQuality(screen === 'edit' ? form.content : selectedPrompt?.content || ''),
    [form.content, screen, selectedPrompt?.content]
  );
  const canCompareVersions = hasComparableVersions(versions);
  const firstCompare = versions.find((version) => version.id === compareIds[0]);
  const secondCompare = versions.find((version) => version.id === compareIds[1]);
  const diffLines = useMemo(
    () => createDiffLines(firstCompare?.content || '', secondCompare?.content || ''),
    [firstCompare?.content, secondCompare?.content]
  );

  async function loadData(
    nextSelectedId = selectedId,
    sceneOverride = selectedSceneId,
    queryOverride = query,
    tagOverride = selectedTag,
    favoriteOverride = favoriteOnly
  ) {
    const [sceneList, tagList, promptList] = await Promise.all([
      api.scenes(),
      api.tags(),
      api.prompts({
        q: queryOverride,
        sceneId: sceneOverride,
        tag: tagOverride,
        favorite: favoriteOverride ? true : undefined
      })
    ]);
    setScenes(sceneList);
    setTags(tagList);
    setPrompts(promptList);
    const safeId = nextSelectedId || promptList[0]?.id || '';
    setSelectedId(promptList.some((prompt) => prompt.id === safeId) ? safeId : promptList[0]?.id || '');
  }

  useEffect(() => {
    loadData().catch((error) => setToast(error.message));
  }, [query, selectedSceneId, selectedTag, favoriteOnly]);

  useEffect(() => {
    if (!selectedPrompt) {
      setVersions([]);
      return;
    }
    api.versions(selectedPrompt.id)
      .then((list) => {
        setVersions(list);
        const latest = list[0];
        const previousDifferent = latest
          ? list.find((version) => version.id !== latest.id && normalizePromptBody(version.content) !== normalizePromptBody(latest.content))
          : undefined;
        setCompareIds([previousDifferent?.id || '', latest?.id || '']);
      })
      .catch((error) => setToast(error.message));
  }, [selectedPrompt?.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function startCreate() {
    setEditingId(null);
    setForm({
      ...BLANK_FORM,
      sceneId: selectedSceneId || scenes[0]?.id || '',
      useCase: selectedScene?.name || scenes[0]?.name || '',
      createdBy: AUTHOR,
      changeNote: '创建 Prompt'
    });
    setScreen('edit');
  }

  function startEdit(prompt: Prompt) {
    setEditingId(prompt.id);
    setForm({
      title: prompt.title,
      description: prompt.description,
      content: prompt.content,
      sceneId: prompt.sceneId,
      tagIds: prompt.tags.map((tag) => tag.id),
      useCase: prompt.scene?.name || prompt.useCase,
      modelHint: prompt.modelHint,
      favorite: prompt.favorite,
      createdBy: prompt.createdBy || AUTHOR,
      changeNote: '优化 Prompt'
    });
    setScreen('edit');
  }

  async function savePrompt() {
    setBusy(true);
    try {
      if (editingId) {
        const result = await api.updatePrompt(editingId, form);
        setSelectedSceneId(result.prompt.sceneId);
        setQuery('');
        await loadData(result.prompt.id, result.prompt.sceneId, '');
        setSelectedId(result.prompt.id);
        setToast(result.message);
      } else {
        const created = await api.createPrompt(form);
        setSelectedSceneId(created.sceneId);
        setQuery('');
        await loadData(created.id, created.sceneId, '');
        setSelectedId(created.id);
        setToast('Prompt 已创建并生成初始版本');
      }
      setEditingId(null);
      setScreen('detail');
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(prompt: Prompt) {
    const updated = await api.setFavorite(prompt.id, !prompt.favorite);
    await loadData(updated.id);
  }

  async function removePromptSafely(prompt: Prompt) {
    if (!window.confirm(`删除「${prompt.title}」及其版本历史？`)) return;
    try {
      await api.deletePrompt(prompt.id);
      await loadData('');
      setScreen('detail');
      setToast('Prompt 已删除');
    } catch (error) {
      setToast((error as Error).message);
    }
  }

  async function togglePinned(prompt: Prompt) {
    const updated = await api.setPinned(prompt.id, !prompt.isPinned);
    await loadData(updated.id);
  }

  async function restore(version: PromptVersion) {
    if (!selectedPrompt) return;
    const result = await api.restoreVersion(selectedPrompt.id, version.id);
    await loadData(result.prompt.id, result.prompt.sceneId);
    setToast(result.message);
  }

  function addScene() {
    setSceneName('');
    setSceneDialogOpen(true);
  }

  async function submitScene(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = sceneName.trim();
    if (!name) return;

    try {
      const index = scenes.length % SCENE_COLORS.length;
      const scene = await api.createScene({
        name,
        description: `${name} 场景下的 Prompt 资产`,
        icon: SCENE_ICONS[index],
        color: SCENE_COLORS[index]
      });
      setSelectedSceneId(scene.id);
      await loadData('', scene.id);
      setSceneDialogOpen(false);
      setSceneName('');
      setToast('场景已创建');
    } catch (error) {
      setToast((error as Error).message);
    }
  }

  async function deleteScene(scene: Scene) {
    if (scene.name === UNCATEGORIZED_SCENE_NAME) {
      setToast('未分组 Prompt 是系统默认分组，不能删除');
      return;
    }
    const confirmed = window.confirm(`删除场景「${scene.name}」？该场景下的 Prompt 将移动到「${UNCATEGORIZED_SCENE_NAME}」。`);
    if (!confirmed) return;

    try {
      await api.deleteScene(scene.id);
      const sceneList = await api.scenes();
      const fallback = sceneList.find((item) => item.name === UNCATEGORIZED_SCENE_NAME);
      const nextSceneId = fallback?.id || '';
      setScenes(sceneList);
      setSelectedSceneId(nextSceneId);
      setSelectedTag('');
      setQuery('');
      setFavoriteOnly(false);
      await loadData('', nextSceneId, '', '', false);
      setScreen('detail');
      setToast(`场景已删除，Prompt 已移动到「${UNCATEGORIZED_SCENE_NAME}」`);
    } catch (error) {
      setToast((error as Error).message);
    }
  }

  async function copyText(text: string, success = '已复制到剪贴板') {
    await navigator.clipboard.writeText(text);
    setToast(success);
  }

  async function exportData() {
    const pkg = await api.exportPackage();
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prompt-vault-guochen-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setToast('分享包已生成，作者信息 guochen 已写入导出元数据');
  }

  async function handleImportFile(file: File) {
    const text = await file.text();
    const parsed = JSON.parse(text) as ExportPackage;
    const preview = await api.previewImport(parsed);
    setImportPackage(parsed);
    setImportPreview(preview);
  }

  async function applyImport() {
    if (!importPackage) return;
    const result = await api.applyImport(importPackage, importMode);
    await loadData();
    setToast(`导入完成：${result.importedPrompts} 个 Prompt，${result.skippedPrompts} 个跳过`);
  }

  return (
    <div className={darkMode ? 'app-shell refined dark' : 'app-shell refined'}>
      <header className="global-topbar">
        <div className="brand-block">
          <div className="brand-glyph" aria-hidden="true">
            <svg viewBox="0 0 44 44" role="img">
              <path d="M12 17.5h20a5 5 0 0 1 5 5v11H7v-11a5 5 0 0 1 5-5Z" />
              <path d="M14.5 18v-2.5a7.5 7.5 0 0 1 15 0V18" />
              <path d="M16 27h12" />
              <path d="M16 32h7" />
            </svg>
          </div>
          <div>
            <strong>Prompt Vault</strong>
            <span>Local-first workspace by {AUTHOR}</span>
          </div>
        </div>

        <div className="global-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索场景、论文润色、PRD、提示词..." />
        </div>

        <nav className="top-actions" aria-label="全局操作">
          <button onClick={() => setScreen('share')}>
            <Upload size={16} />
            导入/导出
          </button>
          <button onClick={startCreate} className="primary-action">
            <Plus size={16} />
            新建
          </button>
          <span className="author-chip">作者：{AUTHOR}</span>
          <button className="icon-only" onClick={() => setDarkMode((current) => !current)} aria-label="切换主题">
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </nav>
      </header>

      <main className={viewMode === 'list' ? 'studio-layout focus-mode' : 'studio-layout'}>
        <SceneRail
          scenes={scenes}
          selectedSceneId={selectedSceneId}
          selectedTag={selectedTag}
          tags={tags}
          favoriteOnly={favoriteOnly}
          onSelectScene={(sceneId) => {
            setSelectedSceneId(sceneId);
            setScreen('detail');
          }}
          onSelectTag={setSelectedTag}
          onToggleFavorite={() => setFavoriteOnly((current) => !current)}
          onAddScene={addScene}
          onDeleteScene={deleteScene}
        />

        {viewMode === 'grid' ? (
          <PromptCollection
            prompts={prompts}
            scene={selectedScene}
            selectedPrompt={selectedPrompt}
            query={query}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onSelect={(prompt) => {
              setSelectedId(prompt.id);
              setScreen('detail');
            }}
            onCreate={startCreate}
          />
        ) : null}

        <section className="workspace-panel">
          {viewMode === 'list' ? (
            <div className="focus-toolbar">
              <div>
                <span>专注模式</span>
                <strong>{selectedPrompt?.title || selectedScene?.name || 'Prompt 工作区'}</strong>
              </div>
              <ViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
            </div>
          ) : null}
          {screen === 'share' ? (
            <SharePanel
              importPreview={importPreview}
              importMode={importMode}
              setImportMode={setImportMode}
              onExport={exportData}
              onImportFile={handleImportFile}
              onApplyImport={applyImport}
            />
          ) : screen === 'edit' ? (
            <EditorView
              form={form}
              setForm={setForm}
              scenes={scenes}
              tags={tags}
              quality={activeQuality}
              busy={busy}
              onCancel={() => setScreen('detail')}
              onSave={savePrompt}
            />
          ) : selectedPrompt ? (
            <PromptWorkspace
              prompt={selectedPrompt}
              versions={versions}
              quality={activeQuality}
              canCompareVersions={canCompareVersions}
              compareIds={compareIds}
              setCompareIds={setCompareIds}
              diffLines={diffLines}
              firstCompare={firstCompare}
              secondCompare={secondCompare}
              onCopy={copyText}
              onEdit={() => startEdit(selectedPrompt)}
              onDelete={() => removePromptSafely(selectedPrompt)}
              onFavorite={() => toggleFavorite(selectedPrompt)}
              onPinPrompt={() => togglePinned(selectedPrompt)}
              onRestore={restore}
              onPin={async (version) => {
                await api.pinVersion(version.id, !version.isPinned);
                setVersions(await api.versions(selectedPrompt.id));
              }}
            />
          ) : (
            <div className="empty-workspace">
              <Archive size={34} />
              <h2>开始沉淀你的 Prompt 工作台</h2>
              <p>先建立一个场景，再把论文润色、产品需求、竞品分析等 Prompt 放进去。</p>
              <button className="primary-action" onClick={startCreate}>
                <Plus size={16} />
                新建 Prompt
              </button>
            </div>
          )}
        </section>
      </main>

      {sceneDialogOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="scene-dialog" role="dialog" aria-modal="true" aria-labelledby="scene-dialog-title" onSubmit={submitScene}>
            <div className="dialog-heading">
              <span>场景工作台</span>
              <strong id="scene-dialog-title">新建场景</strong>
            </div>
            <label>
              <span>场景名称</span>
              <input
                autoFocus
                value={sceneName}
                onChange={(event) => setSceneName(event.target.value)}
                placeholder="例如：论文润色"
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setSceneDialogOpen(false);
                  setSceneName('');
                }}
              >
                取消
              </button>
              <button className="primary-action" type="submit" disabled={!sceneName.trim()}>
                创建场景
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function SceneRail({
  scenes,
  selectedSceneId,
  selectedTag,
  tags,
  favoriteOnly,
  onSelectScene,
  onSelectTag,
  onToggleFavorite,
  onAddScene,
  onDeleteScene
}: {
  scenes: Scene[];
  selectedSceneId: string;
  selectedTag: string;
  tags: Tag[];
  favoriteOnly: boolean;
  onSelectScene: (sceneId: string) => void;
  onSelectTag: (tagId: string) => void;
  onToggleFavorite: () => void;
  onAddScene: () => void;
  onDeleteScene: (scene: Scene) => void;
}) {
  const total = scenes.reduce((sum, scene) => sum + scene.promptCount, 0);

  return (
    <aside className="scene-rail">
      <div className="rail-header">
        <div>
          <span>场景工作台</span>
          <strong>{total} 个 Prompt</strong>
        </div>
        <button className="icon-only filled" onClick={onAddScene} aria-label="新增场景">
          <Plus size={16} />
        </button>
      </div>

      <button className={selectedSceneId === '' ? 'scene-card active' : 'scene-card'} onClick={() => onSelectScene('')}>
        <i style={{ background: '#17202e' }}>◎</i>
        <div>
          <strong>全部场景</strong>
          <span>跨论文、产品与创作工作流</span>
        </div>
        <em>{total}</em>
      </button>

      {scenes.map((scene) => {
        const isSystemScene = scene.name === UNCATEGORIZED_SCENE_NAME;
        return (
          <div key={scene.id} className={selectedSceneId === scene.id ? 'scene-card-row active' : 'scene-card-row'}>
            <button className="scene-card" onClick={() => onSelectScene(scene.id)}>
              <i style={{ background: scene.color }}>{scene.icon}</i>
              <div>
                <strong>{scene.name}</strong>
                <span>{scene.description}</span>
              </div>
              <em>{scene.promptCount}</em>
            </button>
            {!isSystemScene ? (
              <button className="scene-delete-button" onClick={() => onDeleteScene(scene)} aria-label={`删除场景 ${scene.name}`}>
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        );
      })}

      <div className="rail-divider" />
      <button className={favoriteOnly ? 'soft-filter active' : 'soft-filter'} onClick={onToggleFavorite}>
        <Heart size={15} />
        收藏模板
      </button>

      <div className="tag-cloud">
        <div className="mini-title">
          <Tags size={14} />
          交叉标签
        </div>
        {tags.map((tag) => (
          <button
            key={tag.id}
            className={selectedTag === tag.id ? 'tag-pill active' : 'tag-pill'}
            onClick={() => onSelectTag(selectedTag === tag.id ? '' : tag.id)}
          >
            <span style={{ background: tag.color }} />
            {tag.name}
          </button>
        ))}
      </div>

      <div className="local-note">
        <ShieldCheck size={16} />
        <p>Local-first prompt workspace by {AUTHOR}. 数据默认保存在本地 SQLite。</p>
      </div>
    </aside>
  );
}

function PromptCollection({
  prompts,
  scene,
  selectedPrompt,
  query,
  viewMode,
  onViewModeChange,
  onSelect,
  onCreate
}: {
  prompts: Prompt[];
  scene: Scene | null;
  selectedPrompt: Prompt | null;
  query: string;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onSelect: (prompt: Prompt) => void;
  onCreate: () => void;
}) {
  return (
    <section className="collection-panel">
      <div className="collection-header">
        <div>
          <span>{scene ? scene.name : '全部 Prompt'}</span>
          <h1>{scene ? scene.description : '驱动高效工作与日常创作的 Prompt 资产库'}</h1>
          <p>{prompts.length} 个结果，按最近更新排序</p>
        </div>
        <ViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
      </div>

      <div className={viewMode === 'grid' ? 'prompt-board grid' : 'prompt-board list'}>
        {prompts.map((prompt) => (
          <PromptCard
            key={prompt.id}
            prompt={prompt}
            active={selectedPrompt?.id === prompt.id}
            mode={viewMode}
            query={query}
            onSelect={() => onSelect(prompt)}
          />
        ))}

        <button className="new-prompt-card" onClick={onCreate}>
          <Plus size={18} />
          <strong>新建 Prompt</strong>
          <span>从当前场景快速沉淀一条新模板</span>
        </button>
      </div>
    </section>
  );
}

function ViewToggle({
  viewMode,
  onViewModeChange
}: {
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}) {
  return (
    <div className="view-toggle" aria-label="切换工作区视图">
      <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => onViewModeChange('grid')} aria-label="完整视图">
        <Grid2X2 size={16} />
      </button>
      <button className={viewMode === 'list' ? 'active' : ''} onClick={() => onViewModeChange('list')} aria-label="专注视图">
        <List size={16} />
      </button>
    </div>
  );
}

function PromptCard({
  prompt,
  active,
  mode,
  query,
  onSelect
}: {
  prompt: Prompt;
  active: boolean;
  mode: 'grid' | 'list';
  query: string;
  onSelect: () => void;
}) {
  const quality = computePromptQuality(prompt.content);
  const snippet = createSearchSnippet(prompt, query);

  return (
    <button className={active ? `prompt-card ${mode} active` : `prompt-card ${mode}`} onClick={onSelect}>
      <div className="card-topline">
        <span>{prompt.scene?.icon || '◎'} {prompt.scene?.name || prompt.useCase || '未分类'}</span>
        <span className="card-flags">
          {prompt.isPinned ? <Pin size={14} fill="currentColor" /> : null}
          {prompt.favorite ? <Star size={15} fill="currentColor" /> : null}
        </span>
      </div>
      <h2>
        <HighlightedText text={prompt.title} query={query} />
      </h2>
      <p>
        <HighlightedText text={snippet.text} query={query} />
      </p>
      <div className="card-meta">
        <QualityBadge quality={quality} compact />
        {prompt.modelHint ? <span>{prompt.modelHint}</span> : null}
      </div>
      <div className="card-tags">
        {prompt.tags.slice(0, 3).map((tag) => (
          <span key={tag.id} style={{ borderColor: tag.color }}>
            {tag.name}
          </span>
        ))}
      </div>
    </button>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitHighlightedText(text, query).map((part, index) =>
        part.highlighted ? <mark key={`${part.text}-${index}`}>{part.text}</mark> : <span key={`${part.text}-${index}`}>{part.text}</span>
      )}
    </>
  );
}

function EditorView({
  form,
  setForm,
  scenes,
  tags,
  quality,
  busy,
  onCancel,
  onSave
}: {
  form: PromptInput;
  setForm: Dispatch<SetStateAction<PromptInput>>;
  scenes: Scene[];
  tags: Tag[];
  quality: PromptQuality;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const selectedScene = scenes.find((scene) => scene.id === form.sceneId);

  return (
    <div className="editor-layout">
      <section className="editor-main">
        <div className="workspace-title">
          <div>
            <span>Prompt 编辑器</span>
            <h2>{form.title || '未命名 Prompt'}</h2>
          </div>
          <div className="inline-actions">
            <button onClick={onCancel}>取消</button>
            <button className="primary-action" onClick={onSave} disabled={busy}>
              <Save size={16} />
              保存
            </button>
          </div>
        </div>

        <div className="form-grid">
          <label>
            <span>标题</span>
            <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            <span>场景</span>
            <select
              value={form.sceneId || ''}
              onChange={(event) => {
                const scene = scenes.find((item) => item.id === event.target.value);
                setForm((current) => ({ ...current, sceneId: event.target.value, useCase: scene?.name || current.useCase }));
              }}
            >
              <option value="">未分类</option>
              {scenes.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="wide-field">
          <span>描述</span>
          <input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
        </label>

        <div className="form-grid">
          <label>
            <span>模型建议</span>
            <input value={form.modelHint} onChange={(event) => setForm((current) => ({ ...current, modelHint: event.target.value }))} />
          </label>
          <label>
            <span>修改说明</span>
            <input value={form.changeNote} onChange={(event) => setForm((current) => ({ ...current, changeNote: event.target.value }))} />
          </label>
        </div>

        <label className="prompt-editor-box">
          <div>
            <span>Prompt 正文</span>
            <em>{form.content.length} 字符</em>
          </div>
          <textarea
            value={form.content}
            onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
            placeholder="你是... 请基于 {{输入}} 输出..."
          />
        </label>
      </section>

      <aside className="insight-rail">
        <QualityBadge quality={quality} />
        <div className="insight-card">
          <div className="mini-title">
            <BookOpen size={15} />
            当前场景
          </div>
          <strong>{selectedScene?.name || '未分类'}</strong>
          <p>{selectedScene?.description || '可以稍后补充场景说明。'}</p>
        </div>
        <div className="insight-card">
          <div className="mini-title">
            <Tags size={15} />
            标签
          </div>
          <div className="editable-tags">
            {tags.map((tag) => (
              <button
                key={tag.id}
                className={form.tagIds.includes(tag.id) ? 'tag-pill active' : 'tag-pill'}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    tagIds: current.tagIds.includes(tag.id)
                      ? current.tagIds.filter((id) => id !== tag.id)
                      : [...current.tagIds, tag.id]
                  }))
                }
              >
                <span style={{ background: tag.color }} />
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function PromptWorkspace({
  prompt,
  versions,
  quality,
  canCompareVersions,
  compareIds,
  setCompareIds,
  diffLines,
  firstCompare,
  secondCompare,
  onCopy,
  onEdit,
  onDelete,
  onFavorite,
  onPinPrompt,
  onRestore,
  onPin
}: {
  prompt: Prompt;
  versions: PromptVersion[];
  quality: PromptQuality;
  canCompareVersions: boolean;
  compareIds: [string, string];
  setCompareIds: Dispatch<SetStateAction<[string, string]>>;
  diffLines: ReturnType<typeof createDiffLines>;
  firstCompare?: PromptVersion;
  secondCompare?: PromptVersion;
  onCopy: (text: string, success?: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onFavorite: () => void;
  onPinPrompt: () => void;
  onRestore: (version: PromptVersion) => void;
  onPin: (version: PromptVersion) => void;
}) {
  return (
    <div className="detail-layout">
      <section className="detail-main">
        <div className="workspace-title">
          <div>
            <span>{prompt.scene?.name || prompt.useCase || '未分类'} · 更新于 {new Date(prompt.updatedAt).toLocaleDateString()}</span>
            <h2>{prompt.title}</h2>
            <p>{prompt.description || '还没有描述。'}</p>
          </div>
          <div className="inline-actions">
            <button className="icon-only" onClick={onFavorite} aria-label="收藏">
              <Heart size={17} fill={prompt.favorite ? 'currentColor' : 'none'} />
            </button>
            <button className="icon-only" onClick={onPinPrompt} aria-label="置顶">
              <Pin size={17} fill={prompt.isPinned ? 'currentColor' : 'none'} />
            </button>
            <button onClick={onEdit}>
              <PencilLine size={16} />
              编辑
            </button>
            <button className="danger-action" onClick={onDelete}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div className="prompt-content-box">
          <div className="section-toolbar">
            <strong>Prompt 正文</strong>
            <button onClick={() => onCopy(prompt.content)}>
              <Copy size={15} />
              复制
            </button>
          </div>
          <pre>{prompt.content}</pre>
        </div>

        {canCompareVersions && firstCompare && secondCompare ? <div className="diff-card">
          <div className="section-toolbar">
            <strong>
              <FileDiff size={16} />
              版本对比
            </strong>
          </div>
          <div className="compare-selects">
            <select value={compareIds[0]} onChange={(event) => setCompareIds([event.target.value, compareIds[1]])}>
              {versions.map((version) => (
                <option value={version.id} key={version.id}>
                  {version.changeNote || version.createdAt}
                </option>
              ))}
            </select>
            <select value={compareIds[1]} onChange={(event) => setCompareIds([compareIds[0], event.target.value])}>
              {versions.map((version) => (
                <option value={version.id} key={version.id}>
                  {version.changeNote || version.createdAt}
                </option>
              ))}
            </select>
          </div>
          <div className="diff-list">
            {diffLines.map((line) => (
              <div className={line.changed ? 'diff-line changed' : 'diff-line'} key={line.line}>
                <span>{line.line}</span>
                <code>{line.changed ? line.oldLine || '∅' : line.newLine}</code>
                {line.changed ? <code>{line.newLine || '∅'}</code> : null}
              </div>
            ))}
          </div>
          <p className="muted-copy">
            对比：{firstCompare?.changeNote || '版本 A'} → {secondCompare?.changeNote || '版本 B'}
          </p>
        </div> : null}
      </section>

      <aside className="insight-rail">
        <QualityBadge quality={quality} />
        <div className="insight-card">
          <div className="mini-title">
            <Tags size={15} />
            标签
          </div>
          <div className="readonly-tags">
            {prompt.tags.map((tag) => (
              <span key={tag.id} style={{ borderColor: tag.color }}>
                {tag.name}
              </span>
            ))}
          </div>
        </div>
        <div className="insight-card">
          <div className="mini-title">
            <History size={15} />
            版本历史
          </div>
          <div className="version-stack">
            {versions.map((version) => (
              <div key={version.id} className={version.isPinned ? 'version-item pinned' : 'version-item'}>
                <div>
                  <strong>{version.changeNote || '更新 Prompt'}</strong>
                  <span>{new Date(version.createdAt).toLocaleString()} · {version.createdBy || AUTHOR}</span>
                </div>
                <div>
                  <button className="icon-only" onClick={() => onPin(version)} aria-label="标记版本">
                    <Star size={15} fill={version.isPinned ? 'currentColor' : 'none'} />
                  </button>
                  <button className="icon-only" onClick={() => onRestore(version)} aria-label="恢复版本">
                    <RotateCcw size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function QualityBadge({ quality, compact = false }: { quality: PromptQuality; compact?: boolean }) {
  return (
    <div className={compact ? 'quality-badge compact' : 'quality-badge'}>
      <div className="quality-face">
        <BadgeCheck size={compact ? 13 : 17} />
        <span>{quality.level}</span>
        {!compact ? <em>{quality.score}</em> : null}
      </div>
      {!compact ? (
        <div className="quality-checks">
          {quality.checks.map((check) => (
            <p key={check.key} className={check.passed ? 'passed' : ''}>
              <WandSparkles size={13} />
              {check.label}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SharePanel({
  importPreview,
  importMode,
  setImportMode,
  onExport,
  onImportFile,
  onApplyImport
}: {
  importPreview: ImportPreview | null;
  importMode: ImportMode;
  setImportMode: (mode: ImportMode) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onApplyImport: () => void;
}) {
  return (
    <div className="share-panel">
      <div className="workspace-title">
        <div>
          <span>本地分享</span>
          <h2>导入 / 导出</h2>
          <p>分享包会包含 scenes、tags、versions，并写入作者 guochen。</p>
        </div>
      </div>
      <div className="share-grid">
        <div className="share-box">
          <Download size={24} />
          <h3>导出工作台</h3>
          <p>生成本地 JSON 分享包，适合在设备或小团队之间传递 Prompt 资产。</p>
          <button className="primary-action" onClick={onExport}>
            <Download size={16} />
            生成导出包
          </button>
        </div>
        <div className="share-box">
          <Import size={24} />
          <h3>导入资产包</h3>
          <p>支持 v1 和 v2 分享包。导入前会预览数量和冲突。</p>
          <label className="file-drop">
            选择 JSON 文件
            <input
              type="file"
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImportFile(file);
              }}
            />
          </label>
        </div>
      </div>
      {importPreview ? (
        <div className="import-preview">
          <div className="preview-stats">
            <span>{importPreview.promptCount} Prompts</span>
            <span>{importPreview.versionCount} Versions</span>
            <span>{importPreview.tagCount} Tags</span>
            <span>{importPreview.conflicts.length} Conflicts</span>
          </div>
          <div className="inline-actions">
            <button className={importMode === 'skip' ? 'segmented active' : 'segmented'} onClick={() => setImportMode('skip')}>
              跳过重复
            </button>
            <button className={importMode === 'overwrite' ? 'segmented active' : 'segmented'} onClick={() => setImportMode('overwrite')}>
              覆盖重复
            </button>
            <button className="primary-action" onClick={onApplyImport}>
              <Upload size={16} />
              确认导入
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
