# AI Smart Bookmark Organizer (ASBO)

![ASBO Logo](<https://img.shields.io/badge/AI-Smart%20Bookmark%20Organizer-blue?style=for-the-badge&logo=bookmarks>)
![Version](https://img.shields.io/badge/Version-v2.0.0-green?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)
![Chrome](https://img.shields.io/badge/Chrome-Extension-orange?style=flat-square)

**Keep Your Bookmark Collection Organized | AI-Powered Bookmark Management Tool**

[English](README_EN.md) | [中文](README.md)

---

## 📖 Product Introduction

AI Smart Bookmark Organizer (ASBO) is a Chrome browser extension that uses AI semantic understanding technology to help you automatically organize your browser bookmarks, solving the pain points of "bookmarking without organizing" and "can't find after bookmarking."

### ✨ Core Features

| Feature                | Description                                                              |
| ---------------------- | ------------------------------------------------------------------------ |
| 🧠 Smart Save          | AI one-click analyzes page, automatically recommends categories and tags |
| 📦 Batch Organize      | Batch process large numbers of bookmarks,avoid messy collections         |
| 🧹 Clean Master        | Automatically detect broken links, duplicate bookmarks                   |
| ⏪ History Rollback    | Automatic backup before organizing, one-click undo operation             |
| 🏷️ Tag Visualization | Bubble chart of tag distribution, AI merging of similar tags             |
| ⚙️ Settings          | Prompt management, controlled tag vocabulary, i18n (zh/en)               |

### 🆕 What's New in V2.0

- **Batch Organize**: 3-way concurrent AI calls, per-item preview opt-out, organize summary, failed-batch retry, optional tag generation, uninterrupted tab switching
- **Clean Master**: 8-way concurrent broken-link scan with live progress and cancellation, 24h result cache, select-all / select-by-folder, auto snapshot before deletion
- **Tag Governance**: Controlled tag vocabulary constrains AI tagging (customizable), one-click AI merge of existing similar tags
- **History Rollback**: Auto backup before rollback, tag association migration after rollback, one-click log clearing
- **Experience**: Virtual scrolling for large lists, Ollama Thinking Mode toggle (compatible with reasoning models like MiniCPM5/DeepSeek-R1)

### 🎯 Core Advantages

| Advantage                     | Description                                                        |
| ----------------------------- | ------------------------------------------------------------------ |
| 🔒**Privacy First**     | API Key stored locally only, bookmark data not uploaded to servers |
| 💰**Cost Controllable** | Supports local Ollama model, completely free                       |
| 🛡️**Safe Operations** | Auto create snapshot before organizing, rollback anytime           |
| 🤖**Smart & Efficient** | AI auto analyzes semantics, high recommendation accuracy           |

### 👥 Use Cases

- **Developers**: Organize technical docs, GitHub repos, API docs
- **Researchers**: Manage papers, reference materials, data sources
- **Heavy Users**: Have hundreds or thousands of bookmarks, disorganized
- **Knowledge Workers**: Build personal knowledge bases, need organized management

---

## 🚀 Quick Start

### 📦 Installation

The extension is not yet published on the Chrome Web Store. Install via one of the following methods:

#### Method 1: Use the Prebuilt dist (Recommended, No Build Required)

```bash
git clone https://github.com/SeonPan/ai-smart-bookmark-organizer.git
```

Or click "Code → Download ZIP" on the repository page and extract it.

> 📌 **Load Extension**: Open `chrome://extensions/`, enable Developer Mode, click "Load unpacked", and select the `dist/` folder in the project root. No npm build needed.

#### Method 2: Clone and Build Yourself

```bash
# 1. Clone project
git clone https://github.com/SeonPan/ai-smart-bookmark-organizer.git

# 2. Enter source directory and install dependencies
cd ai-smart-bookmark-organizer/app
npm install

# 3. Development mode
npm run dev

# 4. Build production version (output in app/dist/)
npm run build
```

Then load the `app/dist/` folder as described above.

### ⚙️ Configure AI Service

First-time use requires AI service configuration, supporting two methods:

#### Cloud API (Recommended for Beginners)

| Provider | Required | Cost                  |
| -------- | -------- | --------------------- |
| OpenAI   | API Key  | Pay per token         |
| DeepSeek | API Key  | High cost-performance |
| Moonshot | API Key  | Chinese optimized     |

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

| Operation            | Description             |
| -------------------- | ----------------------- |
| Click extension icon | Open smart save popup   |
| Click ⚙️ icon      | Open settings page      |
| `Alt + Shift + S`  | Shortcut for quick save |

---

## 🛠️ Technical Architecture

### 📊 Tech Stack

| Layer            | Technology                 | Purpose                    |
| ---------------- | -------------------------- | -------------------------- |
| Core Framework   | React 19 + TypeScript      | UI component development   |
| Build Tool       | Vite + CRXJS               | Chrome extension packaging |
| UI Components    | shadcn/ui + TailwindCSS    | Beautiful and lightweight  |
| State Management | React Context + Hooks      | State management           |
| Storage          | chrome.storage + IndexedDB | Settings and snapshots     |
| AI Communication | Native fetch               | Streaming response support |
| Virtual Scroll   | @tanstack/react-virtual    | Large list performance     |
| Testing          | Vitest                     | Unit tests                 |

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
│   ├── lib/
│   │   ├── url.ts            # URL normalization utility
│   │   └── linkCache.ts      # Broken-link check result cache
│   ├── __tests__/
│   │   └── utils.test.ts     # Vitest unit tests
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

---

## 📄 License

This project is licensed under the [MIT](LICENSE) license.

---

## 🙏 Acknowledgments

Used the following tools for Vibe Coding

- Kimi2.5 Agent
- MiniMax Agent Desktop
- GLM-4.7
- Qoder + Kimi-k3

---

## 📮 Contact

- **Author**: Seon塞翁
- **GitHub**: [@SeonPan](https://github.com/SeonPan)
- **CSDN**: [Seon塞翁](https://blog.csdn.net/zohan134)

---

**If this project helps you, please ⭐ Star to support!**
