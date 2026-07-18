// Background Service Worker for AI Smart Bookmark Organizer

import { removeBookmarkFromAllTags } from './services/storageService';

// 安装时初始化默认设置
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 设置默认配置
    chrome.storage.sync.set({
      settings: {
        // AI 类型：云端 API / 本地 Ollama
        aiType: 'cloud',
        // AI 模型配置
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-4o-mini',
        // 整理设置
        maxOrganizeCount: 50,
        tokenWarningThreshold: 10000,
        languagePreference: 'zh',
        // Ollama 配置
        ollamaUrl: 'http://localhost:11434'
      }
    });
    
    console.log('AI Smart Bookmark Organizer 已安装，默认设置已初始化');
  }
});

// 监听来自 popup 和 content script 的消息
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  (async () => {
    try {
      switch (request.type) {
        case 'GET_CURRENT_TAB':
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          sendResponse({ success: true, data: tab });
          break;
          
        case 'GET_BOOKMARK_TREE':
          const tree = await chrome.bookmarks.getTree();
          sendResponse({ success: true, data: tree });
          break;
          
        case 'CREATE_BOOKMARK':
          const newBookmark = await chrome.bookmarks.create({
            parentId: request.parentId,
            title: request.title,
            url: request.url
          });
          sendResponse({ success: true, data: newBookmark });
          break;
          
        case 'GET_BOOKMARK_CHILDREN':
          const children = await chrome.bookmarks.getChildren(request.parentId);
          sendResponse({ success: true, data: children });
          break;
          
        case 'CHECK_LINK':
          // 失效链接检测：background 不受网页 CORS 限制，可获取真实 HTTP 状态码
          try {
            const checkUrl = request.url;
            let status = 0;
            
            try {
              // 优先 HEAD 请求（轻量）
              const headResponse = await fetch(checkUrl, {
                method: 'HEAD',
                redirect: 'follow',
                signal: AbortSignal.timeout(10000)
              });
              status = headResponse.status;
            } catch (headError) {
              // HEAD 被拒（部分网站不支持），退而使用 GET（只读响应头）
              try {
                const getResponse = await fetch(checkUrl, {
                  method: 'GET',
                  redirect: 'follow',
                  signal: AbortSignal.timeout(10000)
                });
                status = getResponse.status;
                // 立即取消响应体读取，减少流量消耗
                getResponse.body?.cancel();
              } catch (getError) {
                // 网络层失败（域名不存在、连接拒绝、超时等）
                status = 0;
              }
            }
            
            sendResponse({ success: true, data: { status } });
          } catch (checkError) {
            sendResponse({ success: false, error: String(checkError) });
          }
          break;
          
        case 'OLLAMA_GENERATE':
          try {
            const ollamaUrl = request.ollamaUrl || 'http://localhost:11434';
            const modelName = request.modelName || 'llama2';
            
            console.log('正在连接 Ollama:', ollamaUrl, '模型:', modelName);
            
            // 首先测试 Ollama 服务是否可用
            try {
              const versionResponse = await fetch(`${ollamaUrl}/api/version`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
              });
              if (!versionResponse.ok) {
                console.log('Ollama 版本检查失败:', versionResponse.status);
              } else {
                const versionData = await versionResponse.json();
                console.log('Ollama 版本:', versionData);
              }
            } catch (versionError) {
              console.log('Ollama 版本检查失败:', versionError);
            }
            
            // 通过 background script 调用 Ollama 以绕过 CORS
            const ollamaResponse = await fetch(`${ollamaUrl}/api/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: modelName,
                prompt: request.prompt,
                stream: false,
                // 思考模式开关：默认关闭以保证 JSON 输出纯净；仅对支持思考的模型生效
                think: request.think === true
              }),
              signal: AbortSignal.timeout(60000) // 60秒超时
            });
            
            if (!ollamaResponse.ok) {
              const errorText = await ollamaResponse.text();
              console.error('Ollama 响应错误:', ollamaResponse.status, errorText);
              
              // 403 错误通常是 Ollama CORS 设置问题
              if (ollamaResponse.status === 403) {
                throw new Error(`403: Ollama 拒绝了请求（CORS 问题）。\n\n请按以下步骤设置 Ollama 环境变量后重启服务：\n\nWindows PowerShell:\n$env:OLLAMA_HOST="0.0.0.0"; $env:OLLAMA_ORIGINS="*"; ollama serve\n\nWindows CMD:\nset OLLAMA_HOST=0.0.0.0 && set OLLAMA_ORIGINS=* && ollama serve\n\nMac/Linux:\nOLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve`);
              }
              
              // 404 错误可能是模型不存在
              if (ollamaResponse.status === 404) {
                throw new Error(`404: 模型 "${modelName}" 不存在。请先运行: ollama pull ${modelName}`);
              }
              
              throw new Error(`Ollama 错误: HTTP ${ollamaResponse.status} - ${errorText}`);
            }
            
            // 获取响应文本并尝试解析 JSON
            const responseText = await ollamaResponse.text();
            console.log('Ollama 原始响应:', responseText);
            
            let ollamaData;
            try {
              ollamaData = JSON.parse(responseText);
            } catch (parseError) {
              // 如果不是 JSON，可能是纯文本响应
              console.log('响应不是 JSON 格式，作为纯文本处理');
              if (responseText.trim() === 'Ok' || responseText.trim() === 'OK') {
                sendResponse({ success: true, data: 'Ollama 服务连接成功，但模型可能需要加载。请稍后再试。' });
                return;
              }
              sendResponse({ success: true, data: responseText.trim() });
              return;
            }
            
            sendResponse({ success: true, data: ollamaData.response });
          } catch (fetchError: any) {
            console.error('Ollama 连接错误:', fetchError);
            
            // 网络连接错误
            if (fetchError instanceof TypeError) {
              const errorMessage = fetchError.message || '';
              
              if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Failed to fetch')) {
                const ollamaUrl = request.ollamaUrl || 'http://localhost:11434';
                throw new Error(`无法连接到 Ollama 服务 (${ollamaUrl})。\n\n请检查以下几点：\n1. Ollama 是否已启动（运行: ollama serve）\n2. 配置的地址是否正确（当前: ${ollamaUrl}）\n3. 如果是远程 Ollama，请确保已设置环境变量:\n   OLLAMA_HOST=0.0.0.0\n   OLLAMA_ORIGINS=*\n\nWindows PowerShell 启动命令:\n$env:OLLAMA_HOST="0.0.0.0"; $env:OLLAMA_ORIGINS="*"; ollama serve`);
              }
            }
            
            // 超时错误
            if (fetchError.name === 'TimeoutError' || fetchError.message?.includes('timeout')) {
              throw new Error('Ollama 请求超时。请检查模型是否正在加载，或稍后重试。');
            }
            
            throw fetchError;
          }
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({ success: false, error: String(error) });
    }
  })();
  
  return true; // 保持消息通道开放以支持异步响应
});

// 书签变更时使 popup 的书签树缓存失效
const invalidateTreeCache = () => {
  chrome.storage.session.remove('bookmarkTreeCache').catch(() => {});
};
chrome.bookmarks.onCreated.addListener(invalidateTreeCache);
chrome.bookmarks.onChanged.addListener(invalidateTreeCache);
chrome.bookmarks.onMoved.addListener(invalidateTreeCache);
chrome.bookmarks.onChildrenReordered.addListener(invalidateTreeCache);

// 监听书签删除事件，同步清理标签表中的引用（包括文件夹删除时其整个子树）
chrome.bookmarks.onRemoved.addListener((_id, removeInfo) => {
  invalidateTreeCache();
  // 收集被删除节点及其子树中所有书签的 ID
  const collectBookmarkIds = (node: chrome.bookmarks.BookmarkTreeNode): string[] => {
    const ids: string[] = [];
    if (node.url) {
      ids.push(node.id);
    }
    if (node.children) {
      for (const child of node.children) {
        ids.push(...collectBookmarkIds(child));
      }
    }
    return ids;
  };
  
  const removedIds = collectBookmarkIds(removeInfo.node);
  for (const bookmarkId of removedIds) {
    removeBookmarkFromAllTags(bookmarkId).catch((err) => {
      console.error('清理标签引用失败:', err);
    });
  }
});

// 监听快捷键命令
chrome.commands.onCommand.addListener((command) => {
  console.log('快捷键被触发:', command);
  
  if (command === 'quick_save') {
    // 快速保存：设置标志，然后通过 action API 打开 popup
    chrome.storage.local.set({ quickSaveTriggered: true }, () => {
      console.log('快速保存标志已设置，准备打开 popup');
      // 使用 action API 打开 popup
      chrome.action.openPopup().catch((err) => {
        console.log('打开 popup 失败:', err);
        // 如果 openPopup 失败，尝试通过其他方式通知用户
      });
    });
  }
});

console.log('AI Smart Bookmark Organizer Background Service Worker 已启动');
