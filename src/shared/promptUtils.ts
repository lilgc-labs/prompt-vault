import type { PromptQuality, PromptQualityLevel } from './types';

export function createDiffLines(previous: string, next: string) {
  const before = previous.split(/\r?\n/);
  const after = next.split(/\r?\n/);
  const max = Math.max(before.length, after.length);

  return Array.from({ length: max }, (_, index) => {
    const oldLine = before[index] ?? '';
    const newLine = after[index] ?? '';
    return {
      line: index + 1,
      oldLine,
      newLine,
      changed: oldLine !== newLine
    };
  });
}

export function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function normalizePromptBody(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

export function hasPromptBodyChanged(previous: string, next: string): boolean {
  return normalizePromptBody(previous) !== normalizePromptBody(next);
}

export function hasComparableVersions(versions: Array<{ content: string }>): boolean {
  const uniqueBodies = new Set(versions.map((version) => normalizePromptBody(version.content)));
  return uniqueBodies.size >= 2;
}

export function searchTerms(query: string): string[] {
  const seen = new Set<string>();
  return query
    .split(/\s+/)
    .map((term) => normalizeSearch(term))
    .filter(Boolean)
    .filter((term) => {
      if (seen.has(term)) return false;
      seen.add(term);
      return true;
    });
}

export function splitHighlightedText(text: string, query: string): Array<{ text: string; highlighted: boolean }> {
  const terms = searchTerms(query).sort((a, b) => b.length - a.length);
  if (!terms.length || !text) {
    return [{ text, highlighted: false }];
  }

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  return text
    .split(pattern)
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      highlighted: terms.includes(part.toLocaleLowerCase())
    }));
}

export function createSearchSnippet(
  prompt: { title: string; description: string; content: string },
  query: string,
  maxLength = 150
) {
  const terms = searchTerms(query);
  const fallback = compactText(prompt.description || prompt.content || prompt.title);

  if (!terms.length) {
    return {
      text: truncateAround(fallback, 0, maxLength, false),
      source: prompt.description ? 'description' : 'content',
      matched: false
    } as const;
  }

  const description = compactText(prompt.description);
  const descriptionMatch = firstMatchIndex(description, terms);
  if (descriptionMatch >= 0) {
    return {
      text: truncateAround(description, descriptionMatch, maxLength, descriptionMatch > 0),
      source: 'description',
      matched: true
    } as const;
  }

  const content = compactText(prompt.content);
  const contentMatch = firstMatchIndex(content, terms);
  if (contentMatch >= 0) {
    return {
      text: truncateAround(content, contentMatch, maxLength, contentMatch > 0),
      source: 'content',
      matched: true
    } as const;
  }

  return {
    text: truncateAround(fallback, 0, maxLength, false),
    source: prompt.description ? 'description' : 'content',
    matched: false
  } as const;
}

export function computePromptQuality(content: string): PromptQuality {
  const normalized = normalizePromptBody(content);
  const checks = [
    {
      key: 'role',
      label: '有明确角色',
      passed: /你是|作为|扮演|role|expert/i.test(normalized)
    },
    {
      key: 'goal',
      label: '任务目标清晰',
      passed: /请|需要|目标|输出|生成|分析|润色|总结|提取|改写|polish|generate|analy[sz]e|summari[sz]e|return/i.test(normalized)
    },
    {
      key: 'format',
      label: '约定输出格式',
      passed: /格式|JSON|Markdown|表格|列表|字段|结构|schema|bullet|table/i.test(normalized)
    },
    {
      key: 'constraints',
      label: '包含限制条件',
      passed: /不要|必须|限制|要求|不超过|不少于|只返回|避免|注意|must|do not|keep|without|unchanged/i.test(normalized)
    },
    {
      key: 'context',
      label: '提供上下文入口',
      passed: /资料|背景|上下文|输入|原文|内容|场景|用户|context|provided|draft|source|paper/i.test(normalized)
    }
  ];

  const passedCount = checks.filter((check) => check.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);
  const level: PromptQualityLevel = score >= 84 ? '高质量模板' : score >= 67 ? '结构清晰' : score >= 40 ? '可复用' : '待打磨';

  return {
    level,
    score,
    checks
  };
}

function firstMatchIndex(text: string, terms: string[]): number {
  const normalized = text.toLocaleLowerCase();
  const indexes = terms.map((term) => normalized.indexOf(term)).filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function compactText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncateAround(text: string, matchIndex: number, maxLength: number, leadingEllipsis: boolean): string {
  if (text.length <= maxLength) {
    return text;
  }

  const safeMax = Math.max(maxLength, 24);
  const start = Math.max(0, Math.min(matchIndex - Math.floor(safeMax / 3), text.length - safeMax));
  const end = Math.min(text.length, start + safeMax);
  const prefix = start > 0 || leadingEllipsis ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  const bodyLength = safeMax - prefix.length - suffix.length;
  return `${prefix}${text.slice(start, start + bodyLength)}${suffix}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
