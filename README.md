# AI Smart Bookmark Organizer (ASBO)


![ASBO Logo](https://img.shields.io/badge/AI-Smart%20Bookmark%20Organizer-blue?style=for-the-badge&logo=bookmarks)
![Version](https://img.shields.io/badge/Version-v1.0.0-green?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)
![Chrome](https://img.shields.io/badge/Chrome-Extension-orange?style=flat-square)

**让收藏夹井井有条 | AI 驱动的智能书签管理工具**

[English](README_EN.md) | 简体中文

---

## 📖 产品简介

AI Smart Bookmark Organizer (ASBO) 是一款 Chrome 浏览器扩展，通过 AI 语义理解技术，帮助您自动整理浏览器收藏夹，解决「只收藏不整理」和「收藏后找不到」的痛点。

### ✨ 核心功能

| 功能        | 说明                                |
| ----------- | ----------------------------------- |
| 🧠 智能保存 | AI 一键分析页面，自动推荐分类和标签 |
| 📦 批量整理 | 批量处理大量书签，告别收藏夹混乱    |
| 🧹 清理大师 | 自动检测失效链接、重复书签          |
| ⏪ 历史回滚 | 每次整理自动备份，一键撤销操作      |

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

#### 方式一：本地安装

```bash
# 1. 克隆项目
git clone https://github.com/yourusername/ai-smart-bookmark-organizer.git

# 2. 进入项目目录（可选，若二次开发或修改配置）
cd ai-smart-bookmark-organizer

# 3. 安装依赖
npm install

# 4. 开发模式
npm run dev

# 5. 构建生产版本
npm run build
```

> 📌 **加载扩展**：打开 `chrome://extensions/`，开启开发者模式，点击「加载已解压的扩展程序」，选择 `dist/` 文件夹

**注意**：本项目已包含 `dist/` ，无需手动 npm 构建，clone 至本地后可直接使用。

#### 方式二：扩展商店

1. 待上架，敬请期待

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
| 核心框架 | React 18 + TypeScript      | UI 组件开发     |
| 构建工具 | Vite + CRXJS               | Chrome 扩展打包 |
| UI 组件  | shadcn/ui + TailwindCSS    | 美观且轻量      |
| 状态管理 | React Context + Hooks      | 状态管理        |
| 存储     | chrome.storage + IndexedDB | 设置与快照      |
| AI 通信  | Native fetch               | 流式响应支持    |

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

---

## 📮 联系方式

- **作者**：Seon塞翁
- **GitHub**：[@SeonPan](https://github.com/SeonPan)
- **CSDN**：[Seon塞翁](https://blog.csdn.net/zohan134)

---


**如果这个项目对您有帮助，欢迎 ⭐ Star 支持！**