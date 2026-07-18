import{j as k}from"./storageService-B__dlvI6.js";chrome.runtime.onInstalled.addListener(e=>{e.reason==="install"&&(chrome.storage.sync.set({settings:{aiType:"cloud",baseUrl:"https://api.openai.com/v1",modelName:"gpt-4o-mini",maxOrganizeCount:50,tokenWarningThreshold:1e4,languagePreference:"zh",ollamaUrl:"http://localhost:11434"}}),console.log("AI Smart Bookmark Organizer 已安装，默认设置已初始化"))});chrome.runtime.onMessage.addListener((e,h,r)=>((async()=>{try{switch(e.type){case"GET_CURRENT_TAB":const[i]=await chrome.tabs.query({active:!0,currentWindow:!0});r({success:!0,data:i});break;case"GET_BOOKMARK_TREE":const c=await chrome.bookmarks.getTree();r({success:!0,data:c});break;case"CREATE_BOOKMARK":const n=await chrome.bookmarks.create({parentId:e.parentId,title:e.title,url:e.url});r({success:!0,data:n});break;case"GET_BOOKMARK_CHILDREN":const d=await chrome.bookmarks.getChildren(e.parentId);r({success:!0,data:d});break;case"CHECK_LINK":try{const o=e.url;let a=0;try{a=(await fetch(o,{method:"HEAD",redirect:"follow",signal:AbortSignal.timeout(1e4)})).status}catch{try{const s=await fetch(o,{method:"GET",redirect:"follow",signal:AbortSignal.timeout(1e4)});a=s.status,s.body?.cancel()}catch{a=0}}r({success:!0,data:{status:a}})}catch(o){r({success:!1,error:String(o)})}break;case"OLLAMA_GENERATE":try{const o=e.ollamaUrl||"http://localhost:11434",a=e.modelName||"llama2";console.log("正在连接 Ollama:",o,"模型:",a);try{const l=await fetch(`${o}/api/version`,{method:"GET",signal:AbortSignal.timeout(5e3)});if(!l.ok)console.log("Ollama 版本检查失败:",l.status);else{const O=await l.json();console.log("Ollama 版本:",O)}}catch(l){console.log("Ollama 版本检查失败:",l)}const t=await fetch(`${o}/api/generate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:a,prompt:e.prompt,stream:!1,think:e.think===!0}),signal:AbortSignal.timeout(6e4)});if(!t.ok){const l=await t.text();throw console.error("Ollama 响应错误:",t.status,l),t.status===403?new Error(`403: Ollama 拒绝了请求（CORS 问题）。

请按以下步骤设置 Ollama 环境变量后重启服务：

Windows PowerShell:
$env:OLLAMA_HOST="0.0.0.0"; $env:OLLAMA_ORIGINS="*"; ollama serve

Windows CMD:
set OLLAMA_HOST=0.0.0.0 && set OLLAMA_ORIGINS=* && ollama serve

Mac/Linux:
OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve`):t.status===404?new Error(`404: 模型 "${a}" 不存在。请先运行: ollama pull ${a}`):new Error(`Ollama 错误: HTTP ${t.status} - ${l}`)}const s=await t.text();console.log("Ollama 原始响应:",s);let u;try{u=JSON.parse(s)}catch{if(console.log("响应不是 JSON 格式，作为纯文本处理"),s.trim()==="Ok"||s.trim()==="OK"){r({success:!0,data:"Ollama 服务连接成功，但模型可能需要加载。请稍后再试。"});return}r({success:!0,data:s.trim()});return}r({success:!0,data:u.response})}catch(o){if(console.error("Ollama 连接错误:",o),o instanceof TypeError){const a=o.message||"";if(a.includes("fetch")||a.includes("network")||a.includes("Failed to fetch")){const t=e.ollamaUrl||"http://localhost:11434";throw new Error(`无法连接到 Ollama 服务 (${t})。

请检查以下几点：
1. Ollama 是否已启动（运行: ollama serve）
2. 配置的地址是否正确（当前: ${t}）
3. 如果是远程 Ollama，请确保已设置环境变量:
   OLLAMA_HOST=0.0.0.0
   OLLAMA_ORIGINS=*

Windows PowerShell 启动命令:
$env:OLLAMA_HOST="0.0.0.0"; $env:OLLAMA_ORIGINS="*"; ollama serve`)}}throw o.name==="TimeoutError"||o.message?.includes("timeout")?new Error("Ollama 请求超时。请检查模型是否正在加载，或稍后重试。"):o}break;default:r({success:!1,error:"Unknown message type"})}}catch(i){console.error("Background script error:",i),r({success:!1,error:String(i)})}})(),!0));const m=()=>{chrome.storage.session.remove("bookmarkTreeCache").catch(()=>{})};chrome.bookmarks.onCreated.addListener(m);chrome.bookmarks.onChanged.addListener(m);chrome.bookmarks.onMoved.addListener(m);chrome.bookmarks.onChildrenReordered.addListener(m);chrome.bookmarks.onRemoved.addListener((e,h)=>{m();const r=c=>{const n=[];if(c.url&&n.push(c.id),c.children)for(const d of c.children)n.push(...r(d));return n},i=r(h.node);for(const c of i)k(c).catch(n=>{console.error("清理标签引用失败:",n)})});chrome.commands.onCommand.addListener(e=>{console.log("快捷键被触发:",e),e==="quick_save"&&chrome.storage.local.set({quickSaveTriggered:!0},()=>{console.log("快速保存标志已设置，准备打开 popup"),chrome.action.openPopup().catch(h=>{console.log("打开 popup 失败:",h)})})});console.log("AI Smart Bookmark Organizer Background Service Worker 已启动");
