// 书签相关类型
export interface BookmarkNode {
  id: string;
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: BookmarkNode[];
}

export interface BookmarkTree {
  id: string;
  title: string;
  children?: BookmarkNode[];
}

// AI 设置相关类型
export interface AISettings {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  maxOrganizeCount: number;
  tokenWarningThreshold: number;
  languagePreference: 'zh' | 'en';
  ollamaUrl: string;
}

// 智能保存相关类型
export interface SmartSaveData {
  title: string;
  url: string;
  description?: string;
  suggestedFolder?: string;
  tags: string[];
  note?: string;
}

// 批量整理相关类型
export interface OrganizeTask {
  id: string;
  bookmarks: BookmarkNode[];
  targetFolders: string[];
}

export interface OrganizeResult {
  id: string;
  originalFolder: string;
  suggestedFolder: string;
  isNewCategory: boolean;
}

// 快照相关类型
export interface BookmarkSnapshot {
  id: string;
  timestamp: number;
  bookmarkCount: number;
  treeData: BookmarkNode[];
  description: string;
}

// 操作日志类型
export interface OperationLog {
  id: string;
  timestamp: number;
  type: 'organize' | 'clean' | 'rollback';
  affectedCount: number;
  description: string;
  snapshotId?: string;
}

// 清理相关类型
export interface CleanResult {
  brokenLinks: BookmarkNode[];
  duplicates: BookmarkNode[][];
  zombieBookmarks: BookmarkNode[];
}

// API 响应类型
export interface AIResponse {
  category: string;
  isNewCategory: boolean;
  useExistingFolder: boolean;
  reason: string;
  tags: string[];
  confidence: number;
}

// Token 预估类型
export interface TokenEstimate {
  estimatedTokens: number;
  estimatedCost: number;
  bookmarkCount: number;
  warning?: string;
}
