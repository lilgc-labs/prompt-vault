import { describe, expect, it } from 'vitest';
import {
  computePromptQuality,
  createDiffLines,
  createSearchSnippet,
  hasComparableVersions,
  hasPromptBodyChanged
} from './promptUtils';

describe('prompt utilities', () => {
  it('creates line diffs', () => {
    expect(createDiffLines('a\nb', 'a\nc')).toEqual([
      { line: 1, oldLine: 'a', newLine: 'a', changed: false },
      { line: 2, oldLine: 'b', newLine: 'c', changed: true }
    ]);
  });

  it('ignores line ending and trailing whitespace when comparing prompt bodies', () => {
    expect(hasPromptBodyChanged('hello\r\nworld  ', 'hello\nworld')).toBe(false);
    expect(hasPromptBodyChanged('hello\nworld', 'hello\nthere')).toBe(true);
  });

  it('builds a content snippet around search matches when the description does not match', () => {
    const snippet = createSearchSnippet(
      {
        title: 'Academic polish',
        description: 'Improve a paper draft.',
        content: 'First line without the term.\nThe reviewer should check logic and contribution carefully.'
      },
      'logic',
      42
    );

    expect(snippet.matched).toBe(true);
    expect(snippet.source).toBe('content');
    expect(snippet.text.toLocaleLowerCase()).toContain('logic');
    expect(snippet.text.length).toBeLessThanOrEqual(42);
  });

  it('only enables version comparison when two different version bodies exist', () => {
    expect(
      hasComparableVersions([
        { content: 'same\nbody' },
        { content: 'same\r\nbody  ' }
      ])
    ).toBe(false);
    expect(
      hasComparableVersions([
        { content: 'same body' },
        { content: 'changed body' }
      ])
    ).toBe(true);
  });

  it('computes useful prompt quality levels', () => {
    const quality = computePromptQuality(
      'You are an academic writing expert. Use the provided paper draft as context, polish the text, keep the meaning unchanged, return Markdown bullets with revision reasons, and do not add unsupported information.'
    );
    expect(quality.level).toBe('高质量模板');
    expect(quality.score).toBeGreaterThanOrEqual(84);

    expect(quality.checks.some((check) => check.key === 'variables')).toBe(false);
    expect(computePromptQuality('Polish this.').level).toBe('待打磨');
  });
});
