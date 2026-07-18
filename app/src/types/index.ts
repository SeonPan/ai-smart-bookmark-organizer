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

// 自定义提示词（不设置时使用默认模板）
export interface CustomPrompts {
  smartSave?: string;
  organize?: string;
  summary?: string;
}

// AI 设置相关类型
export interface AISettings {
  // AI 类型：云端 API / 本地 Ollama（显式字段，不再靠 URL 猜测）
  aiType: 'cloud' | 'ollama';
  baseUrl: string;
  apiKey: string;
  modelName: string;
  maxOrganizeCount: number;
  tokenWarningThreshold: number;
  languagePreference: 'zh' | 'en';
  ollamaUrl: string;
  // Ollama 思考模式（仅对支持思考的模型生效，默认关闭以保证 JSON 输出纯净）
  ollamaThink?: boolean;
  // 自定义提示词模板（{{变量}} 占位符运行时替换）
  customPrompts?: CustomPrompts;
  // 自定义受控标签词表（按语言覆盖默认词表，单个标签不含空格）
  customControlledTags?: {
    zh?: string[];
    en?: string[];
  };
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
  bookmarkCount: number;
  warning?: string;
}
