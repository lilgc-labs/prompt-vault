import path from 'node:path';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { validatePackage } from './importValidation.js';

export async function buildApp(store, options = {}) {
  const app = Fastify({
    logger: options.logger ?? false
  });

  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode || 500;
    reply.status(status).send({
      error: status === 500 ? '服务器内部错误' : error.message,
      detail: error.message
    });
  });

  app.get('/api/health', async () => ({
    ok: true,
    storage: 'local-sqlite'
  }));

  app.get('/api/facets', async () => store.facets());

  app.get('/api/scenes', async () => store.listScenes());

  app.post('/api/scenes', async (request, reply) => {
    const scene = store.createScene(request.body || {});
    reply.code(201);
    return scene;
  });

  app.put('/api/scenes/:id', async (request, reply) => {
    const scene = store.updateScene(request.params.id, request.body || {});
    if (!scene) {
      reply.code(404);
      return { error: '场景不存在' };
    }
    return scene;
  });

  app.delete('/api/scenes/:id', async (request, reply) => {
    const deleted = store.deleteScene(request.params.id);
    reply.code(deleted ? 204 : 404);
  });

  app.get('/api/tags', async () => store.listTags());

  app.post('/api/tags', async (request, reply) => {
    const tag = store.createTag(request.body || {});
    reply.code(201);
    return tag;
  });

  app.delete('/api/tags/:id', async (request, reply) => {
    store.deleteTag(request.params.id);
    reply.code(204);
  });

  app.get('/api/prompts', async (request) => {
    const query = request.query || {};
    return store.listPrompts({
      q: query.q,
      sceneId: query.sceneId,
      tag: query.tag,
      useCase: query.useCase,
      modelHint: query.modelHint,
      favorite: query.favorite === 'true' ? true : query.favorite === 'false' ? false : undefined
    });
  });

  app.post('/api/prompts', async (request, reply) => {
    const prompt = store.createPrompt(request.body || {});
    reply.code(201);
    return prompt;
  });

  app.get('/api/prompts/:id', async (request, reply) => {
    const prompt = store.getPrompt(request.params.id);
    if (!prompt) {
      reply.code(404);
      return { error: 'Prompt 不存在' };
    }
    return prompt;
  });

  app.put('/api/prompts/:id', async (request, reply) => {
    const prompt = store.updatePrompt(request.params.id, request.body || {});
    if (!prompt) {
      reply.code(404);
      return { error: 'Prompt 不存在' };
    }
    return prompt;
  });

  app.delete('/api/prompts/:id', async (request, reply) => {
    const deleted = store.deletePrompt(request.params.id);
    reply.code(deleted ? 204 : 404);
  });

  app.patch('/api/prompts/:id/favorite', async (request, reply) => {
    const prompt = store.setFavorite(request.params.id, Boolean(request.body?.favorite));
    if (!prompt) {
      reply.code(404);
      return { error: 'Prompt 不存在' };
    }
    return prompt;
  });

  app.patch('/api/prompts/:id/pin', async (request, reply) => {
    const prompt = store.setPinned(request.params.id, Boolean(request.body?.isPinned));
    if (!prompt) {
      reply.code(404);
      return { error: 'Prompt 不存在' };
    }
    return prompt;
  });

  app.get('/api/prompts/:id/versions', async (request, reply) => {
    if (!store.getPrompt(request.params.id)) {
      reply.code(404);
      return { error: 'Prompt 不存在' };
    }
    return store.listVersions(request.params.id);
  });

  app.patch('/api/versions/:id/pin', async (request, reply) => {
    const version = store.pinVersion(request.params.id, Boolean(request.body?.isPinned));
    if (!version) {
      reply.code(404);
      return { error: '版本不存在' };
    }
    return version;
  });

  app.post('/api/prompts/:id/restore/:versionId', async (request, reply) => {
    const prompt = store.restoreVersion(request.params.id, request.params.versionId, request.body?.restoredBy);
    if (!prompt) {
      reply.code(404);
      return { error: '版本不存在或不属于当前 Prompt' };
    }
    return prompt;
  });

  app.post('/api/export', async () => store.exportPackage());

  app.post('/api/import/preview', async (request, reply) => {
    const validation = validatePackage(request.body);
    if (!validation.valid) {
      reply.code(400);
      return validation;
    }
    return store.previewImport(request.body);
  });

  app.post('/api/import/apply', async (request, reply) => {
    const pkg = request.body?.package;
    const mode = request.body?.mode === 'overwrite' ? 'overwrite' : 'skip';
    const validation = validatePackage(pkg);
    if (!validation.valid) {
      reply.code(400);
      return validation;
    }
    return store.applyImport(pkg, mode);
  });

  if (options.serveStatic) {
    app.register(fastifyStatic, {
      root: path.resolve(options.staticRoot || path.resolve(process.cwd(), 'dist')),
      prefix: '/'
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/')) {
        reply.code(404).send({ error: 'API 不存在' });
        return;
      }
      reply.sendFile('index.html');
    });
  }

  return app;
}
