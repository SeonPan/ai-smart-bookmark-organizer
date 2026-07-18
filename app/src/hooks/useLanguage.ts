import { useState, useEffect, useCallback } from 'react';
import { TRANSLATIONS, type TranslationKey, type Language } from '@/config';

const STORAGE_KEY = 'asbo_language';

// 获取存储的语言设置
const getStoredLanguage = async (): Promise<Language> => {
  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      resolve((result[STORAGE_KEY] as Language) || 'zh');
    });
  });
};

// 保存语言设置
const saveLanguage = async (lang: Language): Promise<void> => {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: lang }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
};

// 翻译函数
export const t = (key: TranslationKey, lang: Language, params?: Record<string, string | number>): string => {
  const translations = TRANSLATIONS[lang] as Record<TranslationKey, string>;
  const fallback = TRANSLATIONS.zh as Record<TranslationKey, string>;
  let text = translations[key] || fallback[key] || key;
  
  if (params) {
    Object.entries(params).forEach(([paramKey, value]) => {
      text = text.replace(`{${paramKey}}`, String(value));
    });
  }
  
  return text;
};

// Hook: 使用语言
export const useLanguage = () => {
  const [language, setLanguageState] = useState<Language>('zh');
  const [loading, setLoading] = useState(true);

  // 初始化时加载语言设置
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const stored = await getStoredLanguage();
        setLanguageState(stored);
      } catch (e) {
        console.error('加载语言设置失败:', e);
      } finally {
        setLoading(false);
      }
    };
    loadLanguage();
  }, []);

  // 切换语言
  const setLanguage = useCallback(async (lang: Language) => {
    try {
      await saveLanguage(lang);
      setLanguageState(lang);
      // 刷新页面以确保所有组件重新渲染
      window.location.reload();
      return true;
    } catch (e) {
      console.error('保存语言设置失败:', e);
      return false;
    }
  }, []);

  // 翻译函数
  const translate = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => t(key, language, params),
    [language]
  );

  return {
    language,
    setLanguage,
    translate,
    loading,
    t: translate,
  };
};

export default useLanguage;
