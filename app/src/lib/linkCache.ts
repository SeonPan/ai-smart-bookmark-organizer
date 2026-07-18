// 失效链接检测结果缓存（chrome.storage.local）
// 24 小时内检测过的链接直接使用缓存结果，大幅提升重复扫描速度

const CACHE_KEY = 'linkCheckCache';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 小时
const MAX_ENTRIES = 5000; // 缓存条目上限，超出时淘汰最旧记录

export interface LinkCheckEntry {
  status: number;
  checkedAt: number;
}

// 判断缓存条目是否新鲜（未超过 TTL）
export const isCacheFresh = (entry: LinkCheckEntry): boolean => {
  return Date.now() - entry.checkedAt < TTL_MS;
};

// 读取完整缓存
export const getLinkCheckCache = async (): Promise<Map<string, LinkCheckEntry>> => {
  const result = await chrome.storage.local.get([CACHE_KEY]);
  const raw = (result[CACHE_KEY] || {}) as Record<string, LinkCheckEntry>;
  return new Map(Object.entries(raw));
};

// 批量写入检测结果（自动淘汰过期与超额条目）
export const updateLinkCheckCache = async (
  updates: Map<string, number>
): Promise<void> => {
  if (updates.size === 0) return;

  const cache = await getLinkCheckCache();
  const now = Date.now();

  for (const [url, status] of updates) {
    cache.set(url, { status, checkedAt: now });
  }

  // 淘汰过期条目
  for (const [url, entry] of cache) {
    if (!isCacheFresh(entry)) {
      cache.delete(url);
    }
  }

  // 超出上限时按时间淘汰最旧条目
  if (cache.size > MAX_ENTRIES) {
    const sorted = [...cache.entries()].sort((a, b) => a[1].checkedAt - b[1].checkedAt);
    const toRemove = sorted.slice(0, cache.size - MAX_ENTRIES);
    for (const [url] of toRemove) {
      cache.delete(url);
    }
  }

  await chrome.storage.local.set({
    [CACHE_KEY]: Object.fromEntries(cache)
  });
};
