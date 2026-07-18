import type { BookmarkSnapshot, OperationLog, BookmarkNode } from '@/types';

const DB_NAME = 'AIBookmarkOrganizer';
const DB_VERSION = 2; // 升级版本以添加标签存储

// ========== 数据变更通知 ==========
// 日志/快照写入后触发事件，供同页面内已挂载的组件（如历史记录页）自动刷新
const DATA_CHANGED_EVENT = 'asbo-data-changed';

const notifyDataChanged = (): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
  }
};

// 订阅数据变更，返回取消订阅函数
export const onDataChanged = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(DATA_CHANGED_EVENT, callback);
  return () => window.removeEventListener(DATA_CHANGED_EVENT, callback);
};

// 标签类型
export interface Tag {
  id: string;
  name: string;
  bookmarkIds: string[];
  createdAt: number;
}

// 初始化 IndexedDB
export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // 创建快照存储
      if (!db.objectStoreNames.contains('snapshots')) {
        const snapshotStore = db.createObjectStore('snapshots', { keyPath: 'id' });
        snapshotStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // 创建操作日志存储
      if (!db.objectStoreNames.contains('logs')) {
        const logStore = db.createObjectStore('logs', { keyPath: 'id' });
        logStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // 创建标签存储（新版本）
      if (!db.objectStoreNames.contains('tags')) {
        const tagStore = db.createObjectStore('tags', { keyPath: 'id' });
        tagStore.createIndex('name', 'name', { unique: true });
        tagStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
};

// 获取数据库连接
let dbInstance: IDBDatabase | null = null;

const getDB = async (): Promise<IDBDatabase> => {
  if (!dbInstance) {
    dbInstance = await initDB();
  }
  return dbInstance;
};

// ========== 快照相关 ==========

// 创建书签快照
export const createSnapshot = async (
  treeData: BookmarkNode[],
  description: string
): Promise<BookmarkSnapshot> => {
  const db = await getDB();
  
  const stats = getBookmarkStats(treeData);
  const snapshot: BookmarkSnapshot = {
    id: `snapshot_${Date.now()}`,
    timestamp: Date.now(),
    bookmarkCount: stats.bookmarkCount,
    treeData: JSON.parse(JSON.stringify(treeData)),
    description
  };
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['snapshots'], 'readwrite');
    const store = transaction.objectStore('snapshots');
    const request = store.add(snapshot);
    
    request.onsuccess = () => {
      notifyDataChanged();
      resolve(snapshot);
    };
    request.onerror = () => reject(request.error);
  });
};

// 获取所有快照
export const getAllSnapshots = async (): Promise<BookmarkSnapshot[]> => {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['snapshots'], 'readonly');
    const store = transaction.objectStore('snapshots');
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');
    
    const snapshots: BookmarkSnapshot[] = [];
    
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        snapshots.push(cursor.value);
        cursor.continue();
      } else {
        resolve(snapshots);
      }
    };
    
    request.onerror = () => reject(request.error);
  });
};

// 获取单个快照
export const getSnapshot = async (id: string): Promise<BookmarkSnapshot | null> => {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['snapshots'], 'readonly');
    const store = transaction.objectStore('snapshots');
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

// 删除快照
export const deleteSnapshot = async (id: string): Promise<void> => {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['snapshots'], 'readwrite');
    const store = transaction.objectStore('snapshots');
    const request = store.delete(id);
    
    request.onsuccess = () => {
      notifyDataChanged();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
};

// 清理旧快照（保留最近 10 个）
export const cleanupOldSnapshots = async (): Promise<void> => {
  const snapshots = await getAllSnapshots();
  
  if (snapshots.length <= 10) return;
  
  const toDelete = snapshots.slice(10);
  
  for (const snapshot of toDelete) {
    await deleteSnapshot(snapshot.id);
  }
};

// ========== 操作日志相关 ==========

// 记录操作日志
export const addOperationLog = async (log: Omit<OperationLog, 'id' | 'timestamp'>): Promise<OperationLog> => {
  const db = await getDB();
  
  const fullLog: OperationLog = {
    ...log,
    id: `log_${Date.now()}`,
    timestamp: Date.now()
  };
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['logs'], 'readwrite');
    const store = transaction.objectStore('logs');
    const request = store.add(fullLog);
    
    request.onsuccess = () => {
      notifyDataChanged();
      resolve(fullLog);
    };
    request.onerror = () => reject(request.error);
  });
};

// 获取所有操作日志
export const getAllLogs = async (): Promise<OperationLog[]> => {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['logs'], 'readonly');
    const store = transaction.objectStore('logs');
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');
    
    const logs: OperationLog[] = [];
    
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        logs.push(cursor.value);
        cursor.continue();
      } else {
        resolve(logs);
      }
    };
    
    request.onerror = () => reject(request.error);
  });
};

// 清空所有操作日志
export const clearAllLogs = async (): Promise<void> => {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['logs'], 'readwrite');
    const store = transaction.objectStore('logs');
    const request = store.clear();
    
    request.onsuccess = () => {
      notifyDataChanged();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
};

// 清理旧日志（保留最近 50 条）
export const cleanupOldLogs = async (): Promise<void> => {
  const logs = await getAllLogs();
  
  if (logs.length <= 50) return;
  
  const db = await getDB();
  const toDelete = logs.slice(50);
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['logs'], 'readwrite');
    const store = transaction.objectStore('logs');
    
    let completed = 0;
    let hasError = false;
    
    for (const log of toDelete) {
      const request = store.delete(log.id);
      
      request.onsuccess = () => {
        completed++;
        if (completed === toDelete.length && !hasError) {
          resolve();
        }
      };
      
      request.onerror = () => {
        hasError = true;
        reject(request.error);
      };
    }
    
    if (toDelete.length === 0) {
      resolve();
    }
  });
};

// ========== 标签相关 ==========

// 标签名规范化（导出以便测试）：全角转半角、压缩连续空白、去首尾空格、转小写
export const normalizeTagName = (name: string): string => {
  return name
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)) // 全角转半角
    .replace(/\s+/g, ' ') // 压缩连续空白
    .trim()
    .toLowerCase();
};

// 添加标签到书签
export const addTagsToBookmark = async (bookmarkId: string, tagNames: string[]): Promise<void> => {
  // 确保数据库已初始化
  await getDB();
  
  for (const tagName of tagNames) {
    const normalizedName = normalizeTagName(tagName);
    if (!normalizedName) continue;
    
    // 查找或创建标签
    const existingTag = await getTagByName(normalizedName);
    
    if (existingTag) {
      // 更新现有标签
      if (!existingTag.bookmarkIds.includes(bookmarkId)) {
        existingTag.bookmarkIds.push(bookmarkId);
        await updateTag(existingTag);
      }
    } else {
      // 创建新标签
      const newTag: Tag = {
        id: `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: normalizedName,
        bookmarkIds: [bookmarkId],
        createdAt: Date.now()
      };
      await saveTag(newTag);
    }
  }
};

// 保存标签
const saveTag = async (tag: Tag): Promise<void> => {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['tags'], 'readwrite');
    const store = transaction.objectStore('tags');
    const request = store.put(tag);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// 更新标签
const updateTag = async (tag: Tag): Promise<void> => {
  await saveTag(tag);
};

// 根据名称获取标签
const getTagByName = async (name: string): Promise<Tag | null> => {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['tags'], 'readonly');
    const store = transaction.objectStore('tags');
    const index = store.index('name');
    const request = index.get(name);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

// 获取所有标签
export const getAllTags = async (): Promise<Tag[]> => {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['tags'], 'readonly');
    const store = transaction.objectStore('tags');
    const index = store.index('createdAt');
    const request = index.openCursor(null, 'prev');
    
    const tags: Tag[] = [];
    
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        tags.push(cursor.value);
        cursor.continue();
      } else {
        resolve(tags);
      }
    };
    
    request.onerror = () => reject(request.error);
  });
};

// 根据书签ID获取标签
export const getTagsByBookmarkId = async (bookmarkId: string): Promise<Tag[]> => {
  const allTags = await getAllTags();
  return allTags.filter(tag => tag.bookmarkIds.includes(bookmarkId));
};

// 删除标签
export const deleteTag = async (tagId: string): Promise<void> => {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['tags'], 'readwrite');
    const store = transaction.objectStore('tags');
    const request = store.delete(tagId);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// 从所有标签中移除某个书签引用（书签被删除后调用，避免孤儿引用累积）
export const removeBookmarkFromAllTags = async (bookmarkId: string): Promise<void> => {
  const allTags = await getAllTags();
  
  for (const tag of allTags) {
    if (tag.bookmarkIds.includes(bookmarkId)) {
      const newIds = tag.bookmarkIds.filter(id => id !== bookmarkId);
      
      if (newIds.length === 0) {
        // 标签下没有书签了，删除空标签
        await deleteTag(tag.id);
      } else {
        await saveTag({ ...tag, bookmarkIds: newIds });
      }
    }
  }
};

// 从书签中移除标签
export const removeTagFromBookmark = async (bookmarkId: string, tagId: string): Promise<void> => {
  const db = await getDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['tags'], 'readwrite');
    const store = transaction.objectStore('tags');
    void db; // 使用 db 避免未使用变量警告
    const request = store.get(tagId);
    
    request.onsuccess = () => {
      const tag = request.result as Tag;
      if (tag) {
        tag.bookmarkIds = tag.bookmarkIds.filter(id => id !== bookmarkId);
        
        // 如果标签没有书签了，删除标签
        if (tag.bookmarkIds.length === 0) {
          store.delete(tagId);
        } else {
          store.put(tag);
        }
      }
      resolve();
    };
    
    request.onerror = () => reject(request.error);
  });
};

// ========== 回滚相关 ==========

// 恢复快照（真正的书签树恢复）
export const restoreSnapshot = async (snapshotId: string, backupDescription?: string): Promise<void> => {
  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) {
    throw new Error('快照不存在');
  }
  
  // 获取当前书签树
  const currentTree = await chrome.bookmarks.getTree();
  
  // 0. 回滚前自动备份当前书签树，作为“回滚的回滚”保险
  await createSnapshot(currentTree as BookmarkNode[], backupDescription || '回滚前自动备份');
  
  // 1. 清空现有书签（保留系统文件夹结构）
  await clearBookmarks(currentTree as BookmarkNode[]);
  
  // 2. 从快照恢复书签，记录旧书签 ID → 新书签 ID 映射
  const idMapping = new Map<string, string>();
  await restoreBookmarksFromSnapshot(snapshot.treeData, undefined, idMapping);
  
  // 3. 迁移标签表中的书签 ID 引用，避免回滚后标签成为孤儿数据
  await migrateTagBookmarkIds(idMapping);
  
  notifyDataChanged();
};

// 纯函数：按 ID 映射重映射书签 ID 列表，丢弃无映射的旧 ID（导出以便测试）
export const remapBookmarkIds = (
  bookmarkIds: string[],
  idMapping: Map<string, string>
): string[] => {
  return bookmarkIds
    .map(id => idMapping.get(id))
    .filter((id): id is string => !!id);
};

// 迁移标签表的书签 ID 引用（回滚后书签 ID 全部变更）
const migrateTagBookmarkIds = async (idMapping: Map<string, string>): Promise<void> => {
  const allTags = await getAllTags();
  
  for (const tag of allTags) {
    const newIds = remapBookmarkIds(tag.bookmarkIds, idMapping);
    
    if (newIds.length === 0) {
      // 标签下所有书签都不存在了，删除空标签
      await deleteTag(tag.id);
    } else if (
      newIds.length !== tag.bookmarkIds.length ||
      newIds.some((id, i) => id !== tag.bookmarkIds[i])
    ) {
      await saveTag({ ...tag, bookmarkIds: newIds });
    }
  }
};

// 清空书签（保留系统文件夹）
const clearBookmarks = async (nodes: BookmarkNode[]): Promise<void> => {
  for (const node of nodes) {
    // 跳过根节点和系统文件夹
    if (node.id === '0') {
      if (node.children) {
        for (const child of node.children) {
          await clearFolderContents(child.id);
        }
      }
    }
  }
};

// 清空文件夹内容
const clearFolderContents = async (folderId: string): Promise<void> => {
  try {
    const children = await chrome.bookmarks.getChildren(folderId);
    for (const child of children) {
      if (child.url) {
        // 删除书签
        await chrome.bookmarks.remove(child.id);
      } else {
        // 递归删除子文件夹
        await clearFolderContents(child.id);
        // 删除空文件夹（保留系统文件夹）
        const folderType = (child as { folderType?: string }).folderType;
        if (!folderType) {
          await chrome.bookmarks.removeTree(child.id);
        }
      }
    }
  } catch (e) {
    console.error('清空文件夹失败:', e);
  }
};

// 从快照恢复书签
const restoreBookmarksFromSnapshot = async (
  nodes: BookmarkNode[],
  parentId?: string,
  idMapping?: Map<string, string>
): Promise<void> => {
  for (const node of nodes) {
    // 跳过根节点
    if (node.id === '0') {
      if (node.children) {
        for (const child of node.children) {
          await restoreBookmarksFromSnapshot([child], child.id, idMapping);
        }
      }
      continue;
    }
    
    // 系统文件夹，递归恢复其子项
    const folderType = (node as { folderType?: string }).folderType;
    if (folderType) {
      if (node.children) {
        for (const child of node.children) {
          await createBookmarkFromNode(child, node.id, idMapping);
        }
      }
      continue;
    }
    
    // 用户文件夹或书签
    if (parentId) {
      await createBookmarkFromNode(node, parentId, idMapping);
    }
  }
};

// 从节点创建书签或文件夹（按原 index 恢复顺序，并记录旧 ID → 新 ID 映射）
const createBookmarkFromNode = async (
  node: BookmarkNode,
  parentId: string,
  idMapping?: Map<string, string>
): Promise<string | undefined> => {
  try {
    if (node.url) {
      // 创建书签
      const result = await chrome.bookmarks.create({
        parentId,
        title: node.title,
        url: node.url,
        index: node.index
      });
      idMapping?.set(node.id, result.id);
      return result.id;
    } else {
      // 创建文件夹
      const result = await chrome.bookmarks.create({
        parentId,
        title: node.title,
        index: node.index
      });
      idMapping?.set(node.id, result.id);
      
      // 递归创建子项
      if (node.children) {
        for (const child of node.children) {
          await createBookmarkFromNode(child, result.id, idMapping);
        }
      }
      
      return result.id;
    }
  } catch (e) {
    console.error('创建书签/文件夹失败:', e);
    return undefined;
  }
};

// ========== 辅助函数 ==========

const getBookmarkStats = (nodes: BookmarkNode[]) => {
  let bookmarkCount = 0;
  
  const traverse = (node: BookmarkNode) => {
    if (node.url) {
      bookmarkCount++;
    }
    if (node.children) {
      node.children.forEach(traverse);
    }
  };
  
  nodes.forEach(traverse);
  
  return { bookmarkCount };
};
