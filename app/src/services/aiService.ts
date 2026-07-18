import type { AISettings, BookmarkNode, AIResponse, TokenEstimate } from '@/types';
import { CONFIG } from '@/config';

// 获取当前语言的受控标签词表（优先用户自定义词表，否则用默认词表）
const getControlledTags = (
  language: 'zh' | 'en',
  customVocab?: AISettings['customControlledTags']
): string => {
  const custom = customVocab?.[language];
  const list = custom && custom.length > 0 ? custom : CONFIG.CONTROLLED_TAGS[language];
  return list.join(', ');
};

// 计算 Token 数量
// 中文等 CJK 字符约 1 token / 1.5 字符，其余约 1 token / 4 字符
export const estimateTokens = (text: string): number => {
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
  return Math.ceil(cjkCount / 1.5 + (text.length - cjkCount) / 4);
};

// 每批处理的书签数量（与 getOrganizeSuggestions 内部保持一致）
const ORGANIZE_BATCH_SIZE = 20;

// 预估批量整理的 Token 消耗
export const estimateOrganizeTokens = (
  bookmarks: BookmarkNode[],
  existingFolders: string[],
  settings?: Partial<Pick<AISettings, 'aiType' | 'modelName' | 'languagePreference'>> & { withTags?: boolean }
): TokenEstimate => {
  // Prompt 模板的基础字符数
  const basePromptChars = 500;
  
  // 书签与文件夹的实际文本
  const bookmarksText = bookmarks.map(b => `${b.title || ''}\n${b.url || ''}`).join('\n');
  const foldersText = existingFolders.join(', ');
  
  // 分批后每批都要重复携带 base prompt 和文件夹列表
  const batchCount = Math.max(Math.ceil(bookmarks.length / ORGANIZE_BATCH_SIZE), 1);
  const inputTokens =
    estimateTokens(bookmarksText) +
    batchCount * (estimateTokens(foldersText) + Math.ceil(basePromptChars / 4));
  
  // 输出预估：普通模式每个书签约 20 tokens，带标签模式约 40 tokens
  const outputTokens = bookmarks.length * (settings?.withTags ? 40 : 20);
  
  const estimatedTokens = inputTokens + outputTokens;
  
  // 合并所有预警信息（按语言偏好输出）
  const isZh = settings?.languagePreference !== 'en';
  const warnings: string[] = [];
  if (bookmarks.length > 50) {
    warnings.push(
      isZh
        ? `书签数量较多（${bookmarks.length} 条），将分 ${batchCount} 批处理`
        : `Large number of bookmarks (${bookmarks.length}), will be processed in ${batchCount} batches`
    );
  }
  if (estimatedTokens > 10000) {
    warnings.push(
      isZh
        ? `预计消耗约 ${estimatedTokens.toLocaleString()} tokens，请注意用量`
        : `Estimated ${estimatedTokens.toLocaleString()} tokens, please be aware of usage`
    );
  }
  
  return {
    estimatedTokens,
    bookmarkCount: bookmarks.length,
    warning: warnings.length > 0 ? warnings.join('；') : undefined
  };
};

// ========== 提示词模板 ==========
// 默认提示词模板：{{变量}} 占位符在运行时被实际数据替换
// 用户可在设置页的「提示词管理」中查看和自定义
export const DEFAULT_PROMPTS = {
  smartSave: `You are a bookmark classification expert. Analyze this bookmark and recommend the best storage location.

Bookmark Information:
- Title: {{title}}
- URL: {{url}}
- Description: {{description}}

Existing Folders: {{folders}}

Task:
1. First, check if any EXISTING folder is suitable for this bookmark
2. If a suitable folder exists, use that folder name
3. If no suitable folder exists, suggest creating a NEW folder with an appropriate name
4. Choose 1-3 tags for this bookmark from the controlled vocabulary: {{controlledTags}}. Only if none fit, you may add ONE free-form tag

{{langInstruction}}

Respond ONLY with a JSON object in this exact format:
{
  "category": "folder name (use existing if suitable, create new if needed)",
  "isNewCategory": true/false,
  "useExistingFolder": true/false,
  "reason": "brief explanation of why this folder was chosen",
  "tags": ["tag1", "tag2"],
  "confidence": 0.95
}

Rules:
- "isNewCategory": true only if suggesting a new folder that doesn't exist
- "useExistingFolder": true if using an existing folder name
- "reason": brief explanation (max 30 chars in {{langName}})
- "tags": prefer tags from the controlled vocabulary ({{controlledTags}}); at most ONE free-form tag if none fit
- "confidence": 0.0-1.0 based on how certain the classification is

Example response for a new folder:
{
  "category": "AI工具",
  "isNewCategory": true,
  "useExistingFolder": false,
  "reason": "AI聊天工具，无合适现有分类",
  "tags": ["AI", "聊天", "工具"],
  "confidence": 0.92
}

Example response for existing folder:
{
  "category": "技术文档",
  "isNewCategory": false,
  "useExistingFolder": true,
  "reason": "匹配现有技术文档分类",
  "tags": ["文档", "教程", "参考"],
  "confidence": 0.88
}

Do not output any explanation outside the JSON.`,

  organize: `You are a strict JSON data classifier. Classify the following bookmarks into the provided existing categories.

Bookmarks to classify:
{{bookmarksJson}}

Existing Categories: {{folders}}

{{langInstruction}}

Respond ONLY with a JSON array in this exact format:
[
  {"id": "bookmark_id", "category": "CategoryName", "isNewCategory": true/false, "reason": "brief reason"}
]

Rules:
1. Use existing category names if they fit well
2. Create concise new category names (in {{langName}}) if none fit
3. "reason": one short sentence (max 20 chars in {{langName}}) explaining why this bookmark belongs to the category
4. Return valid JSON only`,

  summary: `The user just organized {{totalCount}} bookmarks with AI. Category distribution:
{{statsText}}

{{instruction}}`,

  // 批量整理（带标签生成）：在分类的同时为每个书签生成 2-3 个标签
  organizeWithTags: `You are a strict JSON data classifier. Classify the following bookmarks into the provided existing categories, and generate tags for each bookmark.

Bookmarks to classify:
{{bookmarksJson}}

Existing Categories: {{folders}}

{{langInstruction}}

Respond ONLY with a JSON array in this exact format:
[
  {"id": "bookmark_id", "category": "CategoryName", "isNewCategory": true/false, "reason": "brief reason", "tags": ["tag1", "tag2"]}
]

Rules:
1. Use existing category names if they fit well
2. Create concise new category names (in {{langName}}) if none fit
3. "reason": one short sentence (max 20 chars in {{langName}}) explaining why this bookmark belongs to the category
4. "tags": choose 1-3 tags per bookmark from the controlled vocabulary: {{controlledTags}}; at most ONE free-form tag if none fit
5. Return valid JSON only`
} as const;

// 用实际数据替换模板中的 {{变量}} 占位符
const fillTemplate = (template: string, vars: Record<string, string>): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
};

// 构建智能保存的 Prompt（导出以便测试）
export const buildSmartSavePrompt = (
  title: string,
  url: string,
  description: string | undefined,
  existingFolders: string[],
  language: 'zh' | 'en',
  customTemplate?: string,
  customVocab?: AISettings['customControlledTags']
): string => {
  const langInstruction = language === 'zh' 
    ? '使用中文输出分类和标签' 
    : 'Use English for categories and tags';
  
  const foldersList = existingFolders.length > 0 
    ? existingFolders.join(', ')
    : (language === 'zh' ? '无' : 'None');
  
  return fillTemplate(customTemplate || DEFAULT_PROMPTS.smartSave, {
    title,
    url,
    description: description || 'N/A',
    folders: foldersList,
    controlledTags: getControlledTags(language, customVocab),
    langInstruction,
    langName: language === 'zh' ? 'Chinese' : 'English'
  });
};

// 构建批量整理的 Prompt（导出以便测试）
// withTags=true 时使用带标签生成的模板（仅在用户未自定义模板时生效）
export const buildOrganizePrompt = (
  bookmarks: BookmarkNode[],
  existingFolders: string[],
  language: 'zh' | 'en',
  customTemplate?: string,
  withTags: boolean = false,
  customVocab?: AISettings['customControlledTags']
): string => {
  const langInstruction = language === 'zh'
    ? '使用中文输出新分类名称'
    : 'Use English for new category names';
  
  const bookmarksJson = bookmarks.map(b => ({
    id: b.id,
    title: b.title,
    url: b.url
  }));
  
  const template = customTemplate || (withTags ? DEFAULT_PROMPTS.organizeWithTags : DEFAULT_PROMPTS.organize);
  
  return fillTemplate(template, {
    bookmarksJson: JSON.stringify(bookmarksJson, null, 2),
    folders: JSON.stringify(existingFolders),
    controlledTags: getControlledTags(language, customVocab),
    langInstruction,
    langName: language === 'zh' ? 'Chinese' : 'English'
  });
};

// 从 AI 响应中提取 JSON（导出以便测试）
// 兼容思考型模型的思维链（</think> 之前的内容）、寒暄/解释性包裹文本、markdown 代码块
export const extractJson = (text: string): string => {
  let cleaned = text.replace(/```json\n?|\n?```/g, '');
  
  // 剥离思维链：丢弃 </think> 及之前的全部内容
  const thinkEnd = cleaned.indexOf('</think>');
  if (thinkEnd !== -1) {
    cleaned = cleaned.slice(thinkEnd + '</think>'.length);
  }
  
  // 找到第一个 { 或 [ 作为 JSON 起点
  const start = cleaned.search(/[{[]/);
  if (start === -1) return cleaned.trim();
  
  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  
  // 括号配对找到完整 JSON 片段（忽略字符串字面量内的括号）
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }
  
  // 括号未配平：返回起点到末尾，交给 JSON.parse 报错
  return cleaned.slice(start).trim();
};

// 通过 background script 调用 Ollama（绕过 CORS）
const callOllamaViaBackground = async (
  ollamaUrl: string,
  modelName: string,
  prompt: string,
  think: boolean
): Promise<string> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'OLLAMA_GENERATE',
        ollamaUrl,
        modelName,
        prompt,
        think
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Ollama request failed'));
        }
      }
    );
  });
};

// 判断是否为 Ollama 模式（优先使用显式 aiType 字段，兼容旧数据按 URL 推断）
export const isOllamaMode = (settings: AISettings): boolean => {
  if (settings.aiType) {
    return settings.aiType === 'ollama';
  }
  return settings.baseUrl.includes('localhost') || settings.baseUrl.includes('127.0.0.1');
};

// 调用 AI API
export const callAI = async (
  settings: AISettings,
  prompt: string,
  onStream?: (chunk: string) => void
): Promise<string> => {
  const isOllama = isOllamaMode(settings);
  
  // Ollama 通过 background script 调用以绕过 CORS
  if (isOllama) {
    return callOllamaViaBackground(settings.ollamaUrl, settings.modelName, prompt, settings.ollamaThink === true);
  }
  
  const url = `${settings.baseUrl}/chat/completions`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${settings.apiKey}`
  };
  
  const body = {
    model: settings.modelName,
    messages: [
      { role: 'system', content: 'You are a helpful assistant that outputs only valid JSON.' },
      { role: 'user', content: prompt }
    ],
    stream: !!onStream,
    temperature: 0.3
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error: ${response.status} - ${errorText}`);
  }

  // 处理流式响应
  if (onStream && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = isOllama 
              ? parsed.response 
              : parsed.choices?.[0]?.delta?.content || '';
            
            if (content) {
              fullText += content;
              onStream(content);
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
    
    return fullText;
  }

  // 非流式响应
  const data = await response.json();
  
  if (isOllama) {
    return data.response;
  }
  
  return data.choices?.[0]?.message?.content || '';
};

// 智能保存：获取分类建议
export const getSmartSaveSuggestion = async (
  settings: AISettings,
  title: string,
  url: string,
  description: string | undefined,
  existingFolders: string[],
  onStream?: (chunk: string) => void
): Promise<AIResponse> => {
  const prompt = buildSmartSavePrompt(
    title,
    url,
    description,
    existingFolders,
    settings.languagePreference,
    settings.customPrompts?.smartSave,
    settings.customControlledTags
  );
  const response = await callAI(settings, prompt, onStream);
  
  try {
    // 清理可能的 markdown 代码块
    const cleanJson = extractJson(response);
    const parsed = JSON.parse(cleanJson);
    
    return {
      category: parsed.category || '未分类',
      isNewCategory: parsed.isNewCategory || false,
      useExistingFolder: parsed.useExistingFolder || false,
      reason: parsed.reason || '',
      tags: parsed.tags || [],
      confidence: parsed.confidence || 0.8
    };
  } catch (e) {
    console.error('Failed to parse AI response:', response);
    // 返回默认响应
    return {
      category: existingFolders[0] || '未分类',
      isNewCategory: false,
      useExistingFolder: false,
      reason: '',
      tags: [],
      confidence: 0.5
    };
  }
};

// 单个书签的整理建议
export interface OrganizeSuggestion {
  category: string;
  isNewCategory: boolean;
  reason?: string;
  tags?: string[];
}

// 批量整理的建议结果
export interface OrganizeSuggestionsResult {
  suggestions: Map<string, OrganizeSuggestion>;
  // 分析失败的书签 ID（所在批次调用失败或返回格式错误）
  failedIds: string[];
}

// 带指数退避重试的 AI 调用（应对 429 限流和临时网络错误）
const callAIWithRetry = async (
  settings: AISettings,
  prompt: string,
  maxRetries: number = 3
): Promise<string> => {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callAI(settings, prompt);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const message = lastError.message;
      
      // 只对限流（429）、服务端错误（5xx）和网络错误重试
      const retryable =
        message.includes('429') ||
        /5\d{2}/.test(message) ||
        /network|timeout|fetch|连接/i.test(message);
      
      if (!retryable || attempt === maxRetries) {
        throw lastError;
      }
      
      // 指数退避：1s → 2s → 4s
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`AI 调用失败，${delay}ms 后重试（第 ${attempt + 1} 次）:`, message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

// 批量整理：获取整理建议（云端 3 路并发；本地 Ollama 串行避免超载）
// withTags=true 时 AI 同时为每个书签生成 2-3 个标签
export const getOrganizeSuggestions = async (
  settings: AISettings,
  bookmarks: BookmarkNode[],
  existingFolders: string[],
  onProgress?: (current: number, total: number) => void,
  withTags: boolean = false
): Promise<OrganizeSuggestionsResult> => {
  const suggestions = new Map<string, OrganizeSuggestion>();
  const failedIds: string[] = [];
  
  // 分批处理，每批最多 20 个
  const batchSize = ORGANIZE_BATCH_SIZE;
  const batches: BookmarkNode[][] = [];
  
  for (let i = 0; i < bookmarks.length; i += batchSize) {
    batches.push(bookmarks.slice(i, i + batchSize));
  }
  
  // 本地 Ollama 串行处理避免超载，云端 API 3 路并发提速
  const concurrency = isOllamaMode(settings) ? 1 : 3;
  let nextIndex = 0;
  let completed = 0;
  
  const worker = async () => {
    while (nextIndex < batches.length) {
      const batch = batches[nextIndex++];
      const prompt = buildOrganizePrompt(
        batch,
        existingFolders,
        settings.languagePreference,
        settings.customPrompts?.organize,
        withTags,
        settings.customControlledTags
      );
      
      try {
        const response = await callAIWithRetry(settings, prompt);
        
        // 清理可能的 markdown 代码块
        const cleanJson = extractJson(response);
        const parsed = JSON.parse(cleanJson);
        
        if (Array.isArray(parsed)) {
          parsed.forEach((item: { id: string; category: string; isNewCategory: boolean; reason?: string; tags?: string[] }) => {
            suggestions.set(item.id, {
              category: item.category,
              isNewCategory: item.isNewCategory,
              reason: item.reason,
              tags: Array.isArray(item.tags) ? item.tags.slice(0, 5) : undefined
            });
          });
        } else {
          // 返回不是数组，整批标记失败
          failedIds.push(...batch.map(b => b.id));
        }
      } catch (e) {
        console.error('Failed to parse batch response:', e);
        // 整批失败，记录失败的书签 ID
        failedIds.push(...batch.map(b => b.id));
      }
      
      completed++;
      if (onProgress) {
        onProgress(Math.min(completed * batchSize, bookmarks.length), bookmarks.length);
      }
    }
  };
  
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  
  return { suggestions, failedIds };
};

// 批量整理：生成整理思路摘要（3-5 句话说明为何如此整理）
export const getOrganizeSummary = async (
  settings: AISettings,
  categoryStats: { category: string; count: number; isNew: boolean }[],
  totalCount: number
): Promise<string> => {
  const language = settings.languagePreference;
  const statsText = categoryStats
    .map(s => `- ${s.category}${s.isNew ? ' (new)' : ''}: ${s.count}`)
    .join('\n');
  
  const instruction = language === 'zh'
    ? '请用 3-5 句话总结本次整理的整体思路（例如按主题/用途/领域如何划分，为何新建某些分类）。直接输出摘要文本，不要输出 JSON 或列表。'
    : 'Summarize the organizing rationale in 3-5 sentences (e.g. how bookmarks were grouped by topic/purpose/domain, why new categories were created). Output plain summary text only, no JSON or lists.';
  
  const prompt = fillTemplate(settings.customPrompts?.summary || DEFAULT_PROMPTS.summary, {
    totalCount: String(totalCount),
    statsText,
    instruction
  });
  
  try {
    const response = await callAI(settings, prompt);
    return response.trim();
  } catch (e) {
    console.error('Failed to generate organize summary:', e);
    return '';
  }
};

// AI 标签归并建议：分析现有标签，找出语义相近的标签组并给出规范名
export interface TagMergeGroup {
  // 归并后的规范标签名（优先受控词表）
  canonical: string;
  // 将被合并的标签名（不含 canonical 本身）
  members: string[];
}

export const getTagMergeSuggestions = async (
  settings: AISettings,
  tagNames: string[]
): Promise<TagMergeGroup[]> => {
  if (tagNames.length < 2) return [];
  
  const language = settings.languagePreference;
  const controlledTags = getControlledTags(language, settings.customControlledTags);
  
  const prompt = `You are a tag normalization assistant. The user has the following bookmark tags:
${JSON.stringify(tagNames)}

Controlled tag vocabulary (preferred canonical names): ${controlledTags}

Task:
1. Find groups of tags that are near-synonyms (same meaning, different wording, language, or format)
2. For each group, choose ONE canonical name: prefer a name from the controlled vocabulary; otherwise use the most standard existing form
3. Do NOT merge tags with different meanings
4. Only return groups with 2 or more members; if there is nothing to merge, return an empty array

Respond ONLY with a JSON array in this exact format:
[{"canonical": "CanonicalName", "members": ["member1", "member2"]}]`;
  
  const response = await callAI(settings, prompt);
  const cleanJson = extractJson(response);
  const parsed = JSON.parse(cleanJson);
  
  if (!Array.isArray(parsed)) return [];
  
  // 校验：canonical 与 members 均为字符串，members 至少 1 个，且不包含 canonical
  return parsed
    .filter((g): g is TagMergeGroup =>
      !!g &&
      typeof g.canonical === 'string' &&
      Array.isArray(g.members) &&
      g.members.length >= 1
    )
    .map(g => ({
      canonical: g.canonical,
      members: g.members.filter(m => typeof m === 'string' && m !== g.canonical)
    }))
    .filter(g => g.members.length >= 1);
};

// 测试 AI 连接
// 分两阶段判定：请求失败 = 真·连接问题；响应非 JSON = 模型行为问题（不误报为连接失败）
export const testAIConnection = async (settings: AISettings): Promise<{ success: boolean; message: string }> => {
  const isZh = settings.languagePreference !== 'en';
  
  // 第一阶段：请求本身（网络不通、服务未启动、模型不存在等）
  let response: string;
  try {
    const testPrompt = 'Respond with a simple JSON: {"status": "ok"}';
    response = await callAI(settings, testPrompt);
  } catch (e) {
    const detail = e instanceof Error ? e.message : (isZh ? '未知错误' : 'Unknown error');
    return { success: false, message: isZh ? `连接失败: ${detail}` : `Connection failed: ${detail}` };
  }
  
  // 第二阶段：响应内容是否为可用 JSON
  try {
    const parsed = JSON.parse(extractJson(response));
    
    if (parsed.status === 'ok' || parsed.status === '"ok"') {
      return { success: true, message: isZh ? '连接成功' : 'Connection successful' };
    }
    
    return { success: true, message: isZh ? '连接成功，但响应格式异常' : 'Connected, but response format is unusual' };
  } catch {
    return {
      success: false,
      message: isZh
        ? '服务连接正常，但模型未输出有效 JSON，无法用于整理功能。若是思考型模型（如 MiniCPM5、DeepSeek-R1），请确认「思考模式」已关闭，或更换指令遵循能力更强的模型'
        : 'Service reachable, but the model did not output valid JSON and cannot be used for organizing. For reasoning models (e.g., MiniCPM5, DeepSeek-R1), make sure "Thinking Mode" is off, or switch to a model with better instruction following'
    };
  }
};
