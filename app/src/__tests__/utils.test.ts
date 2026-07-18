import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '@/lib/url';
import { estimateTokens, estimateOrganizeTokens, buildSmartSavePrompt, buildOrganizePrompt, extractJson } from '@/services/aiService';
import { remapBookmarkIds, normalizeTagName } from '@/services/storageService';
import { isSystemFolder, buildBookmarkIndex } from '@/hooks/useBookmarks';
import type { BookmarkNode } from '@/types';

// ========== normalizeUrl ==========
describe('normalizeUrl', () => {
  it('保留 query 参数，不同参数不误判为重复', () => {
    const a = normalizeUrl('https://docs.com/page?id=1');
    const b = normalizeUrl('https://docs.com/page?id=2');
    expect(a).not.toBe(b);
  });

  it('剔除追踪参数（utm_*）', () => {
    const a = normalizeUrl('https://example.com/article?id=5&utm_source=twitter&utm_medium=social');
    const b = normalizeUrl('https://example.com/article?id=5');
    expect(a).toBe(b);
  });

  it('忽略 hash 和末尾斜杠', () => {
    const a = normalizeUrl('https://example.com/page/#section1');
    const b = normalizeUrl('https://example.com/page');
    expect(a).toBe(b);
  });

  it('query 参数顺序不同仍判定相同', () => {
    const a = normalizeUrl('https://example.com/p?a=1&b=2');
    const b = normalizeUrl('https://example.com/p?b=2&a=1');
    expect(a).toBe(b);
  });

  it('协议与大小写规范化', () => {
    const a = normalizeUrl('HTTPS://EXAMPLE.COM/Path');
    expect(a).toBe('https://example.com/path');
  });

  it('非法 URL 兜底为小写原文', () => {
    expect(normalizeUrl('NOT A URL')).toBe('not a url');
  });
});

// ========== estimateTokens / estimateOrganizeTokens ==========
describe('estimateTokens', () => {
  it('英文按约 4 字符 1 token', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('中文按约 1.5 字符 1 token', () => {
    expect(estimateTokens('中'.repeat(150))).toBe(100);
  });

  it('中英混合', () => {
    const tokens = estimateTokens('中'.repeat(150) + 'a'.repeat(400));
    expect(tokens).toBe(200);
  });
});

describe('estimateOrganizeTokens', () => {
  const makeBookmarks = (n: number): BookmarkNode[] =>
    Array.from({ length: n }, (_, i) => ({
      id: String(i),
      title: `测试书签标题 ${i}`,
      url: `https://example.com/page/${i}`
    }));

  it('预估值大于 0 且随书签数量增长', () => {
    const small = estimateOrganizeTokens(makeBookmarks(10), []);
    const large = estimateOrganizeTokens(makeBookmarks(100), []);
    expect(small.estimatedTokens).toBeGreaterThan(0);
    expect(large.estimatedTokens).toBeGreaterThan(small.estimatedTokens);
  });

  it('书签超过 50 时产生分批预警', () => {
    const est = estimateOrganizeTokens(makeBookmarks(60), [], { languagePreference: 'zh' });
    expect(est.warning).toBeTruthy();
    expect(est.warning).toContain('批处理');
  });
});

// ========== Prompt 构建 ==========
describe('buildSmartSavePrompt', () => {
  it('替换所有变量占位符', () => {
    const prompt = buildSmartSavePrompt('标题', 'https://a.com', '描述', ['文件夹A'], 'zh');
    expect(prompt).toContain('标题');
    expect(prompt).toContain('https://a.com');
    expect(prompt).toContain('描述');
    expect(prompt).toContain('文件夹A');
    expect(prompt).not.toContain('{{title}}');
    expect(prompt).not.toContain('{{url}}');
    expect(prompt).not.toContain('{{folders}}');
  });

  it('使用自定义模板', () => {
    const prompt = buildSmartSavePrompt('T', 'U', undefined, [], 'en', 'custom {{title}} / {{url}} / {{description}}');
    expect(prompt).toBe('custom T / U / N/A');
  });

  it('英文模式包含英文指令', () => {
    const prompt = buildSmartSavePrompt('T', 'U', undefined, [], 'en');
    expect(prompt).toContain('Use English');
  });
});

describe('buildOrganizePrompt', () => {
  it('包含书签 JSON 和分类列表', () => {
    const bookmarks: BookmarkNode[] = [{ id: '1', title: 'A', url: 'https://a.com' }];
    const prompt = buildOrganizePrompt(bookmarks, ['技术'], 'zh');
    expect(prompt).toContain('"id": "1"');
    expect(prompt).toContain('技术');
    expect(prompt).toContain('reason');
  });
});

// ========== normalizeTagName ==========
describe('normalizeTagName', () => {
  it('全角转半角', () => {
    expect(normalizeTagName('Ｔａｇ')).toBe('tag');
  });

  it('压缩连续空白并去首尾空格', () => {
    expect(normalizeTagName('  sql   教程  ')).toBe('sql 教程');
  });

  it('统一小写', () => {
    expect(normalizeTagName('MySQL')).toBe('mysql');
  });
});

// ========== extractJson ==========
describe('extractJson', () => {
  it('纯 JSON 原样返回', () => {
    expect(extractJson('{"status": "ok"}')).toBe('{"status": "ok"}');
  });

  it('剥离 </think> 之前的思维链', () => {
    const raw = 'We are asking for JSON...\n</think>\n\n{"status": "ok"}';
    expect(JSON.parse(extractJson(raw))).toEqual({ status: 'ok' });
  });

  it('提取暗喧包裹的 JSON 对象', () => {
    const raw = 'Sure! Here is the result:\n{"category": "教程", "tags": ["a"]}\nHope this helps!';
    expect(JSON.parse(extractJson(raw))).toEqual({ category: '教程', tags: ['a'] });
  });

  it('提取数组且不被字符串内的括号截断', () => {
    const raw = '[{"id": "1", "reason": "a ] b } c"}, {"id": "2"}] trailing text';
    const parsed = JSON.parse(extractJson(raw));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].reason).toBe('a ] b } c');
  });

  it('剥离 markdown 代码块', () => {
    const raw = '```json\n{"status": "ok"}\n```';
    expect(JSON.parse(extractJson(raw))).toEqual({ status: 'ok' });
  });

  it('无 JSON 内容时原样返回（交给 JSON.parse 报错）', () => {
    expect(extractJson('no json here')).toBe('no json here');
  });
});

// ========== 受控标签词表注入 ==========
describe('受控标签词表注入', () => {
  it('智能保存 prompt 包含受控词表且无占位符残留', () => {
    const prompt = buildSmartSavePrompt('T', 'U', undefined, [], 'zh');
    expect(prompt).toContain('教程');
    expect(prompt).not.toContain('{{controlledTags}}');
  });

  it('英文 prompt 使用英文词表', () => {
    const prompt = buildSmartSavePrompt('T', 'U', undefined, [], 'en');
    // 受控词表为英文（模板中的中文示例响应与语言无关，不作断言）
    expect(prompt).toContain('controlled vocabulary: Tutorial, Docs, Tool');
    expect(prompt).not.toContain('controlled vocabulary: 教程');
  });

  it('带标签的批量整理 prompt 包含受控词表', () => {
    const prompt = buildOrganizePrompt([{ id: '1', title: 'A', url: 'https://a.com' }], [], 'zh', undefined, true);
    expect(prompt).toContain('教程');
    expect(prompt).toContain('tags');
  });
});

// ========== remapBookmarkIds ==========
describe('remapBookmarkIds', () => {
  it('映射旧 ID 到新 ID，丢弃无映射的 ID', () => {
    const mapping = new Map([['a', 'x'], ['b', 'y']]);
    expect(remapBookmarkIds(['a', 'b', 'c'], mapping)).toEqual(['x', 'y']);
  });

  it('空输入返回空数组', () => {
    expect(remapBookmarkIds([], new Map())).toEqual([]);
  });
});

// ========== isSystemFolder ==========
describe('isSystemFolder', () => {
  it('根节点是系统文件夹', () => {
    expect(isSystemFolder({ id: '0', title: '' })).toBe(true);
  });

  it('根节点的直接子节点是系统文件夹', () => {
    expect(isSystemFolder({ id: '1', parentId: '0', title: '书签栏' })).toBe(true);
  });

  it('folderType 为 bookmarks-bar 的是系统文件夹', () => {
    expect(isSystemFolder({ id: '99', parentId: '5', title: 'x', ...{ folderType: 'bookmarks-bar' } })).toBe(true);
  });

  it('用户文件夹不是系统文件夹', () => {
    expect(isSystemFolder({ id: '100', parentId: '1', title: '我的文件夹' })).toBe(false);
  });
});

// ========== buildBookmarkIndex ==========
describe('buildBookmarkIndex', () => {
  const tree: BookmarkNode[] = [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          parentId: '0',
          title: '书签栏',
          children: [
            { id: '10', parentId: '1', title: '书签A', url: 'https://a.com' },
            {
              id: '11',
              parentId: '1',
              title: '文件夹B',
              children: [{ id: '12', parentId: '11', title: '书签C', url: 'https://c.com' }]
            }
          ]
        }
      ]
    }
  ];

  it('正确建立父节点映射', () => {
    const index = buildBookmarkIndex(tree);
    expect(index.parentById.get('10')?.id).toBe('1');
    expect(index.parentById.get('12')?.id).toBe('11');
    expect(index.parentById.get('1')?.id).toBe('0');
  });

  it('识别书签栏 ID', () => {
    const index = buildBookmarkIndex(tree);
    expect(index.bookmarkBarId).toBe('1');
  });
});
