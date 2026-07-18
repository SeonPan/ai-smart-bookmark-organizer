import type { AISettings, BookmarkNode, AIResponse, TokenEstimate } from '@/types';

// 计算 Token 数量（粗略估计：1 token ≈ 4 个字符）
export const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

// 预估批量整理的 Token 消耗
export const estimateOrganizeTokens = (
  bookmarks: BookmarkNode[],
  existingFolders: string[]
): TokenEstimate => {
  // Prompt 模板的基础字符数
  const basePromptChars = 500;
  
  // 每个书签的平均字符数（标题 + URL）
  const avgBookmarkChars = bookmarks.reduce((sum, b) => {
    return sum + (b.title?.length || 0) + (b.url?.length || 0);
  }, 0) / Math.max(bookmarks.length, 1);
  
  // 文件夹列表字符数
  const foldersChars = existingFolders.join(', ').length;
  
  // 总字符数
  const totalChars = basePromptChars + (avgBookmarkChars * bookmarks.length) + foldersChars;
  
  // 估计 Token 数
  const estimatedTokens = estimateTokens(totalChars.toString()) + (bookmarks.length * 50);
  
  // 估计成本（基于 GPT-4o-mini 价格：$0.15 / 1M input tokens）
  const estimatedCost = (estimatedTokens / 1000000) * 0.15;
  
  let warning: string | undefined;
  if (bookmarks.length > 50) {
    warning = `书签数量较多（${bookmarks.length} 条），建议分批处理`;
  }
  if (estimatedTokens > 10000) {
    warning = `预计消耗 ${estimatedTokens} tokens，可能产生较高费用`;
  }
  
  return {
    estimatedTokens,
    estimatedCost,
    bookmarkCount: bookmarks.length,
    warning
  };
};

// 构建智能保存的 Prompt
const buildSmartSavePrompt = (
  title: string,
  url: string,
  description: string | undefined,
  existingFolders: string[],
  language: 'zh' | 'en'
): string => {
  const langInstruction = language === 'zh' 
    ? '使用中文输出分类和标签' 
    : 'Use English for categories and tags';
  
  const foldersList = existingFolders.length > 0 
    ? existingFolders.join(', ')
    : (language === 'zh' ? '无' : 'None');
  
  return `You are a bookmark classification expert. Analyze this bookmark and recommend the best storage location.

Bookmark Information:
- Title: ${title}
- URL: ${url}
- Description: ${description || 'N/A'}

Existing Folders: ${foldersList}

Task:
1. First, check if any EXISTING folder is suitable for this bookmark
2. If a suitable folder exists, use that folder name
3. If no suitable folder exists, suggest creating a NEW folder with an appropriate name
4. Generate 3-5 relevant tags for this bookmark

${langInstruction}

Respond ONLY with a JSON object in this exact format:
{
  "category": "folder name (use existing if suitable, create new if needed)",
  "isNewCategory": true/false,
  "useExistingFolder": true/false,
  "reason": "brief explanation of why this folder was chosen",
  "tags": ["tag1", "tag2", "tag3"],
  "confidence": 0.95
}

Rules:
- "isNewCategory": true only if suggesting a new folder that doesn't exist
- "useExistingFolder": true if using an existing folder name
- "reason": brief explanation (max 30 chars in ${language === 'zh' ? 'Chinese' : 'English'})
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

Do not output any explanation outside the JSON.`;
};

// 构建批量整理的 Prompt
const buildOrganizePrompt = (
  bookmarks: BookmarkNode[],
  existingFolders: string[],
  language: 'zh' | 'en'
): string => {
  const langInstruction = language === 'zh'
    ? '使用中文输出新分类名称'
    : 'Use English for new category names';
  
  const bookmarksJson = bookmarks.map(b => ({
    id: b.id,
    title: b.title,
    url: b.url
  }));
  
  return `You are a strict JSON data classifier. Classify the following bookmarks into the provided existing categories.

Bookmarks to classify:
${JSON.stringify(bookmarksJson, null, 2)}

Existing Categories: ${JSON.stringify(existingFolders)}

${langInstruction}

Respond ONLY with a JSON array in this exact format:
[
  {"id": "bookmark_id", "category": "CategoryName", "isNewCategory": true/false}
]

Rules:
1. Use existing category names if they fit well
2. Create concise new category names (in ${language === 'zh' ? 'Chinese' : 'English'}) if none fit
3. Do not output any explanation
4. Return valid JSON only`;
};

// 通过 background script 调用 Ollama（绕过 CORS）
const callOllamaViaBackground = async (
  ollamaUrl: string,
  modelName: string,
  prompt: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'OLLAMA_GENERATE',
        ollamaUrl,
        modelName,
        prompt
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

// 调用 AI API
export const callAI = async (
  settings: AISettings,
  prompt: string,
  onStream?: (chunk: string) => void
): Promise<string> => {
  const isOllama = settings.baseUrl.includes('localhost') || settings.baseUrl.includes('127.0.0.1');
  
  // Ollama 通过 background script 调用以绕过 CORS
  if (isOllama) {
    return callOllamaViaBackground(settings.ollamaUrl, settings.modelName, prompt);
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
  const prompt = buildSmartSavePrompt(title, url, description, existingFolders, settings.languagePreference);
  const response = await callAI(settings, prompt, onStream);
  
  try {
    // 清理可能的 markdown 代码块
    const cleanJson = response.replace(/```json\n?|\n?```/g, '').trim();
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

// 批量整理：获取整理建议
export const getOrganizeSuggestions = async (
  settings: AISettings,
  bookmarks: BookmarkNode[],
  existingFolders: string[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, { category: string; isNewCategory: boolean }>> => {
  const results = new Map<string, { category: string; isNewCategory: boolean }>();
  
  // 分批处理，每批最多 20 个
  const batchSize = 20;
  const batches: BookmarkNode[][] = [];
  
  for (let i = 0; i < bookmarks.length; i += batchSize) {
    batches.push(bookmarks.slice(i, i + batchSize));
  }
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const prompt = buildOrganizePrompt(batch, existingFolders, settings.languagePreference);
    
    try {
      const response = await callAI(settings, prompt);
      
      // 清理可能的 markdown 代码块
      const cleanJson = response.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      if (Array.isArray(parsed)) {
        parsed.forEach((item: { id: string; category: string; isNewCategory: boolean }) => {
          results.set(item.id, {
            category: item.category,
            isNewCategory: item.isNewCategory
          });
        });
      }
    } catch (e) {
      console.error('Failed to parse batch response:', e);
    }
    
    if (onProgress) {
      onProgress((i + 1) * batchSize, bookmarks.length);
    }
  }
  
  return results;
};

// 测试 AI 连接
export const testAIConnection = async (settings: AISettings): Promise<{ success: boolean; message: string }> => {
  try {
    const testPrompt = 'Respond with a simple JSON: {"status": "ok"}';
    const response = await callAI(settings, testPrompt);
    
    const cleanJson = response.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    
    if (parsed.status === 'ok' || parsed.status === '"ok"') {
      return { success: true, message: '连接成功' };
    }
    
    return { success: true, message: '连接成功，但响应格式异常' };
  } catch (e) {
    return { success: false, message: `连接失败: ${e instanceof Error ? e.message : '未知错误'}` };
  }
};
