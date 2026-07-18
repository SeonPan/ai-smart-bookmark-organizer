import type { BookmarkSnapshot, OperationLog, BookmarkNode } from '@/types';

const DB_NAME = 'AIBookmarkOrganizer';
const DB_VERSION = 2; // 升级版本以添加标签存储

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
    
    request.onsuccess = () => resolve(snapshot);
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
    
    request.onsuccess = () => resolve();
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
    
    request.onsuccess = () => resolve(fullLog);
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

// 添加标签到书签
export const addTagsToBookmark = async (bookmarkId: string, tagNames: string[]): Promise<void> => {
  // 确保数据库已初始化
  await getDB();
  
  for (const tagName of tagNames) {
    const normalizedName = tagName.trim().toLowerCase();
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
export const restoreSnapshot = async (snapshotId: string): Promise<void> => {
  const snapshot = await getSnapshot(snapshotId);
  if (!snapshot) {
    throw new Error('快照不存在');
  }
  
  // 获取当前书签树
  const currentTree = await chrome.bookmarks.getTree();
  
  // 1. 清空现有书签（保留系统文件夹结构）
  await clearBookmarks(currentTree);
  
  // 2. 从快照恢复书签
  await restoreBookmarksFromSnapshot(snapshot.treeData);
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
const restoreBookmarksFromSnapshot = async (nodes: BookmarkNode[], parentId?: string): Promise<void> => {
  for (const node of nodes) {
    // 跳过根节点
    if (node.id === '0') {
      if (node.children) {
        for (const child of node.children) {
          await restoreBookmarksFromSnapshot([child], child.id);
        }
      }
      continue;
    }
    
    // 系统文件夹，递归恢复其子项
    const folderType = (node as { folderType?: string }).folderType;
    if (folderType) {
      if (node.children) {
        for (const child of node.children) {
          await createBookmarkFromNode(child, node.id);
        }
      }
      continue;
    }
    
    // 用户文件夹或书签
    if (parentId) {
      await createBookmarkFromNode(node, parentId);
    }
  }
};

// 从节点创建书签或文件夹
const createBookmarkFromNode = async (node: BookmarkNode, parentId: string): Promise<string | undefined> => {
  try {
    if (node.url) {
      // 创建书签
      const result = await chrome.bookmarks.create({
        parentId,
        title: node.title,
        url: node.url
      });
      return result.id;
    } else {
      // 创建文件夹
      const result = await chrome.bookmarks.create({
        parentId,
        title: node.title
      });
      
      // 递归创建子项
      if (node.children) {
        for (const child of node.children) {
          await createBookmarkFromNode(child, result.id);
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
