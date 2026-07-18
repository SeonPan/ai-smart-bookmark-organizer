import { useState, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useBookmarkTree, flattenBookmarks, buildBookmarkIndex } from '@/hooks/useBookmarks';
import { addOperationLog, createSnapshot } from '@/services/storageService';
import { normalizeUrl } from '@/lib/url';
import { getLinkCheckCache, updateLinkCheckCache, isCacheFresh } from '@/lib/linkCache';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import type { BookmarkNode } from '@/types';
import {
  Trash2,
  Link2,
  Copy,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Folder,
  RefreshCw,
  Search,
  X,
  Info
} from 'lucide-react';

// 失效链接检测结果
interface BrokenLinkResult {
  bookmark: BookmarkNode;
  status: number;
  statusText: string;
  reason: string;
}

// 重复书签组
interface DuplicateGroup {
  url: string;
  bookmarks: BookmarkNode[];
}

interface LinkVerdict {
  isBroken: boolean;
  status: number;
  statusText: string;
  reason: string;
}

// 根据 HTTP 状态码解读链接是否失效
const interpretStatus = (status: number): LinkVerdict => {
  if (status === 0) {
    return { isBroken: true, status, statusText: '无法访问', reason: '网络连接失败或域名不存在' };
  }
  if (status === 404 || status === 410) {
    return { isBroken: true, status, statusText: `HTTP ${status}`, reason: '页面不存在' };
  }
  if (status >= 500) {
    return { isBroken: true, status, statusText: `HTTP ${status}`, reason: '服务器错误' };
  }
  // 2xx/3xx/4xx（如 401/403 多为反爬或需登录，不视为失效）
  return { isBroken: false, status, statusText: `HTTP ${status}`, reason: '' };
};

// 检测链接是否失效（通过 background 代理获取真实 HTTP 状态码，不受 CORS 限制）
const checkLinkStatus = (url: string): Promise<LinkVerdict> => {
  // 跳过特殊协议
  if (url.startsWith('chrome://') || url.startsWith('javascript:') || url.startsWith('data:') || url.startsWith('file://')) {
    return Promise.resolve({ isBroken: false, status: 200, statusText: 'OK', reason: '特殊协议' });
  }
  
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'CHECK_LINK', url }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        resolve({ isBroken: false, status: -1, statusText: '检测失败', reason: '检测请求失败' });
        return;
      }
      resolve(interpretStatus(response.data.status));
    });
  });
};

export const CleanMaster = () => {
  const { tree, loading: treeLoading, refetch } = useBookmarkTree();
  const { t } = useLanguage();
  
  // 扫描状态
  const [scanningBroken, setScanningBroken] = useState(false);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [brokenLinks, setBrokenLinks] = useState<BrokenLinkResult[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // 失效链接扫描进度与取消
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const cancelScanRef = useRef(false);
  const [cancelling, setCancelling] = useState(false);
  
  // 按文件夹筛选显示（null = 显示全部）
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  
  // 选中状态
  const [selectedBrokenIds, setSelectedBrokenIds] = useState<string[]>([]);
  const [selectedDuplicateUrls, setSelectedDuplicateUrls] = useState<string[]>([]);
  const [keepSelections, setKeepSelections] = useState<Map<string, string>>(new Map());
  
  // 删除确认对话框
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteType, setDeleteType] = useState<'broken' | 'duplicates' | null>(null);

  // 获取所有书签
  const allBookmarks = useMemo(() => {
    return flattenBookmarks(tree);
  }, [tree]);
  
  // 书签树索引（O(1) 查找父文件夹）
  const bookmarkIndex = useMemo(() => buildBookmarkIndex(tree), [tree]);

  // 扫描失效链接（8 路并发 + 进度显示 + 可取消 + 24 小时结果缓存）
  // forceRefresh=true 时跳过缓存强制重新检测（用于“重新扫描”按钮）
  const scanBrokenLinks = useCallback(async (forceRefresh = false) => {
    setScanningBroken(true);
    setError(null);
    setSelectedBrokenIds([]);
    cancelScanRef.current = false;
    setCancelling(false);
    
    const targets = allBookmarks.filter(b => b.url);
    const total = targets.length;
    setScanProgress({ done: 0, total });
    
    // 读取 24 小时内的检测缓存
    const cache = forceRefresh ? new Map() : await getLinkCheckCache();
    const updates = new Map<string, number>();
    
    const results: BrokenLinkResult[] = [];
    const CONCURRENCY = 8;
    let index = 0;
    let done = 0;
    
    // 并发工作器：从共享索引取任务，直到耗尽或被取消
    const worker = async () => {
      while (index < targets.length && !cancelScanRef.current) {
        const bookmark = targets[index++];
        const url = bookmark.url!;
        
        // 命中新鲜缓存则直接使用，否则联网检测
        const cached = cache.get(url);
        let verdict: LinkVerdict;
        if (cached && isCacheFresh(cached)) {
          verdict = interpretStatus(cached.status);
        } else {
          verdict = await checkLinkStatus(url);
          // 检测请求本身失败（status=-1）时不写入缓存
          if (verdict.status !== -1 && verdict.statusText !== '检测失败') {
            updates.set(url, verdict.status);
          }
        }
        
        // 只记录明确失效的链接
        if (verdict.isBroken) {
          results.push({
            bookmark,
            status: verdict.status,
            statusText: verdict.statusText,
            reason: verdict.reason
          });
        }
        
        done++;
        setScanProgress({ done, total });
      }
    };
    
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    
    const wasCancelled = cancelScanRef.current;
    
    if (wasCancelled) {
      // 取消扫描：丢弃本次部分结果，保留上次完整结果并提示
      if (brokenLinks.length > 0) {
        toast.info(t('clean.scanCancelledKeep', { count: brokenLinks.length }));
      } else {
        toast.info(t('clean.scanCancelled'));
      }
    } else {
      // 正常完成：写回缓存并更新结果
      await updateLinkCheckCache(updates);
      setBrokenLinks(results);
      setFolderFilter(null);
    }
    
    setScanningBroken(false);
    setCancelling(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBookmarks, brokenLinks.length, t]);
  
  // 取消扫描：立即给出反餮，进行中的请求在后台收尾（结果丢弃）
  const cancelScan = useCallback(() => {
    cancelScanRef.current = true;
    setCancelling(true);
  }, []);

  // 扫描重复书签
  const scanDuplicates = useCallback(() => {
    setScanningDuplicates(true);
    setError(null);
    setDuplicates([]);
    setSelectedDuplicateUrls([]);
    setKeepSelections(new Map());
    
    // 按 URL 分组
    const urlMap = new Map<string, BookmarkNode[]>();
    
    for (const bookmark of allBookmarks) {
      if (!bookmark.url) continue;
      
      const normalizedUrl = normalizeUrl(bookmark.url);
      if (!urlMap.has(normalizedUrl)) {
        urlMap.set(normalizedUrl, []);
      }
      urlMap.get(normalizedUrl)!.push(bookmark);
    }
    
    // 找出重复的（数量 > 1 的）
    const duplicateGroups: DuplicateGroup[] = [];
    urlMap.forEach((bookmarks, url) => {
      if (bookmarks.length > 1) {
        duplicateGroups.push({ url, bookmarks });
      }
    });
    
    setDuplicates(duplicateGroups);
    setScanningDuplicates(false);
    
    // 如果没有重复书签，显示提示
    if (duplicateGroups.length === 0) {
      toast.success(t('clean.noDuplicates'));
    }
  }, [allBookmarks, t]);

  // 获取书签所在文件夹名称（O(1) 索引查找）
  const getFolderName = (bookmarkId: string): string => {
    const parent = bookmarkIndex.parentById.get(bookmarkId);
    if (!parent) return t('folder.unknown');
    // 系统文件夹的 title 可能为空，使用本地化名称
    if (!parent.title) return t('folder.bookmarksBar');
    return parent.title;
  };

  // 失效链接涉及的文件夹及其数量（用于按文件夹批量选取）
  // 注意：必须声明在 getFolderName 之后，否则 memo 工厂函数触发 TDZ 错误
  const brokenFolders = useMemo(() => {
    const folderMap = new Map<string, number>();
    for (const result of brokenLinks) {
      const folder = getFolderName(result.bookmark.id);
      folderMap.set(folder, (folderMap.get(folder) || 0) + 1);
    }
    return [...folderMap.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokenLinks, bookmarkIndex]);
  
  // 全选/全不选失效链接
  const selectAllBroken = () => {
    setSelectedBrokenIds(brokenLinks.map(r => r.bookmark.id));
  };
  const deselectAllBroken = () => {
    setSelectedBrokenIds([]);
  };
  
  // 点击文件夹徽章：筛选列表只显示该文件夹的失效链接，同时整组选中
  // 再次点击或点击“显示全部”恢复完整列表（已勾选状态保留）
  const handleFolderBadgeClick = (folder: string) => {
    if (folderFilter === folder) {
      setFolderFilter(null);
      return;
    }
    setFolderFilter(folder);
    const folderIds = brokenLinks
      .filter(r => getFolderName(r.bookmark.id) === folder)
      .map(r => r.bookmark.id);
    setSelectedBrokenIds(prev => [...new Set([...prev, ...folderIds])]);
  };
  
  // 筛选后的显示列表
  const displayedBrokenLinks = folderFilter
    ? brokenLinks.filter(r => getFolderName(r.bookmark.id) === folderFilter)
    : brokenLinks;
  
  // 删除失效链接
  const deleteBrokenLinks = async () => {
    setDeleting(true);
    setError(null);
    
    try {
      // 删除前创建快照，确保可回滚
      const snapshot = await createSnapshot(tree, t('clean.snapshotBroken', { count: selectedBrokenIds.length }));
      
      for (const id of selectedBrokenIds) {
        await chrome.bookmarks.remove(id);
      }
      
      // 记录操作
      await addOperationLog({
        type: 'clean',
        affectedCount: selectedBrokenIds.length,
        description: t('clean.logBroken', { count: selectedBrokenIds.length }),
        snapshotId: snapshot.id
      });
      
      toast.success(t('clean.deleteBrokenSuccess', { count: selectedBrokenIds.length }));
      setBrokenLinks(prev => prev.filter(b => !selectedBrokenIds.includes(b.bookmark.id)));
      setSelectedBrokenIds([]);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  // 删除重复书签
  const deleteDuplicates = async () => {
    setDeleting(true);
    setError(null);
    
    try {
      // 删除前创建快照，确保可回滚
      const snapshot = await createSnapshot(tree, t('clean.snapshotDuplicates', { count: selectedDuplicateUrls.length }));
      
      let deletedCount = 0;
      
      for (const url of selectedDuplicateUrls) {
        const group = duplicates.find(d => d.url === url);
        if (!group) continue;
        
        const keepId = keepSelections.get(url);
        
        for (const bookmark of group.bookmarks) {
          // 跳过要保留的书签
          if (bookmark.id === keepId) continue;
          
          await chrome.bookmarks.remove(bookmark.id);
          deletedCount++;
        }
      }
      
      // 记录操作
      await addOperationLog({
        type: 'clean',
        affectedCount: deletedCount,
        description: t('clean.logDuplicates', { count: deletedCount }),
        snapshotId: snapshot.id
      });
      
      toast.success(t('clean.deleteDuplicatesSuccess', { count: deletedCount }));
      setDuplicates(prev => prev.filter(d => !selectedDuplicateUrls.includes(d.url)));
      setSelectedDuplicateUrls([]);
      setKeepSelections(new Map());
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  // 打开删除确认对话框
  const openDeleteDialog = (type: 'broken' | 'duplicates') => {
    setDeleteType(type);
    setDeleteDialogOpen(true);
  };

  if (treeLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="broken" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="broken" className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            {t('clean.brokenLinks')}
          </TabsTrigger>
          <TabsTrigger value="duplicates" className="flex items-center gap-2">
            <Copy className="w-4 h-4" />
            {t('clean.duplicates')}
          </TabsTrigger>
        </TabsList>

        {/* 失效链接 */}
        <TabsContent value="broken" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="w-5 h-5" />
                {t('clean.brokenLinks')}
              </CardTitle>
              <CardDescription className="flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {t('clean.brokenDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {scanningBroken ? (
                <div className="py-8 space-y-4">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {cancelling
                      ? t('clean.cancelling')
                      : t('clean.scanning', { done: scanProgress.done, total: scanProgress.total })}
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${scanProgress.total > 0 ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <Button variant="outline" size="sm" onClick={cancelScan} disabled={cancelling}>
                      {cancelling ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <X className="w-4 h-4 mr-1" />
                      )}
                      {cancelling ? t('clean.cancelling') : t('btn.cancel')}
                    </Button>
                  </div>
                </div>
              ) : brokenLinks.length === 0 ? (
                <div className="text-center py-8">
                  <Button onClick={() => scanBrokenLinks()} disabled={scanningBroken}>
                    <Search className="w-4 h-4 mr-2" />
                    {t('clean.scan')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      {t('clean.foundBroken', { count: brokenLinks.length })}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => scanBrokenLinks(true)}
                        disabled={scanningBroken}
                      >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        {t('clean.rescan')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={selectedBrokenIds.length === 0}
                        onClick={() => openDeleteDialog('broken')}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        {t('clean.deleteSelected')} ({selectedBrokenIds.length})
                      </Button>
                    </div>
                  </div>
                  
                  {/* 批量选择：一键全选/全不选 + 按文件夹筛选选取 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={selectAllBroken}>
                      {t('clean.selectAll')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={deselectAllBroken}>
                      {t('clean.deselectAll')}
                    </Button>
                    {brokenFolders.length > 1 && (
                      <>
                        <span className="text-xs text-muted-foreground ml-2">
                          {t('clean.selectByFolder')}:
                        </span>
                        {brokenFolders.map(([folder, count]) => (
                          <Badge
                            key={folder}
                            variant={folderFilter === folder ? 'default' : 'outline'}
                            className="cursor-pointer hover:bg-primary/80"
                            onClick={() => handleFolderBadgeClick(folder)}
                          >
                            {folder} ({count})
                          </Badge>
                        ))}
                        {folderFilter && (
                          <Badge
                            variant="secondary"
                            className="cursor-pointer"
                            onClick={() => setFolderFilter(null)}
                          >
                            {t('clean.showAll')} ×
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                  
                  <div className="border rounded-lg divide-y">
                    {displayedBrokenLinks.map((result) => (
                      <div
                        key={result.bookmark.id}
                        className="flex items-center gap-3 p-3 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selectedBrokenIds.includes(result.bookmark.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedBrokenIds(prev => [...prev, result.bookmark.id]);
                            } else {
                              setSelectedBrokenIds(prev => prev.filter(id => id !== result.bookmark.id));
                            }
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {result.bookmark.title}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {result.bookmark.url}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="destructive" className="text-xs">
                              {result.statusText}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {result.reason}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {t('clean.locatedIn')} {getFolderName(result.bookmark.id)}
                            </span>
                          </div>
                        </div>
                        <a
                          href={result.bookmark.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 重复书签 */}
        <TabsContent value="duplicates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Copy className="w-5 h-5" />
                {t('clean.duplicates')}
              </CardTitle>
              <CardDescription>
                {t('clean.duplicateDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {duplicates.length === 0 ? (
                <div className="text-center py-8">
                  <Button onClick={scanDuplicates} disabled={scanningDuplicates}>
                    {scanningDuplicates ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4 mr-2" />
                    )}
                    {scanningDuplicates ? '扫描中...' : t('clean.scan')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      {t('clean.foundDuplicates', { count: duplicates.length })}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={scanDuplicates}
                        disabled={scanningDuplicates}
                      >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        {t('clean.rescan')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={selectedDuplicateUrls.length === 0}
                        onClick={() => openDeleteDialog('duplicates')}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        {t('clean.deleteSelected')} ({selectedDuplicateUrls.length})
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {duplicates.map((group) => (
                      <div
                        key={group.url}
                        className="border rounded-lg p-4"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <Checkbox
                            checked={selectedDuplicateUrls.includes(group.url)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedDuplicateUrls(prev => [...prev, group.url]);
                                // 默认保留第一个
                                if (!keepSelections.has(group.url)) {
                                  setKeepSelections(prev => new Map(prev).set(group.url, group.bookmarks[0].id));
                                }
                              } else {
                                setSelectedDuplicateUrls(prev => prev.filter(url => url !== group.url));
                                setKeepSelections(prev => {
                                  const next = new Map(prev);
                                  next.delete(group.url);
                                  return next;
                                });
                              }
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {group.bookmarks[0].title}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {group.url}
                            </div>
                          </div>
                          <Badge className="text-xs">
                            {t('clean.duplicateCount', { count: group.bookmarks.length })}
                          </Badge>
                        </div>
                        
                        {selectedDuplicateUrls.includes(group.url) && (
                          <div className="pl-7 space-y-2">
                            <div className="text-sm text-muted-foreground mb-2">
                              {t('clean.selectKeep')}：
                            </div>
                            <RadioGroup
                              value={keepSelections.get(group.url) || ''}
                              onValueChange={(value) => {
                                setKeepSelections(prev => new Map(prev).set(group.url, value));
                              }}
                            >
                              {group.bookmarks.map((bookmark) => (
                                <div key={bookmark.id} className="flex items-center gap-2">
                                  <RadioGroupItem value={bookmark.id} id={bookmark.id} />
                                  <label htmlFor={bookmark.id} className="text-sm flex items-center gap-2">
                                    <Folder className="w-3 h-3 text-muted-foreground" />
                                    {getFolderName(bookmark.id)}
                                  </label>
                                </div>
                              ))}
                            </RadioGroup>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              {t('btn.confirm')} {t('btn.delete')}
            </DialogTitle>
            <DialogDescription>
              {deleteType === 'broken' ? (
                <>{t('clean.deleteBrokenConfirm', { count: selectedBrokenIds.length })}</>
              ) : (
                <>{t('clean.deleteDuplicatesConfirm')}</>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              <X className="w-4 h-4 mr-1" />
              {t('btn.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={deleteType === 'broken' ? deleteBrokenLinks : deleteDuplicates}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1" />
              )}
              {deleting ? t('clean.deleting') : t('btn.confirm') + t('btn.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CleanMaster;
