import { useState, useEffect, useCallback } from 'react';
import type { AISettings } from '@/types';
import { testAIConnection as testAI } from '@/services/aiService';

const DEFAULT_SETTINGS: AISettings = {
  aiType: 'cloud',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  modelName: 'gpt-4o-mini',
  maxOrganizeCount: 50,
  tokenWarningThreshold: 10000,
  languagePreference: 'zh',
  ollamaUrl: 'http://localhost:11434',
  ollamaThink: false
};

// 根据 baseUrl 推断 AI 类型（用于旧数据迁移）
const inferAiType = (settings: Partial<AISettings>): 'cloud' | 'ollama' => {
  const baseUrl = settings.baseUrl || '';
  if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    return 'ollama';
  }
  return 'cloud';
};

// 获取设置
// apiKey 和 customPrompts 存储在 chrome.storage.local（apiKey 不上传同步服务器；
// customPrompts 体积较大，避免超出 sync 单项 8KB 限制），其余设置在 chrome.storage.sync
export const getSettings = async (): Promise<AISettings> => {
  const [syncResult, localResult] = await Promise.all([
    chrome.storage.sync.get(['settings']),
    chrome.storage.local.get(['apiKey', 'customPrompts', 'customControlledTags'])
  ]);
  
  const stored: Partial<AISettings> = syncResult.settings || {};
  let apiKey = (localResult.apiKey as string | undefined) || '';
  let customPrompts = localResult.customPrompts as AISettings['customPrompts'];
  const customControlledTags = localResult.customControlledTags as AISettings['customControlledTags'];
  
  // 旧数据迁移：apiKey / customPrompts 从 sync 迁移到 local
  if (stored.apiKey || stored.customPrompts) {
    if (stored.apiKey) apiKey = stored.apiKey;
    if (stored.customPrompts) customPrompts = stored.customPrompts;
    const { apiKey: _removedKey, customPrompts: _removedPrompts, ...settingsRest } = stored;
    await Promise.all([
      chrome.storage.local.set({ apiKey, customPrompts }),
      chrome.storage.sync.set({ settings: settingsRest })
    ]);
  }
  
  const merged = { ...DEFAULT_SETTINGS, ...stored, apiKey, customPrompts, customControlledTags };
  
  // 旧数据迁移：缺少 aiType 字段时按 baseUrl 推断
  if (!stored.aiType) {
    merged.aiType = inferAiType(stored);
  }
  
  return merged;
};

// 保存设置
// apiKey、customPrompts 和 customControlledTags 写入 chrome.storage.local，其余设置写入 chrome.storage.sync
export const saveSettings = async (settings: AISettings): Promise<void> => {
  const { apiKey, customPrompts, customControlledTags, ...syncSettings } = settings;
  
  await Promise.all([
    chrome.storage.sync.set({ settings: syncSettings }),
    chrome.storage.local.set({ apiKey, customPrompts, customControlledTags })
  ]);
  
  if (chrome.runtime.lastError) {
    throw new Error(chrome.runtime.lastError.message);
  }
};

// 验证设置是否完整
export const validateSettings = (settings: AISettings): { valid: boolean; missing: string[] } => {
  const missing: string[] = [];
  
  // 判断是否为 Ollama 模式（优先显式 aiType 字段，兼容旧数据按 URL 推断）
  const isOllama = settings.aiType
    ? settings.aiType === 'ollama'
    : settings.baseUrl.includes('localhost') || settings.baseUrl.includes('127.0.0.1');
  
  if (isOllama) {
    // Ollama 模式：只需要 ollamaUrl 和 modelName
    if (!settings.ollamaUrl) {
      missing.push('Ollama 服务地址');
    }
    if (!settings.modelName) {
      missing.push('模型名称');
    }
  } else {
    // 云端 API 模式：需要 apiKey、baseUrl 和 modelName
    if (!settings.apiKey) {
      missing.push('API Key');
    }
    if (!settings.baseUrl) {
      missing.push('Base URL');
    }
    if (!settings.modelName) {
      missing.push('Model Name');
    }
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
};

// 测试 AI 连接
export const testAIConnection = testAI;

// Hook: 使用设置
export const useSettings = () => {
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSettings();
      setSettings(data);
      setIsValid(validateSettings(data).valid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<AISettings>) => {
    setSaving(true);
    setError(null);
    try {
      const updated = { ...settings, ...newSettings };
      await saveSettings(updated);
      setSettings(updated);
      setIsValid(validateSettings(updated).valid);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setSaving(false);
    }
  }, [settings]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // 监听存储变化，保持所有已挂载组件的设置同步
  //（forceMount 模式下组件不会因切换 Tab 而重新挂载，必须靠监听更新）
  useEffect(() => {
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'sync' && changes.settings) {
        fetchSettings();
      }
      if (areaName === 'local' && (changes.apiKey || changes.customPrompts || changes.customControlledTags)) {
        fetchSettings();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [fetchSettings]);

  return {
    settings,
    loading,
    saving,
    error,
    isValid,
    fetchSettings,
    updateSettings
  };
};
