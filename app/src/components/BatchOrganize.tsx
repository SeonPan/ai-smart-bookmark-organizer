import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { BookmarkTreeSelect } from './BookmarkTreeSelect';
import { useBookmarkTree, getAllFolders, flattenBookmarks } from '@/hooks/useBookmarks';
import { useSettings } from '@/hooks/useSettings';
import { estimateOrganizeTokens, getOrganizeSuggestions } from '@/services/aiService';
import { createSnapshot } from '@/services/storageService';
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
  ChevronRight
} from 'lucide-react';

type OrganizeStep = 'select' | 'analyze' | 'processing' | 'preview' | 'complete';

interface OrganizeResult {
  bookmarkId: string;
  title: string;
  url: string;
  originalFolder: string;
  suggestedFolder: string;
  isNewCategory: boolean;
}

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
  const [error, setError] = useState<string | null>(null);
  
  // 获取选中的书签
  const selectedBookmarks = useMemo(() => {
    const allBookmarks = flattenBookmarks(tree);
    return allBookmarks.filter(b => selectedIds.includes(b.id));
  }, [tree, selectedIds]);
  
  // 获取现有文件夹
  const existingFolders = useMemo(() => {
    return getAllFolders(tree);
  }, [tree]);
  
  // Token 预估
  const tokenEstimate = useMemo(() => {
    if (selectedBookmarks.length === 0) return null;
    return estimateOrganizeTokens(
      selectedBookmarks,
      existingFolders.map(f => f.title)
    );
  }, [selectedBookmarks, existingFolders]);
  
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
      await createSnapshot(tree, `批量整理前 - ${selectedBookmarks.length} 个书签`);
      
      // 2. 分批处理
      const batchSize = 20;
      const batches: BookmarkNode[][] = [];
      for (let i = 0; i < selectedBookmarks.length; i += batchSize) {
        batches.push(selectedBookmarks.slice(i, i + batchSize));
      }
      setTotalBatches(batches.length);
      
      const results: OrganizeResult[] = [];
      const folderNames = existingFolders.map(f => f.title);
      
      for (let i = 0; i < batches.length; i++) {
        setCurrentBatch(i + 1);
        setProgress(Math.round((i / batches.length) * 100));
        
        const batch = batches[i];
        const suggestions = await getOrganizeSuggestions(
          settings,
          batch,
          folderNames
        );
        
        // 处理结果
        for (const bookmark of batch) {
          const suggestion = suggestions.get(bookmark.id);
          const originalFolder = findParentFolderName(tree, bookmark.id);
          
          results.push({
            bookmarkId: bookmark.id,
            title: bookmark.title,
            url: bookmark.url || '',
            originalFolder,
            suggestedFolder: suggestion?.category || originalFolder,
            isNewCategory: suggestion?.isNewCategory || false
          });
        }
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
      // 创建新文件夹（如果需要）
      const newFolders = new Map<string, string>();
      
      for (const result of organizeResults) {
        if (result.isNewCategory && !newFolders.has(result.suggestedFolder)) {
          // 在书签栏下创建新文件夹
          const bookmarkBarId = findBookmarkBarId(tree);
          const newFolder = await chrome.bookmarks.create({
            parentId: bookmarkBarId,
            title: result.suggestedFolder
          });
          newFolders.set(result.suggestedFolder, newFolder.id);
        }
      }
      
      // 移动书签
      for (const result of organizeResults) {
        const targetFolderId = result.isNewCategory
          ? newFolders.get(result.suggestedFolder)
          : existingFolders.find(f => f.title === result.suggestedFolder)?.id;
        
        if (targetFolderId && targetFolderId !== result.bookmarkId) {
          await chrome.bookmarks.move(result.bookmarkId, { parentId: targetFolderId });
        }
      }
      
      // 刷新书签树
      await refetch();
      
      setCurrentStep('complete');
    } catch (e) {
      setError(e instanceof Error ? e.message : '应用更改失败');
    } finally {
      setProcessing(false);
    }
  };
  
  // 取消/返回
  const handleCancel = () => {
    setCurrentStep('select');
    setSelectedIds([]);
    setOrganizeResults([]);
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
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('organize.estimatedTokens')}: </span>
                    <span>{tokenEstimate.estimatedTokens.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('organize.estimatedCost')}: </span>
                    <span>${tokenEstimate.estimatedCost.toFixed(4)}</span>
                  </div>
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
    const changes = organizeResults.filter(r => r.originalFolder !== r.suggestedFolder);
    const newCategories = [...new Set(organizeResults.filter(r => r.isNewCategory).map(r => r.suggestedFolder))];
    
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
            
            {/* 变更列表 */}
            <div className="border rounded-lg max-h-[300px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">书签</th>
                    <th className="px-3 py-2 text-left">原位置</th>
                    <th className="px-3 py-2 text-left">新位置</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.slice(0, 20).map((result) => (
                    <tr key={result.bookmarkId} className="border-t">
                      <td className="px-3 py-2 truncate max-w-[150px]" title={result.title}>
                        {result.title}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {result.originalFolder}
                      </td>
                      <td className="px-3 py-2">
                        <span className={result.isNewCategory ? 'text-amber-600' : 'text-green-600'}>
                          {result.suggestedFolder}
                          {result.isNewCategory && ' (新)'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {changes.length > 20 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-center text-muted-foreground">
                        {t('batch.moreChanges', { count: changes.length - 20 })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handleCancel}>
                <X className="w-4 h-4 mr-2" />
                {t('btn.cancel')}
              </Button>
              <Button onClick={handleApplyChanges} disabled={processing}>
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
              {t('batch.organizeSuccess', { count: organizeResults.length })}
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

// 系统文件夹名称映射
const SYSTEM_FOLDER_NAMES: Record<string, string> = {
  '0': '根',
  '1': '书签栏',
  '2': '其他书签',
  '3': '移动书签',
  'bookmarks-bar': '书签栏',
  'other': '其他书签',
  'mobile': '移动书签'
};

// 辅助函数：查找父文件夹名称（递归搜索所有层级）
const findParentFolderName = (nodes: BookmarkNode[], bookmarkId: string): string => {
  for (const node of nodes) {
    // 检查当前节点的直接子节点
    if (node.children) {
      for (const child of node.children) {
        if (child.id === bookmarkId) {
          // 找到父节点，返回其友好名称
          const folderType = (node as { folderType?: string }).folderType;
          if (folderType && SYSTEM_FOLDER_NAMES[folderType]) {
            return SYSTEM_FOLDER_NAMES[folderType];
          }
          if (SYSTEM_FOLDER_NAMES[node.id]) {
            return SYSTEM_FOLDER_NAMES[node.id];
          }
          return node.title || '未知';
        }
      }
      
      // 递归搜索子节点
      const found = findParentFolderName(node.children, bookmarkId);
      if (found && found !== '未知') {
        return found;
      }
    }
  }
  return '未知';
};

// 辅助函数：查找书签栏 ID
const findBookmarkBarId = (nodes: BookmarkNode[]): string => {
  for (const node of nodes) {
    if (node.title === '书签栏' || node.title === 'Bookmarks Bar') {
      return node.id;
    }
    if (node.children) {
      const found = findBookmarkBarId(node.children);
      if (found) return found;
    }
  }
  return '1';
};

export default BatchOrganize;
