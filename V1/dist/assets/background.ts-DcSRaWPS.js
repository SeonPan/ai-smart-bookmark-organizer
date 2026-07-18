chrome.runtime.onInstalled.addListener(a=>{a.reason==="install"&&(chrome.storage.sync.set({settings:{baseUrl:"https://api.openai.com/v1",apiKey:"",modelName:"gpt-4o-mini",maxOrganizeCount:50,tokenWarningThreshold:1e4,languagePreference:"zh",ollamaUrl:"http://localhost:11434"}}),console.log("AI Smart Bookmark Organizer 已安装，默认设置已初始化"))});chrome.runtime.onMessage.addListener((a,n,o)=>((async()=>{try{switch(a.type){case"GET_CURRENT_TAB":const[c]=await chrome.tabs.query({active:!0,currentWindow:!0});o({success:!0,data:c});break;case"GET_BOOKMARK_TREE":const m=await chrome.bookmarks.getTree();o({success:!0,data:m});break;case"CREATE_BOOKMARK":const O=await chrome.bookmarks.create({parentId:a.parentId,title:a.title,url:a.url});o({success:!0,data:O});break;case"GET_BOOKMARK_CHILDREN":const u=await chrome.bookmarks.getChildren(a.parentId);o({success:!0,data:u});break;case"OLLAMA_GENERATE":try{const e=a.ollamaUrl||"http://localhost:11434",l=a.modelName||"llama2";console.log("正在连接 Ollama:",e,"模型:",l);try{const t=await fetch(`${e}/api/version`,{method:"GET",signal:AbortSignal.timeout(5e3)});if(!t.ok)console.log("Ollama 版本检查失败:",t.status);else{const h=await t.json();console.log("Ollama 版本:",h)}}catch(t){console.log("Ollama 版本检查失败:",t)}const r=await fetch(`${e}/api/generate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:l,prompt:a.prompt,stream:!1}),signal:AbortSignal.timeout(6e4)});if(!r.ok){const t=await r.text();throw console.error("Ollama 响应错误:",r.status,t),r.status===403?new Error(`403: Ollama 拒绝了请求（CORS 问题）。

请按以下步骤设置 Ollama 环境变量后重启服务：

Windows PowerShell:
$env:OLLAMA_HOST="0.0.0.0"; $env:OLLAMA_ORIGINS="*"; ollama serve

Windows CMD:
set OLLAMA_HOST=0.0.0.0 && set OLLAMA_ORIGINS=* && ollama serve

Mac/Linux:
OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve`):r.status===404?new Error(`404: 模型 "${l}" 不存在。请先运行: ollama pull ${l}`):new Error(`Ollama 错误: HTTP ${r.status} - ${t}`)}const s=await r.text();console.log("Ollama 原始响应:",s);let i;try{i=JSON.parse(s)}catch{if(console.log("响应不是 JSON 格式，作为纯文本处理"),s.trim()==="Ok"||s.trim()==="OK"){o({success:!0,data:"Ollama 服务连接成功，但模型可能需要加载。请稍后再试。"});return}o({success:!0,data:s.trim()});return}o({success:!0,data:i.response})}catch(e){if(console.error("Ollama 连接错误:",e),e instanceof TypeError){const l=e.message||"";if(l.includes("fetch")||l.includes("network")||l.includes("Failed to fetch")){const r=a.ollamaUrl||"http://localhost:11434";throw new Error(`无法连接到 Ollama 服务 (${r})。

请检查以下几点：
1. Ollama 是否已启动（运行: ollama serve）
2. 配置的地址是否正确（当前: ${r}）
3. 如果是远程 Ollama，请确保已设置环境变量:
   OLLAMA_HOST=0.0.0.0
   OLLAMA_ORIGINS=*

Windows PowerShell 启动命令:
$env:OLLAMA_HOST="0.0.0.0"; $env:OLLAMA_ORIGINS="*"; ollama serve`)}}throw e.name==="TimeoutError"||e.message?.includes("timeout")?new Error("Ollama 请求超时。请检查模型是否正在加载，或稍后重试。"):e}break;default:o({success:!1,error:"Unknown message type"})}}catch(c){console.error("Background script error:",c),o({success:!1,error:String(c)})}})(),!0));chrome.commands.onCommand.addListener(a=>{console.log("快捷键被触发:",a),a==="quick_save"&&chrome.storage.local.set({quickSaveTriggered:!0},()=>{console.log("快速保存标志已设置，准备打开 popup"),chrome.action.openPopup().catch(n=>{console.log("打开 popup 失败:",n)})})});console.log("AI Smart Bookmark Organizer Background Service Worker 已启动");
