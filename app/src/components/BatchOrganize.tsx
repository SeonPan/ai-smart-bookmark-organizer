import { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { BookmarkTreeSelect } from './BookmarkTreeSelect';
import { useBookmarkTree, getAllFolders, flattenBookmarks, buildBookmarkIndex } from '@/hooks/useBookmarks';
import { useSettings } from '@/hooks/useSettings';
import { estimateOrganizeTokens, getOrganizeSuggestions, getOrganizeSummary } from '@/services/aiService';
import { createSnapshot, addOperationLog, addTagsToBookmark } from '@/services/storageService';
import { useLanguage } from '@/hooks/useLanguage';
import type { BookmarkNode } from '@/types';
import {
  FolderTree,
  AlertTriangle,
  Loader2,
  Play,
  Check,
  X,
  ArrowRight,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from 'lucide-react';

type OrganizeStep = 'select' | 'analyze' | 'processing' | 'preview' | 'complete';

interface OrganizeResult {
  bookmarkId: string;
  title: string;
  url: string;
  originalFolder: string;
  suggestedFolder: string;
  isNewCategory: boolean;
  reason?: string;
  tags?: string[];
}

// 文件夹名称规范化（用于匹配比较，忽略大小写和首尾空格）
const normalizeName = (name: string): string => name.trim().toLowerCase();

// 文件夹名称清洗（去除控制字符，限制长度，防止 AI 输出异常名称）
const sanitizeFolderName = (name: string): string => {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 50);
};

export const BatchOrganize = () => {
  const { tree, loading: treeLoading, refetch } = useBookmarkTree();
  const { settings, isValid: settingsValid } = useSettings();
  const { t } = useLanguage();
  
  // 步骤状态
  const [currentStep, setCurrentStep] = useState<OrganizeStep>('select');
  
  // 选择状态
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // 处理状态
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  
  // 结果状态
  const [organizeResults, setOrganizeResults] = useState<OrganizeResult[]>([]);
  const [organizeSummary, setOrganizeSummary] = useState<string>('');
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  // 分析失败的书签 ID
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [retrying, setRetrying] = useState(false);
  // 整理模式：是否在分类的同时生成标签
  const [withTags, setWithTags] = useState(false);
  // 预览中被用户排除（不认可）的变更
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  // 应用更改的结果统计
  const [applyResult, setApplyResult] = useState<{ moved: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // 预览列表的滚动容器引用（虚拟滚动）
  const previewScrollRef = useRef<HTMLDivElement>(null);
  
  // 预览变更列表（memo 化）
  const previewChanges = useMemo(
    () => organizeResults.filter(r => normalizeName(r.originalFolder) !== normalizeName(r.suggestedFolder)),
    [organizeResults]
  );
  
  // 虚拟滚动（Hook 必须顶层调用，count 随结果动态变化）
  const previewVirtualizer = useVirtualizer({
    count: previewChanges.length,
    getScrollElement: () => previewScrollRef.current,
    estimateSize: () => 37,
    overscan: 10
  });
  
  // 获取选中的书签
  const selectedBookmarks = useMemo(() => {
    const allBookmarks = flattenBookmarks(tree);
    return allBookmarks.filter(b => selectedIds.includes(b.id));
  }, [tree, selectedIds]);
  
  // 获取现有文件夹
  const existingFolders = useMemo(() => {
    return getAllFolders(tree);
  }, [tree]);
  
  // 书签树索引（O(1) 查找父文件夹与书签栏 ID）
  const bookmarkIndex = useMemo(() => buildBookmarkIndex(tree), [tree]);
  
  // Token 预估
  const tokenEstimate = useMemo(() => {
    if (selectedBookmarks.length === 0) return null;
    return estimateOrganizeTokens(
      selectedBookmarks,
      existingFolders.map(f => f.title),
      { ...settings, withTags }
    );
  }, [selectedBookmarks, existingFolders, settings, withTags]);
  
  // 检查是否超过阈值
  const isOverThreshold = useMemo(() => {
    if (!settingsValid) return true;
    if (!tokenEstimate) return false;
    return selectedBookmarks.length > settings.maxOrganizeCount ||
           tokenEstimate.estimatedTokens > settings.tokenWarningThreshold;
  }, [selectedBookmarks.length, tokenEstimate, settings, settingsValid]);
  
  // 开始分析
  const handleStartAnalyze = () => {
    if (selectedBookmarks.length === 0) {
      setError(t('batch.selectAtLeastOne'));
      return;
    }
    if (!settingsValid) {
      setError(t('batch.pleaseConfigAI'));
      return;
    }
    setCurrentStep('analyze');
    setError(null);
  };
  
  // 开始处理
  const handleStartProcess = async () => {
    setCurrentStep('processing');
    setProcessing(true);
    setProgress(0);
    setError(null);
    
    try {
      // 1. 创建快照
      const snapshot = await createSnapshot(tree, t('batch.snapshotDesc', { count: selectedBookmarks.length }));
      setSnapshotId(snapshot.id);
      
      // 2. 分批处理（分批逻辑在 service 层，通过 onProgress 回调更新进度）
      const folderNames = existingFolders.map(f => f.title);
      const totalCount = selectedBookmarks.length;
      setTotalBatches(Math.ceil(totalCount / 20));
      
      const { suggestions, failedIds } = await getOrganizeSuggestions(
        settings,
        selectedBookmarks,
        folderNames,
        (current, total) => {
          setProgress(Math.round((current / total) * 100));
          setCurrentBatch(Math.ceil(current / 20));
        },
        withTags
      );
      setFailedIds(failedIds);
      
      // 3. 处理结果
      const results: OrganizeResult[] = [];
      for (const bookmark of selectedBookmarks) {
        const suggestion = suggestions.get(bookmark.id);
        const originalFolder = getFolderLabel(bookmarkIndex.parentById.get(bookmark.id), t);
        
        results.push({
          bookmarkId: bookmark.id,
          title: bookmark.title,
          url: bookmark.url || '',
          originalFolder,
          suggestedFolder: suggestion?.category || originalFolder,
          isNewCategory: suggestion?.isNewCategory || false,
          reason: suggestion?.reason,
          tags: suggestion?.tags
        });
      }
      
      // 4. 生成整理思路摘要（仅在有实际变更时生成；失败不阻塞流程）
      const statsMap = new Map<string, { count: number; isNew: boolean }>();
      for (const r of results) {
        if (normalizeName(r.originalFolder) === normalizeName(r.suggestedFolder)) continue;
        const entry = statsMap.get(r.suggestedFolder) || { count: 0, isNew: r.isNewCategory };
        entry.count++;
        statsMap.set(r.suggestedFolder, entry);
      }
      if (statsMap.size > 0) {
        const summary = await getOrganizeSummary(
          settings,
          [...statsMap.entries()].map(([category, s]) => ({ category, count: s.count, isNew: s.isNew })),
          results.length
        );
        setOrganizeSummary(summary);
      } else {
        setOrganizeSummary('');
      }
      
      setProgress(100);
      setOrganizeResults(results);
      setCurrentStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : '处理失败');
      setCurrentStep('analyze');
    } finally {
      setProcessing(false);
    }
  };
  
  // 应用更改
  const handleApplyChanges = async () => {
    setProcessing(true);
    setError(null);
    
    try {
      // 只应用用户认可的变更（排除被取消勾选的项）
      const acceptedResults = organizeResults.filter(r => !excludedIds.includes(r.bookmarkId));
      
      // 创建新文件夹（如果需要），以规范化名称作为 key 去重
      const newFolders = new Map<string, string>();
      const bookmarkBarId = bookmarkIndex.bookmarkBarId;
      
      for (const result of acceptedResults) {
        const key = normalizeName(result.suggestedFolder);
        if (result.isNewCategory && !newFolders.has(key)) {
          const safeName = sanitizeFolderName(result.suggestedFolder);
          if (!safeName) continue;
          const newFolder = await chrome.bookmarks.create({
            parentId: bookmarkBarId,
            title: safeName
          });
          newFolders.set(key, newFolder.id);
        }
      }
      
      // 移动书签（逐条容错：单条失败不中断整体，最后汇总报告；位置不变的跳过）
      let movedCount = 0;
      let failedCount = 0;
      for (const result of acceptedResults) {
        // 原位置与建议位置一致，无需移动
        if (normalizeName(result.originalFolder) === normalizeName(result.suggestedFolder)) {
          continue;
        }
        try {
          const key = normalizeName(result.suggestedFolder);
          const targetFolderId = result.isNewCategory
            ? newFolders.get(key)
            : existingFolders.find(f => normalizeName(f.title) === key)?.id;
          
          if (targetFolderId) {
            await chrome.bookmarks.move(result.bookmarkId, { parentId: targetFolderId });
            movedCount++;
          }
        } catch (moveError) {
          // 书签可能已被用户手动删除/移动，记录失败继续处理
          console.error(`移动书签失败 (${result.title}):`, moveError);
          failedCount++;
        }
      }
      
      // 写入标签（移动过的和未移动的书签都打标，保证标签可视化完整）
      let taggedCount = 0;
      for (const result of acceptedResults) {
        if (result.tags && result.tags.length > 0) {
          try {
            await addTagsToBookmark(result.bookmarkId, result.tags);
            taggedCount++;
          } catch (tagError) {
            console.error(`写入标签失败 (${result.title}):`, tagError);
          }
        }
      }
      
      // 记录操作日志（关联快照，便于回滚追溯）
      await addOperationLog({
        type: 'organize',
        affectedCount: movedCount,
        description: taggedCount > 0
          ? t('batch.logWithTags', { moved: movedCount, tags: taggedCount })
          : t('batch.logDesc', { count: movedCount }),
        snapshotId: snapshotId || undefined
      });
      
      // 刷新书签树
      await refetch();
      
      setApplyResult({ moved: movedCount, failed: failedCount });
      setCurrentStep('complete');
    } catch (e) {
      setError(e instanceof Error ? e.message : '应用更改失败');
    } finally {
      setProcessing(false);
    }
  };
  
  // 重试分析失败的书签
  const handleRetryFailed = async () => {
    const failedBookmarks = selectedBookmarks.filter(b => failedIds.includes(b.id));
    if (failedBookmarks.length === 0) return;
    
    setRetrying(true);
    setError(null);
    
    try {
      const folderNames = existingFolders.map(f => f.title);
      const { suggestions, failedIds: stillFailed } = await getOrganizeSuggestions(
        settings,
        failedBookmarks,
        folderNames,
        undefined,
        withTags
      );
      
      // 将重试成功的结果合并进现有结果
      setOrganizeResults(prev => prev.map(r => {
        const suggestion = suggestions.get(r.bookmarkId);
        if (!suggestion) return r;
        return {
          ...r,
          suggestedFolder: suggestion.category || r.originalFolder,
          isNewCategory: suggestion.isNewCategory || false,
          reason: suggestion.reason,
          tags: suggestion.tags
        };
      }));
      setFailedIds(stillFailed);
    } catch (e) {
      setError(e instanceof Error ? e.message : '重试失败');
    } finally {
      setRetrying(false);
    }
  };
  
  // 取消/返回
  const handleCancel = () => {
    setCurrentStep('select');
    setSelectedIds([]);
    setOrganizeResults([]);
    setOrganizeSummary('');
    setSnapshotId(null);
    setFailedIds([]);
    setExcludedIds([]);
    setApplyResult(null);
    setError(null);
  };
  
  // 渲染步骤指示器
  const StepIndicator = () => {
    const steps = [
      { key: 'select', label: t('batch.selectBookmarks') },
      { key: 'analyze', label: t('batch.confirmAnalyze') },
      { key: 'processing', label: t('batch.aiProcessing') },
      { key: 'preview', label: t('batch.previewResults') }
    ];
    
    const currentIndex = steps.findIndex(s => s.key === currentStep);
    
    return (
      <div className="flex items-center gap-2 mb-6">
        {steps.map((step, index) => (
          <div key={step.key} className="flex items-center">
            <div
              className={`px-3 py-1 rounded-full text-sm ${
                index <= currentIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {index + 1}. {step.label}
            </div>
            {index < steps.length - 1 && (
              <ChevronRight className="w-4 h-4 mx-1 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>
    );
  };
  
  // 选择步骤
  if (currentStep === 'select') {
    return (
      <div className="space-y-4">
        <StepIndicator />
        
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="w-5 h-5" />
              {t('batch.selectBookmarks')}
            </CardTitle>
            <CardDescription>
              {t('batch.selectBookmarks')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {treeLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <BookmarkTreeSelect
                nodes={tree}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                showBookmarks={true}
              />
            )}
            
            <div className="flex items-center justify-between pt-4">
              <div className="text-sm text-muted-foreground">
                {t('batch.selectedCount')} <span className="font-medium text-foreground">{selectedBookmarks.length}</span> {t('batch.bookmarks')}
              </div>
              <Button
                onClick={handleStartAnalyze}
                disabled={selectedBookmarks.length === 0 || !settingsValid}
              >
                {t('btn.next')}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // 分析确认步骤
  if (currentStep === 'analyze') {
    return (
      <div className="space-y-4">
        <StepIndicator />
        
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <Card>
          <CardHeader>
            <CardTitle>{t('batch.confirmAnalyze')}</CardTitle>
            <CardDescription>
              {t('batch.confirmAnalyze')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">{t('batch.bookmarks')}</div>
                <div className="text-2xl font-semibold">{selectedBookmarks.length}</div>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">{t('batch.existingFolders')}</div>
                <div className="text-2xl font-semibold">{existingFolders.length}</div>
              </div>
            </div>
            
            {tokenEstimate && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="text-sm font-medium">{t('organize.tokenEstimate')}</div>
                <div className="text-sm">
                  <span className="text-muted-foreground">{t('organize.estimatedTokens')}: </span>
                  <span>{tokenEstimate.estimatedTokens.toLocaleString()}</span>
                </div>
                {tokenEstimate.warning && (
                  <Alert className="mt-2 border-amber-300 bg-amber-50">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <AlertDescription className="text-amber-700">{tokenEstimate.warning}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
            
            {isOverThreshold && (
              <Alert className="border-amber-300 bg-amber-50">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-amber-700">
                  {t('organize.tokenDescription')}
                </AlertDescription>
              </Alert>
            )}
            
            {/* 整理模式：是否在分类的同时生成标签 */}
            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <Checkbox
                id="with-tags"
                checked={withTags}
                onCheckedChange={(checked) => setWithTags(!!checked)}
                className="mt-0.5"
              />
              <label htmlFor="with-tags" className="cursor-pointer">
                <div className="text-sm font-medium">{t('batch.withTags')}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t('batch.withTagsHint')}
                </div>
              </label>
            </div>
            
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setCurrentStep('select')}>
                <ChevronLeft className="w-4 h-4 mr-2" />
                {t('btn.back')}
              </Button>
              <Button onClick={handleStartProcess} disabled={isOverThreshold && !settingsValid}>
                <Play className="w-4 h-4 mr-2" />
                {t('batch.startOrganize')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // 处理中步骤
  if (currentStep === 'processing') {
    return (
      <div className="space-y-4">
        <StepIndicator />
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              {t('batch.processing')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{t('batch.processingProgress')}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
            
            <div className="text-center text-sm text-muted-foreground">
              {t('batch.batchInfo', { current: currentBatch, total: totalBatches })}
            </div>
            
            <div className="text-xs text-muted-foreground text-center">
              {t('batch.snapshotCreated')}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // 预览步骤
  if (currentStep === 'preview') {
    const changes = previewChanges;
    const newCategories = [...new Set(organizeResults.filter(r => r.isNewCategory).map(r => r.suggestedFolder))];
    
    // 虚拟滚动：只渲染可视区域的行，大量变更也不卡顿
    const rowVirtualizer = previewVirtualizer;
    
    return (
      <div className="space-y-4">
        <StepIndicator />
        
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        <Card>
          <CardHeader>
            <CardTitle>{t('batch.previewTitle')}</CardTitle>
            <CardDescription>
              {t('batch.previewTitle')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 分析失败警告（优先展示，避免误解为“无需移动”），支持仅重试失败项 */}
            {failedIds.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription className="flex items-center justify-between gap-2">
                  <span>{t('batch.analyzeFailed', { count: failedIds.length })}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetryFailed}
                    disabled={retrying}
                  >
                    {retrying ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-1" />
                    )}
                    {retrying ? t('batch.retrying') : t('batch.retryFailed')}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            
            {/* 无变更提示（仅在无失败时展示） */}
            {failedIds.length === 0 && changes.length === 0 && (
              <Alert className="border-green-200 bg-green-50">
                <Check className="w-4 h-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  {t('batch.noChangesNeeded')}
                </AlertDescription>
              </Alert>
            )}
            
            {/* 整理思路摘要 */}
            {organizeSummary && (
              <Alert className="border-blue-200 bg-blue-50">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <span className="font-medium">{t('batch.summaryTitle')}：</span>
                  {organizeSummary}
                </AlertDescription>
              </Alert>
            )}
            
            {/* 统计 */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="text-2xl font-semibold">{organizeResults.length}</div>
                <div className="text-xs text-muted-foreground">{t('batch.analyzed')}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="text-2xl font-semibold">{changes.length}</div>
                <div className="text-xs text-muted-foreground">{t('batch.willMove')}</div>
              </div>
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="text-2xl font-semibold">{newCategories.length}</div>
                <div className="text-xs text-muted-foreground">{t('batch.newFolders')}</div>
              </div>
            </div>
            
            {/* 新建文件夹提示 */}
            {newCategories.length > 0 && (
              <Alert>
                <AlertDescription>
                  {t('batch.willCreateFolders')}：{newCategories.join('、')}
                </AlertDescription>
              </Alert>
            )}
            
            {/* 变更列表（虚拟滚动完整显示所有变更，可取消勾选不认可的项） */}
            {changes.length > 0 && (
            <div className="border rounded-lg">
              {/* 表头 */}
              <div className="flex items-center bg-muted rounded-t-lg border-b">
                <div className="px-3 py-2 w-10">
                  <Checkbox
                    checked={excludedIds.length === 0}
                    onCheckedChange={(checked) => {
                      // 全选/全不选
                      setExcludedIds(checked ? [] : changes.map(c => c.bookmarkId));
                    }}
                    title={t('batch.toggleAll')}
                  />
                </div>
                <div className="px-3 py-2 flex-1 text-sm font-medium">{t('batch.colBookmark')}</div>
                <div className="px-3 py-2 w-28 text-sm font-medium">{t('batch.colOriginal')}</div>
                <div className="px-3 py-2 w-32 text-sm font-medium">{t('batch.colSuggested')}</div>
              </div>
              {/* 虚拟滚动行 */}
              <div ref={previewScrollRef} className="max-h-[360px] overflow-auto">
                <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                  {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                    const result = changes[virtualItem.index];
                    const excluded = excludedIds.includes(result.bookmarkId);
                    return (
                      <div
                        key={result.bookmarkId}
                        className={`flex items-center border-t absolute top-0 left-0 w-full ${excluded ? 'opacity-40' : ''}`}
                        style={{ transform: `translateY(${virtualItem.start}px)` }}
                        title={result.reason || undefined}
                      >
                        <div className="px-3 py-2 w-10">
                          <Checkbox
                            checked={!excluded}
                            onCheckedChange={(checked) => {
                              setExcludedIds(prev =>
                                checked
                                  ? prev.filter(id => id !== result.bookmarkId)
                                  : [...prev, result.bookmarkId]
                              );
                            }}
                          />
                        </div>
                        <div
                          className="px-3 py-2 flex-1 text-sm truncate"
                          title={[
                            result.title,
                            result.reason,
                            result.tags && result.tags.length > 0
                              ? `${t('batch.tagsLabel')}: ${result.tags.join(', ')}`
                              : null
                          ].filter(Boolean).join('\n')}
                        >
                          {result.title}
                        </div>
                        <div className="px-3 py-2 w-28 text-sm text-muted-foreground truncate">
                          {result.originalFolder}
                        </div>
                        <div className="px-3 py-2 w-32 text-sm truncate">
                          <span className={result.isNewCategory ? 'text-amber-600' : 'text-green-600'}>
                            {result.suggestedFolder}
                            {result.isNewCategory && ` ${t('batch.newTag')}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            )}
            
            {/* 排除项提示 */}
            {excludedIds.length > 0 && (
              <div className="text-sm text-muted-foreground text-right">
                {t('batch.excludedCount', { count: excludedIds.length })}
              </div>
            )}
            
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handleCancel}>
                <X className="w-4 h-4 mr-2" />
                {t('btn.cancel')}
              </Button>
              <Button onClick={handleApplyChanges} disabled={processing || changes.length === 0 || excludedIds.length >= changes.length}>
                {processing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                {t('batch.applyChanges')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // 完成步骤
  if (currentStep === 'complete') {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle>{t('batch.organizeComplete')}</CardTitle>
            <CardDescription>
              {applyResult && applyResult.failed > 0
                ? t('batch.applyPartial', { moved: applyResult.moved, failed: applyResult.failed })
                : t('batch.organizeSuccess', { count: applyResult?.moved ?? organizeResults.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div className="text-sm text-muted-foreground">
              {t('batch.canRollback')}
            </div>
            <Button onClick={handleCancel}>
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('batch.continueOrganize')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return null;
};

// 系统文件夹名称的翻译键映射
const SYSTEM_FOLDER_KEYS: Record<string, string> = {
  '0': 'folder.root',
  '1': 'folder.bookmarksBar',
  '2': 'folder.other',
  '3': 'folder.mobile',
  'bookmarks-bar': 'folder.bookmarksBar',
  'other': 'folder.other',
  'mobile': 'folder.mobile'
};

// 辅助函数：获取文件夹的显示名称（系统文件夹使用本地化名称）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getFolderLabel = (folder: BookmarkNode | undefined, t: any): string => {
  if (!folder) return t('folder.unknown');
  const folderType = (folder as { folderType?: string }).folderType;
  const key = (folderType && SYSTEM_FOLDER_KEYS[folderType]) || SYSTEM_FOLDER_KEYS[folder.id];
  if (key) return t(key);
  return folder.title || t('folder.unknown');
};

export default BatchOrganize;
