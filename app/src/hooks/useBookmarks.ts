import { useState, useEffect, useCallback } from 'react';
import type { BookmarkNode } from '@/types';

// 获取书签树
export const getBookmarkTree = async (): Promise<BookmarkNode[]> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'GET_BOOKMARK_TREE' }, (response) => {
      if (response?.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || 'Failed to get bookmark tree'));
      }
    });
  });
};

// 获取书签子项
export const getBookmarkChildren = async (parentId: string): Promise<BookmarkNode[]> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'GET_BOOKMARK_CHILDREN', parentId },
      (response) => {
        if (response?.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Failed to get bookmark children'));
        }
      }
    );
  });
};

// 创建书签
export const createBookmark = async (
  parentId: string,
  title: string,
  url: string
): Promise<BookmarkNode> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'CREATE_BOOKMARK', parentId, title, url },
      (response) => {
        if (response?.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Failed to create bookmark'));
        }
      }
    );
  });
};

// 移动书签
export const moveBookmark = async (
  bookmarkId: string,
  parentId: string
): Promise<BookmarkNode> => {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.move(bookmarkId, { parentId }, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
};

// 删除书签
export const removeBookmark = async (bookmarkId: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.remove(bookmarkId, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
};

// 创建文件夹
export const createFolder = async (
  parentId: string,
  title: string
): Promise<BookmarkNode> => {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.create(
      {
        parentId,
        title
      },
      (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      }
    );
  });
};

// 获取当前标签页
export const getCurrentTab = async (): Promise<chrome.tabs.Tab> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB' }, (response) => {
      if (response?.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || 'Failed to get current tab'));
      }
    });
  });
};

// 获取页面元信息
export const getPageMeta = async (tabId: number): Promise<{ title: string; description?: string }> => {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: () => {
          const metaDescription = document.querySelector('meta[name="description"]');
          return {
            title: document.title,
            description: metaDescription?.getAttribute('content') || undefined
          };
        }
      },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (results && results[0]) {
          resolve(results[0].result as { title: string; description?: string });
        } else {
          reject(new Error('Failed to get page meta'));
        }
      }
    );
  });
};

// 递归扁平化书签树
export const flattenBookmarks = (nodes: BookmarkNode[]): BookmarkNode[] => {
  const result: BookmarkNode[] = [];
  
  const traverse = (node: BookmarkNode) => {
    if (node.url) {
      result.push(node);
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  };
  
  nodes.forEach(traverse);
  return result;
};

// Chrome 系统文件夹 ID（仅保留根节点作为兜底，主要依靠 parentId 判断）
const SYSTEM_FOLDER_IDS = ['0'];

// Chrome 系统文件夹类型
const SYSTEM_FOLDER_TYPES = ['bookmarks-bar', 'other', 'mobile'];

// 判断是否为系统文件夹
export const isSystemFolder = (node: BookmarkNode): boolean => {
  if (!node) return true;

  // 1. 根节点
  if (node.id === '0') return true;
  
  // 2. 根节点的直接子节点必定是系统文件夹
  // (用户无法在根节点下创建文件夹，所以 parentId === '0' 的一定是系统容器)
  if (node.parentId === '0') return true;

  // 3. 根据 folderType 判断（Chrome 特有的字段，非常准确）
  const folderType = (node as { folderType?: string }).folderType;
  if (folderType && SYSTEM_FOLDER_TYPES.includes(folderType)) {
    return true;
  }

  // 4. 兜底：检查已知 ID
  if (SYSTEM_FOLDER_IDS.includes(node.id)) {
    return true;
  }
  
  return false;
};

// 获取所有文件夹（非URL节点，排除系统文件夹）
export const getAllFolders = (nodes: BookmarkNode[]): BookmarkNode[] => {
  const result: BookmarkNode[] = [];
  
  const traverse = (node: BookmarkNode) => {
    // 只包含非URL节点，且不是系统文件夹
    if (!node.url && !isSystemFolder(node)) {
      result.push(node);
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  };
  
  nodes.forEach(traverse);
  return result;
};

// 统计书签信息（排除系统文件夹）
export const getBookmarkStats = (nodes: BookmarkNode[]) => {
  let bookmarkCount = 0;
  let folderCount = 0;
  let maxDepth = 0;
  
  // 遍历函数：depth 表示相对于用户根目录的深度
  const traverse = (node: BookmarkNode, depth: number) => {
    // 系统文件夹本身不计入统计，但其子节点的深度从0开始计算
    if (isSystemFolder(node)) {
      if (node.children) {
        // 系统文件夹的子节点深度重置为0
        node.children.forEach(child => traverse(child, 0));
      }
      return;
    }
    
    // 非系统节点才计入统计
    if (node.url) {
      bookmarkCount++;
    } else {
      // 用户创建的文件夹
      folderCount++;
    }
    
    // 记录最大深度
    maxDepth = Math.max(maxDepth, depth);
    
    // 继续遍历子节点
    if (node.children) {
      node.children.forEach(child => traverse(child, depth + 1));
    }
  };
  
  nodes.forEach(node => traverse(node, 0));
  
  return {
    bookmarkCount,
    folderCount,
    maxDepth
  };
};

// ========== 书签树索引（O(1) 查找，避免每个书签递归整棵树） ==========

export interface BookmarkIndex {
  // 任意节点 ID → 其父文件夹节点
  parentById: Map<string, BookmarkNode>;
  // 书签栏文件夹 ID
  bookmarkBarId: string;
}

// 一次性遍历书签树构建索引
export const buildBookmarkIndex = (nodes: BookmarkNode[]): BookmarkIndex => {
  const parentById = new Map<string, BookmarkNode>();
  let bookmarkBarId = '1';
  
  const traverse = (node: BookmarkNode) => {
    // 优先用 folderType 识别书签栏（语言无关），兜底用固定 ID '1'
    const folderType = (node as { folderType?: string }).folderType;
    if (folderType === 'bookmarks-bar' || node.id === '1') {
      bookmarkBarId = node.id;
    }
    if (node.children) {
      for (const child of node.children) {
        parentById.set(child.id, node);
        traverse(child);
      }
    }
  };
  
  nodes.forEach(traverse);
  return { parentById, bookmarkBarId };
};

// 获取书签树的缓存版本（供 popup 使用，避免每次打开都全量拉取）
// 缓存由 background 在书签变更时失效
export const getBookmarkTreeCached = async (): Promise<BookmarkNode[]> => {
  const cached = await chrome.storage.session.get(['bookmarkTreeCache']);
  if (cached.bookmarkTreeCache) {
    return cached.bookmarkTreeCache as BookmarkNode[];
  }
  const tree = await getBookmarkTree();
  await chrome.storage.session.set({ bookmarkTreeCache: tree });
  return tree;
};

// Hook: 使用书签树
export const useBookmarkTree = () => {
  const [tree, setTree] = useState<BookmarkNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBookmarkTree();
      setTree(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // 监听书签变化自动刷新（防抖 300ms，避免批量操作时频繁拉取）
  // 覆盖回滚、批量移动、外部增删等所有场景，无需手动刷新页面
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fetchTree();
      }, 300);
    };
    
    chrome.bookmarks.onCreated.addListener(scheduleRefetch);
    chrome.bookmarks.onRemoved.addListener(scheduleRefetch);
    chrome.bookmarks.onChanged.addListener(scheduleRefetch);
    chrome.bookmarks.onMoved.addListener(scheduleRefetch);
    chrome.bookmarks.onChildrenReordered.addListener(scheduleRefetch);
    
    return () => {
      if (timer) clearTimeout(timer);
      chrome.bookmarks.onCreated.removeListener(scheduleRefetch);
      chrome.bookmarks.onRemoved.removeListener(scheduleRefetch);
      chrome.bookmarks.onChanged.removeListener(scheduleRefetch);
      chrome.bookmarks.onMoved.removeListener(scheduleRefetch);
      chrome.bookmarks.onChildrenReordered.removeListener(scheduleRefetch);
    };
  }, [fetchTree]);

  return { tree, loading, error, refetch: fetchTree };
};

// Hook: 使用当前标签页
export const useCurrentTab = () => {
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTab = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCurrentTab();
      setTab(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTab();
  }, [fetchTab]);

  return { tab, loading, error, refetch: fetchTab };
};
