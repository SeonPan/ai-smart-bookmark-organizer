# AI Smart Bookmark Organizer (ASBO)

![ASBO Logo](<https://img.shields.io/badge/AI-Smart%20Bookmark%20Organizer-blue?style=for-the-badge&logo=bookmarks>)
![Version](https://img.shields.io/badge/Version-v2.0.0-green?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)
![Chrome](https://img.shields.io/badge/Chrome-Extension-orange?style=flat-square)

**让收藏夹井井有条 | AI 驱动的智能书签管理工具**

[English](README_EN.md) | 简体中文

---

## 📖 产品简介

AI Smart Bookmark Organizer (ASBO) 是一款 Chrome 浏览器扩展，通过 AI 语义理解技术，帮助您自动整理浏览器收藏夹，解决「只收藏不整理」和「收藏后找不到」的痛点。

### ✨ 核心功能

| 功能            | 说明                                |
| --------------- | ----------------------------------- |
| 🧠 智能保存     | AI 一键分析页面，自动推荐分类和标签 |
| 📦 批量整理     | 批量处理大量书签，告别收藏夹混乱    |
| 🧹 清理大师     | 自动检测失效链接、重复书签          |
| ⏪ 历史回滚     | 每次整理自动备份，一键撤销操作      |
| 🏷️ 标签可视化 | 气泡图展示标签分布，AI 归并相近标签 |
| ⚙️ 设置管理   | 提示词管理、受控标签词表、中英双语  |

### 🆕 V2.0 新特性

- **批量整理**：云端 AI 3 路并发提速、预览逐项勾选、整理思路摘要、失败批次重试、可选同步生成标签、切换栏目不中断
- **清理大师**：失效检测 8 路并发 + 实时进度 + 可取消，结果缓存 24h，全选/按文件夹批量选取，删除前自动快照
- **标签治理**：受控标签词表约束 AI 打标（可自定义），存量近义标签 AI 一键归并
- **历史回滚**：回滚前自动再备份，回滚后标签关联自动迁移，日志一键清空
- **体验优化**：大列表虚拟滚动、Ollama 思考模式开关（兼容 MiniCPM5/DeepSeek-R1 等思考型模型）

### 🎯 核心优势

| 优势                   | 说明                                       |
| ---------------------- | ------------------------------------------ |
| 🔒**隐私优先**   | API Key 仅存储在本地，书签数据不上传服务器 |
| 💰**成本可控**   | 支持本地 Ollama 模型，完全免费             |
| 🛡️**操作安全** | 整理前自动创建快照，随时可回滚             |
| 🤖**智能高效**   | AI 自动分析语义，推荐准确率高              |

### 👥 适用场景

- **开发者**：整理技术文档、GitHub 仓库、API 文档
- **研究人员**：管理论文、参考资料、数据来源
- **重度用户**：拥有数百上千书签，分类混乱
- **知识工作者**：构建个人知识库，需要有序管理

---

## 🚀 快速开始

### 📦 安装方式

扩展暂未上架 Chrome 商店，可通过以下两种方式安装：

#### 方式一：使用预构建的 dist（推荐，无需构建）

```bash
git clone https://github.com/SeonPan/ai-smart-bookmark-organizer.git
```

或在仓库页面点击「Code → Download ZIP」下载并解压。

> 📌 **加载扩展**：打开 `chrome://extensions/`，开启开发者模式，点击「加载已解压的扩展程序」，选择项目根目录下的 `dist/` 文件夹即可使用，无需 npm 构建。

#### 方式二：克隆后自行构建

```bash
# 1. 克隆项目
git clone https://github.com/SeonPan/ai-smart-bookmark-organizer.git

# 2. 进入源码目录并安装依赖
cd ai-smart-bookmark-organizer/app
npm install

# 3. 开发模式
npm run dev

# 4. 构建生产版本（产物在 app/dist/）
npm run build
```

构建完成后加载 `app/dist/` 文件夹即可。

### ⚙️ 配置 AI 服务

首次使用需要配置 AI 服务，支持两种方式：

#### 云端 API（推荐新手）

| 提供商   | 需要准备 | 费用          |
| -------- | -------- | ------------- |
| OpenAI   | API Key  | 按 Token 付费 |
| DeepSeek | API Key  | 性价比高      |
| Moonshot | API Key  | 中文优化      |

#### 本地 Ollama（隐私敏感用户）

```bash
# 安装 Ollama
# 下载地址：https://ollama.com

# 启动服务（Windows PowerShell）
$env:OLLAMA_ORIGINS="*"; ollama serve

# 下载模型
ollama pull gemma3:270m （轻量级测试）
```

### 🎮 使用指南

| 操作                 | 说明             |
| -------------------- | ---------------- |
| 点击扩展图标         | 打开智能保存弹窗 |
| 点击⚙️图标         | 打开设置页面     |
| `Alt +  Shift + S` | 快捷键快速保存   |

---

## 🛠️ 技术架构

### 📊 技术栈

| 层级     | 技术                       | 用途            |
| -------- | -------------------------- | --------------- |
| 核心框架 | React 19 + TypeScript      | UI 组件开发     |
| 构建工具 | Vite + CRXJS               | Chrome 扩展打包 |
| UI 组件  | shadcn/ui + TailwindCSS    | 美观且轻量      |
| 状态管理 | React Context + Hooks      | 状态管理        |
| 存储     | chrome.storage + IndexedDB | 设置与快照      |
| AI 通信  | Native fetch               | 流式响应支持    |
| 虚拟滚动 | @tanstack/react-virtual    | 大列表性能      |
| 测试     | Vitest                     | 单元测试        |

### 🏗️ 项目结构

```
ai-smart-bookmark-organizer/
├── manifest.json              # 扩展配置文件
├── index.html                 # Popup 入口
├── options.html               # 设置页面入口
├── vite.config.ts             # Vite + CRXJS 配置
├── src/
│   ├── App.tsx               # Popup 主组件（智能保存）
│   ├── OptionsPage.tsx       # 设置页面组件
│   ├── options.tsx           # 设置页面入口
│   ├── background.ts         # Service Worker
│   ├── main.tsx              # Popup 入口
│   ├── index.css             # 全局样式
│   ├── config.ts             # 配置文件（模型预设、翻译）
│   ├── types/
│   │   └── index.ts          # TypeScript 类型定义
│   ├── hooks/
│   │   ├── useBookmarks.ts   # 书签操作 Hook
│   │   ├── useSettings.ts    # 设置管理 Hook
│   │   └── useLanguage.ts    # 语言切换 Hook (i18n)
│   ├── services/
│   │   ├── aiService.ts      # AI API 调用服务
│   │   └── storageService.ts # IndexedDB 存储服务
│   ├── lib/
│   │   ├── url.ts            # URL 归一化工具
│   │   └── linkCache.ts      # 失效检测结果缓存
│   ├── __tests__/
│   │   └── utils.test.ts     # Vitest 单元测试
│   ├── components/
│   │   ├── BatchOrganize.tsx # 批量整理组件
│   │   ├── HistoryPage.tsx   # 历史记录组件
│   │   ├── CleanMaster.tsx   # 清理大师组件
│   │   ├── TagVisualization.tsx # 标签可视化组件
│   │   └── BookmarkTreeSelect.tsx # 书签树多选组件
│   └── components/ui/        # shadcn/ui 组件
├── public/
│   └── icons/                # 扩展图标
└── dist/                     # 构建输出
```

---

## 📖 用户手册

详细使用指南请查看：[用户操作手册](docs/用户操作手册.md)

---

## 🤝 贡献指南

欢迎提交 Issue ！

---

## 📄 许可证

本项目采用 [MIT](LICENSE) 许可证。

---

## 🙏 致谢

使用以下工具进行 Vibe Coding

- Kimi2.5 Agent
- MiniMax Agent Desktop
- GLM-4.7
- Qoder + Kimi-k3

---

## 📮 联系方式

- **作者**：Seon塞翁
- **GitHub**：[@SeonPan](https://github.com/SeonPan)
- **CSDN**：[Seon塞翁](https://blog.csdn.net/zohan134)

---

**如果这个项目对您有帮助，欢迎 ⭐ Star 支持！**
