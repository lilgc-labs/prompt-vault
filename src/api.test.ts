import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';

describe('api client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not send a JSON content type for bodyless DELETE requests', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.deletePrompt('prompt_to_delete');

    const [, init] = fetchMock.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit?];
    const headers = init?.headers as Record<string, string>;
    expect(init?.method).toBe('DELETE');
    expect(headers?.['Content-Type']).toBeUndefined();
  });
});
