import { useState, useEffect, useCallback } from 'react';
import type { AISettings } from '@/types';
import { testAIConnection as testAI } from '@/services/aiService';

const DEFAULT_SETTINGS: AISettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  modelName: 'gpt-4o-mini',
  maxOrganizeCount: 50,
  tokenWarningThreshold: 10000,
  languagePreference: 'zh',
  ollamaUrl: 'http://localhost:11434'
};

// 获取设置
export const getSettings = async (): Promise<AISettings> => {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['settings'], (result) => {
      if (result.settings) {
        resolve({ ...DEFAULT_SETTINGS, ...result.settings });
      } else {
        resolve(DEFAULT_SETTINGS);
      }
    });
  });
};

// 保存设置
export const saveSettings = async (settings: AISettings): Promise<void> => {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ settings }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
};

// 验证设置是否完整
export const validateSettings = (settings: AISettings): { valid: boolean; missing: string[] } => {
  const missing: string[] = [];
  
  // 判断是否为 Ollama 模式
  const isOllama = settings.baseUrl.includes('localhost') || 
                   settings.baseUrl.includes('127.0.0.1') ||
                   settings.ollamaUrl !== 'http://localhost:11434' ||
                   (settings.baseUrl.includes('192.168.') || settings.baseUrl.includes('10.0.0.'));
  
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
