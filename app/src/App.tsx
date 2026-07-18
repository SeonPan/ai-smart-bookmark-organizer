import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { 
  Bookmark, 
  Folder, 
  FolderPlus,
  Tag, 
  Settings, 
  Loader2, 
  Check, 
  X,
  AlertCircle,
  Sparkles,
  ChevronDown,
  Lightbulb,
  Zap,
  Edit3
} from 'lucide-react';
import { useCurrentTab, getPageMeta, createBookmark, getBookmarkTreeCached, getAllFolders, createFolder } from '@/hooks/useBookmarks';
import { useSettings } from '@/hooks/useSettings';
import { getSmartSaveSuggestion } from '@/services/aiService';
import { addTagsToBookmark } from '@/services/storageService';
import { useLanguage } from '@/hooks/useLanguage';
import type { BookmarkNode, AIResponse } from '@/types';

// 骨架屏组件
const LoadingSkeleton = () => (
  <div className="w-[400px] p-4 space-y-4">
    <Skeleton className="h-8 w-3/4" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-10 w-full" />
  </div>
);

// AI 建议卡片组件
const AISuggestionCard = ({ 
  suggestion, 
  matchedFolder,
  onCreateFolder,
  isCreating,
  t
}: { 
  suggestion: AIResponse;
  matchedFolder?: BookmarkNode;
  onCreateFolder: () => void;
  isCreating: boolean;
  t: any;
}) => {
  const isNewFolder = suggestion.isNewCategory || !matchedFolder;
  
  return (
    <Card className={`border-l-4 ${isNewFolder ? 'border-l-amber-500 bg-amber-50/50' : 'border-l-green-500 bg-green-50/50'}`}>
      <CardContent className="p-3 space-y-3">
        {/* 建议标题 */}
        <div className="flex items-center gap-2">
          <Sparkles className={`w-4 h-4 ${isNewFolder ? 'text-amber-500' : 'text-green-500'}`} />
          <span className="text-sm font-medium">{t('popup.aiSuggestion')}</span>
          <Badge variant="secondary" className="text-xs">
            {Math.round(suggestion.confidence * 100)}% {t('popup.confidence')}
          </Badge>
        </div>
        
        {/* 推荐理由 */}
        {suggestion.reason && (
          <div className="flex items-start gap-2 text-sm">
            <Lightbulb className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <span className="text-muted-foreground">{suggestion.reason}</span>
          </div>
        )}
        
        {/* 分类建议 */}
        <div className="flex items-center gap-2">
          <Folder className={`w-4 h-4 ${isNewFolder ? 'text-amber-500' : 'text-green-500'}`} />
          <span className="text-sm font-medium">{suggestion.category}</span>
          {isNewFolder && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
              {t('popup.newFolder')}
            </Badge>
          )}
          {!isNewFolder && matchedFolder && (
            <Badge variant="outline" className="text-xs text-green-600 border-green-300">
              {t('popup.existingFolder')}
            </Badge>
          )}
        </div>
        
        {/* 新建文件夹按钮 */}
        {isNewFolder && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full text-amber-600 border-amber-300 hover:bg-amber-50"
            onClick={onCreateFolder}
            disabled={isCreating}
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FolderPlus className="w-4 h-4 mr-2" />
            )}
            {isCreating ? t('app.loading') : `${t('popup.createFolder')} "${suggestion.category}"`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

// 快速保存状态指示器
const QuickSaveStatus = ({ 
  status, 
  message,
  t
}: { 
  status: 'idle' | 'analyzing' | 'saving' | 'success' | 'error';
  message?: string;
  t: any;
}) => {
  const configs = {
    idle: { icon: Zap, text: t('popup.quickSave'), color: 'text-muted-foreground' },
    analyzing: { icon: Loader2, text: t('popup.analyzing'), color: 'text-primary' },
    saving: { icon: Loader2, text: t('app.loading'), color: 'text-primary' },
    success: { icon: Check, text: t('popup.saveSuccess'), color: 'text-green-600' },
    error: { icon: AlertCircle, text: message || t('popup.saveBookmark'), color: 'text-red-500' }
  };
  
  const config = configs[status];
  const Icon = config.icon;
  
  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg bg-muted ${config.color}`}>
      <Icon className={`w-4 h-4 ${status === 'analyzing' || status === 'saving' ? 'animate-spin' : ''}`} />
      <span className="text-sm font-medium">{config.text}</span>
    </div>
  );
};

function App() {
  const { tab, loading: tabLoading } = useCurrentTab();
  const { settings, isValid: settingsValid } = useSettings();
  const { t } = useLanguage();
  
  // 表单状态
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState<string | undefined>('');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [folders, setFolders] = useState<BookmarkNode[]>([]);
  const [bookmarkBarId, setBookmarkBarId] = useState<string>('');
  
  // AI 状态
  const [analyzing, setAnalyzing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AIResponse | null>(null);
  const [matchedFolder, setMatchedFolder] = useState<BookmarkNode | undefined>();
  
  // 操作状态
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  
  // 快速保存模式
  const [quickSaveMode, setQuickSaveMode] = useState(false);
  const [quickSaveStatus, setQuickSaveStatus] = useState<'idle' | 'analyzing' | 'saving' | 'success' | 'error'>('idle');
  const [showFullEditor, setShowFullEditor] = useState(false);
  const quickSaveAttempted = useRef(false);

  // 初始化 - 并行获取数据
  useEffect(() => {
    if (tab) {
      setTitle(tab.title || '');
      loadInitialData();
    }
  }, [tab]);

  // 尝试快速保存（如果配置有效且未尝试过）
  useEffect(() => {
    if (settingsValid && bookmarkBarId && !quickSaveAttempted.current && !showFullEditor) {
      quickSaveAttempted.current = true;
      
      // 检查是否是通过快捷键触发的快速保存
      chrome.storage.local.get(['quickSaveTriggered'], (result) => {
        if (result.quickSaveTriggered) {
          // 清除标志
          chrome.storage.local.remove('quickSaveTriggered');
          // 延迟执行快速保存，确保所有数据已加载
          setTimeout(() => {
            if (!showFullEditor) {
              performQuickSave();
            }
          }, 500);
        }
      });
    }
  }, [settingsValid, bookmarkBarId, showFullEditor]);

  // 并行加载初始数据（书签树使用 session 缓存，background 会在书签变更时失效）
  const loadInitialData = useCallback(async () => {
    try {
      const [meta, tree] = await Promise.all([
        tab?.id ? getPageMeta(tab.id).catch(() => ({ description: undefined })) : Promise.resolve({ description: undefined }),
        getBookmarkTreeCached()
      ]);
      
      setDescription(meta.description);
      
      // 获取所有用户文件夹
      const folderList = getAllFolders(tree);
      setFolders(folderList);
      
      // 获取书签栏 ID
      const findBookmarkBar = (nodes: BookmarkNode[]): string => {
        for (const node of nodes) {
          if (node.title === '书签栏' || node.title === 'Bookmarks Bar') {
            return node.id;
          }
          if (node.children) {
            const found = findBookmarkBar(node.children);
            if (found) return found;
          }
        }
        return '1';
      };
      const barId = findBookmarkBar(tree);
      setBookmarkBarId(barId);
      setSelectedFolder(barId);
    } catch (e) {
      console.error('加载初始数据失败:', e);
    }
  }, [tab?.id]);

  // 快速保存：AI分析并自动保存
  const performQuickSave = async () => {
    if (!settingsValid || !tab?.url) return;
    
    setQuickSaveMode(true);
    setQuickSaveStatus('analyzing');
    setError(null);

    try {
      const folderNames = folders.map(f => f.title);
      const suggestion = await getSmartSaveSuggestion(
        settings,
        title,
        tab.url,
        description,
        folderNames,
        undefined
      );

      setAiSuggestion(suggestion);
      setTags(suggestion.tags);

      // 确定保存位置
      let targetFolderId = bookmarkBarId;
      let targetFolder = folders.find(f => 
        f.title.toLowerCase() === suggestion.category.toLowerCase()
      );

      // 如果需要新建文件夹
      if (!targetFolder && suggestion.isNewCategory) {
        setQuickSaveStatus('saving');
        try {
          const newFolder = await createFolder(bookmarkBarId, suggestion.category);
          targetFolder = newFolder;
          setFolders(prev => [...prev, newFolder]);
        } catch (e) {
          // 创建失败，使用书签栏
          console.log('创建文件夹失败，使用书签栏');
        }
      }

      if (targetFolder) {
        targetFolderId = targetFolder.id;
        setMatchedFolder(targetFolder);
        setSelectedFolder(targetFolder.id);
      }

      // 保存书签
      setQuickSaveStatus('saving');
      const newBookmark = await createBookmark(targetFolderId, title, tab.url);
      
      // 保存标签
      if (suggestion.tags.length > 0) {
        try {
          await addTagsToBookmark(newBookmark.id, suggestion.tags);
        } catch (e) {
          console.error('保存标签失败:', e);
        }
      }
      
      setQuickSaveStatus('success');
      setSaved(true);
      
      // 2秒后关闭
      setTimeout(() => {
        window.close();
      }, 2000);
    } catch (e) {
      console.error('快速保存失败:', e);
      setQuickSaveStatus('error');
      setError(e instanceof Error ? e.message : '保存失败');
      // 显示完整编辑器让用户手动处理
      setShowFullEditor(true);
    }
  };

  // AI 分析（手动触发）
  const analyzeWithAI = async () => {
    if (!settingsValid) {
      setError(t('popup.pleaseConfigAI'));
      return;
    }

    setAnalyzing(true);
    setError(null);
    setAiSuggestion(null);
    setMatchedFolder(undefined);

    try {
      const folderNames = folders.map(f => f.title);
      const suggestion = await getSmartSaveSuggestion(
        settings,
        title,
        tab?.url || '',
        description,
        folderNames,
        undefined
      );

      setAiSuggestion(suggestion);
      setTags(suggestion.tags);
      
      // 查找匹配的文件夹
      const matched = folders.find(f => 
        f.title.toLowerCase() === suggestion.category.toLowerCase()
      );
      setMatchedFolder(matched);
      
      // 如果匹配到现有文件夹，自动选中
      if (matched && suggestion.useExistingFolder) {
        setSelectedFolder(matched.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('popup.analyzeFailed'));
    } finally {
      setAnalyzing(false);
    }
  };

  // 创建新文件夹
  const handleCreateFolder = async () => {
    if (!aiSuggestion?.category) return;
    
    setCreatingFolder(true);
    setError(null);
    
    try {
      const newFolder = await createFolder(bookmarkBarId, aiSuggestion.category);
      setFolders(prev => [...prev, newFolder]);
      setSelectedFolder(newFolder.id);
      setMatchedFolder(newFolder);
      
      setAiSuggestion(prev => prev ? {
        ...prev,
        isNewCategory: false,
        useExistingFolder: true
      } : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('popup.createFolderFailed'));
    } finally {
      setCreatingFolder(false);
    }
  };

  // 保存书签
  const handleSave = async () => {
    if (!selectedFolder) {
      setError(t('popup.selectFolderRequired'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const newBookmark = await createBookmark(selectedFolder, title, tab?.url || '');
      
      // 保存标签
      if (tags.length > 0) {
        try {
          await addTagsToBookmark(newBookmark.id, tags);
        } catch (e) {
          console.error('保存标签失败:', e);
        }
      }
      
      setSaved(true);
      
      setTimeout(() => {
        window.close();
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('popup.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  // 添加标签
  const handleAddTag = () => {
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setNewTag('');
    }
  };

  // 删除标签
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  // 打开设置页面
  const openSettings = () => {
    chrome.runtime.openOptionsPage();
  };

  if (tabLoading) {
    return <LoadingSkeleton />;
  }

  // 快速保存模式 UI
  if (quickSaveMode && !showFullEditor) {
    return (
      <div className="w-[400px] bg-background">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">{t('popup.quickSave')}</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowFullEditor(true)}>
            <Edit3 className="w-4 h-4 mr-1" />
            {t('popup.edit')}
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {/* 页面信息 */}
          <div className="space-y-2">
            <div className="text-sm font-medium truncate">{title}</div>
            <div className="text-xs text-muted-foreground truncate">{tab?.url}</div>
          </div>

          {/* 状态指示 */}
          <QuickSaveStatus status={quickSaveStatus} message={error || undefined} t={t} />

          {/* AI 建议预览 */}
          {aiSuggestion && (
            <div className="text-sm space-y-2">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-primary" />
                <span>{aiSuggestion.category}</span>
                {matchedFolder && (
                  <Badge variant="outline" className="text-xs">现有</Badge>
                )}
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 取消按钮 */}
          {quickSaveStatus !== 'success' && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowFullEditor(true)}
            >
              {t('popup.switchToFullEdit')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // 完整编辑模式 UI
  return (
    <div className="w-[400px] min-h-[400px] bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">{t('popup.smartSave')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <Switch
              checked={quickSaveMode}
              onCheckedChange={(checked) => {
                setQuickSaveMode(checked);
                if (checked) performQuickSave();
              }}
              id="quick-mode"
            />
            <label htmlFor="quick-mode" className="text-xs text-muted-foreground cursor-pointer">
              {t('popup.quickMode')}
            </label>
          </div>
          <Button variant="ghost" size="icon" onClick={openSettings}>
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 设置警告 */}
        {!settingsValid && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription className="text-xs">
              {t('popup.pleaseConfigAI')}
              <Button 
                variant="link" 
                size="sm" 
                className="h-auto p-0 ml-2"
                onClick={openSettings}
              >
                {t('ai.goSettings')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* 错误提示 */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* 成功提示 */}
        {saved && (
          <Alert className="bg-green-50 border-green-200">
            <Check className="w-4 h-4 text-green-600" />
            <AlertDescription className="text-xs text-green-700">
              {t('popup.saveSuccess')}
            </AlertDescription>
          </Alert>
        )}

        {/* 标题输入 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('popup.title')}</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('popup.title')}
          />
        </div>

        {/* URL 显示 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('popup.url')}</label>
          <div className="text-xs text-muted-foreground truncate bg-muted p-2 rounded">
            {tab?.url}
          </div>
        </div>

        {/* AI 分析按钮 */}
        <Button
          variant="outline"
          className="w-full"
          onClick={analyzeWithAI}
          disabled={analyzing || !settingsValid}
        >
          {analyzing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('popup.analyzing')}
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              {aiSuggestion ? t('popup.reanalyze') : t('popup.aiAnalyze')}
            </>
          )}
        </Button>

        {/* AI 建议结果 */}
        {aiSuggestion && (
          <AISuggestionCard 
            suggestion={aiSuggestion}
            matchedFolder={matchedFolder}
            onCreateFolder={handleCreateFolder}
            isCreating={creatingFolder}
            t={t}
          />
        )}

        {/* 文件夹选择 */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Folder className="w-4 h-4" />
            {t('popup.saveTo')}
          </label>
          <div className="relative">
            <select
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="w-full h-10 px-3 pr-10 rounded-md border border-input bg-background text-sm appearance-none cursor-pointer"
            >
              <option value="">{t('popup.selectFolder')}</option>
              <optgroup label={t('popup.bookmarkBar')}>
                <option value={bookmarkBarId}>📑 {t('popup.bookmarkBar')}</option>
              </optgroup>
              {folders.length > 0 && (
                <optgroup label={t('popup.myFolders')}>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      📁 {folder.title}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* 标签 */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Tag className="w-4 h-4" />
            {t('popup.tags')}
          </label>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder={t('popup.addTag')}
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
            />
            <Button variant="outline" size="sm" onClick={handleAddTag}>
              {t('popup.add')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>

        <Separator />

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => window.close()}
          >
            {t('btn.cancel')}
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={saving || saved || !selectedFolder}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : (
              t('popup.saveBookmark')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default App;
