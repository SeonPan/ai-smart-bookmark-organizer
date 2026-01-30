# AI Smart Bookmark Organizer (ASBO)

<div align="center">

![ASBO Logo](https://img.shields.io/badge/AI-Smart%20Bookmark%20Organizer-blue?style=for-the-badge&logo=bookmarks)
![Version](https://img.shields.io/badge/Version-v1.0.0-green?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)
![Chrome](https://img.shields.io/badge/Chrome-Extension-orange?style=flat-square)

**Keep Your Bookmark Collection Organized | AI-Powered Bookmark Management Tool**

[English](README_EN.md) | [中文](README.md)

---

## 📖 Product Introduction

AI Smart Bookmark Organizer (ASBO) is a Chrome browser extension that uses AI semantic understanding technology to help you automatically organize your browser bookmarks, solving the pain points of "bookmarking without organizing" and "can't find after bookmarking."

### ✨ Core Features

| Feature | Description |
|---------|-------------|
| 🧠 Smart Save | AI one-click analyzes page, automatically recommends categories and tags |
| 📦 Batch Organize | Batch process large numbers of bookmarks,avoid messy collections |
| 🧹 Clean Master | Automatically detect broken links, duplicate bookmarks |
| ⏪ History Rollback | Automatic backup before organizing, one-click undo operation |

### 🎯 Core Advantages

| Advantage | Description |
|-----------|-------------|
| 🔒 **Privacy First** | API Key stored locally only, bookmark data not uploaded to servers |
| 💰 **Cost Controllable** | Supports local Ollama model, completely free |
| 🛡️ **Safe Operations** | Auto create snapshot before organizing, rollback anytime |
| 🤖 **Smart & Efficient** | AI auto analyzes semantics, high recommendation accuracy |

### 👥 Use Cases

- **Developers**: Organize technical docs, GitHub repos, API docs
- **Researchers**: Manage papers, reference materials, data sources
- **Heavy Users**: Have hundreds or thousands of bookmarks, disorganized
- **Knowledge Workers**: Build personal knowledge bases, need organized management

---

## 🚀 Quick Start

### 📦 Installation

#### Method 1: Local Installation

```bash
# 1. Clone project
git clone https://github.com/yourusername/ai-smart-bookmark-organizer.git

# 2. Enter project directory (optional, for secondary development or config modification)
cd ai-smart-bookmark-organizer

# 3. Install dependencies
npm install

# 4. Development mode
npm run dev

# 5. Build production version
npm run build
```

> 📌 **Load Extension**: Open `chrome://extensions/`, enable developer mode, click "Load unpacked extension", select `dist/` folder

**Note**: This project already includes `dist/`, no need to manually build with npm, can be used directly after cloning to local.

#### Method 2: Extension Store

1. Coming soon, stay tuned!

### ⚙️ Configure AI Service

First-time use requires AI service configuration, supporting two methods:

#### Cloud API (Recommended for Beginners)

| Provider | Required | Cost |
|----------|----------|------|
| OpenAI | API Key | Pay per token |
| DeepSeek | API Key | High cost-performance |
| Moonshot | API Key | Chinese optimized |

#### Local Ollama (For Privacy-sensitive Users)

```bash
# Install Ollama
# Download: https://ollama.com

# Start service (Windows PowerShell)
$env:OLLAMA_ORIGINS="*"; ollama serve

# Download model
ollama pull gemma3:270m (lightweight test)
```

### 🎮 Usage Guide

| Operation | Description |
|-----------|-------------|
| Click extension icon | Open smart save popup |
| Click ⚙️ icon | Open settings page |
| `Alt + Shift + S` | Shortcut for quick save |

---

## 🛠️ Technical Architecture

### 📊 Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Core Framework | React 18 + TypeScript | UI component development |
| Build Tool | Vite + CRXJS | Chrome extension packaging |
| UI Components | shadcn/ui + TailwindCSS | Beautiful and lightweight |
| State Management | React Context + Hooks | State management |
| Storage | chrome.storage + IndexedDB | Settings and snapshots |
| AI Communication | Native fetch | Streaming response support |

### 🏗️ Project Structure

```
ai-smart-bookmark-organizer/
├── manifest.json              # Extension configuration file
├── index.html                 # Popup entry
├── options.html               # Settings page entry
├── vite.config.ts             # Vite + CRXJS configuration
├── src/
│   ├── App.tsx               # Popup main component (Smart Save)
│   ├── OptionsPage.tsx       # Settings page component
│   ├── options.tsx           # Settings page entry
│   ├── background.ts         # Service Worker
│   ├── main.tsx              # Popup entry
│   ├── index.css             # Global styles
│   ├── config.ts             # Configuration file (model presets, translations)
│   ├── types/
│   │   └── index.ts          # TypeScript type definitions
│   ├── hooks/
│   │   ├── useBookmarks.ts   # Bookmark operation Hook
│   │   ├── useSettings.ts    # Settings management Hook
│   │   └── useLanguage.ts    # Language switch Hook (i18n)
│   ├── services/
│   │   ├── aiService.ts      # AI API call service
│   │   └── storageService.ts # IndexedDB storage service
│   ├── components/
│   │   ├── BatchOrganize.tsx # Batch organize component
│   │   ├── HistoryPage.tsx   # History records component
│   │   ├── CleanMaster.tsx   # Clean master component
│   │   ├── TagVisualization.tsx # Tag visualization component
│   │   └── BookmarkTreeSelect.tsx # Bookmark tree multi-select component
│   └── components/ui/        # shadcn/ui components
├── public/
│   └── icons/                # Extension icons
└── dist/                     # Build output
```

---

## 📖 User Manual

For detailed usage guide, please refer to: [User Manual](docs/User_Manual.md)

---

## 🤝 Contributing Guide

Feel free to submit Issues!

### Buy the Author a Coffee

---

## 📄 License

This project is licensed under the [MIT](LICENSE) license.

---

## 🙏 Acknowledgments

Used the following tools for Vibe Coding

- Kimi2.5 Agent
- MiniMax Agent Desktop
- GLM-4.7

---

## 📮 Contact

- **Author**: Seon塞翁
- **GitHub**: [@SeonPan](https://github.com/SeonPan)
- **CSDN**: [Seon塞翁](https://blog.csdn.net/zohan134)

---

<div align="center">

**If this project helps you, please ⭐ Star to support!**

</div>
