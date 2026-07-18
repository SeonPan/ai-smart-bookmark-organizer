import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useBookmarkTree, flattenBookmarks } from '@/hooks/useBookmarks';
import { addOperationLog } from '@/services/storageService';
import { useLanguage } from '@/hooks/useLanguage';
import type { BookmarkNode } from '@/types';
import {
  Trash2,
  Link2,
  Copy,
  Loader2,
  AlertTriangle,
  Check,
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

// 检测链接是否可能失效
const checkLinkStatus = async (url: string): Promise<{ isBroken: boolean; status: number; statusText: string; reason: string }> => {
  // 跳过特殊协议
  if (url.startsWith('chrome://') || url.startsWith('javascript:') || url.startsWith('data:')) {
    return { isBroken: false, status: 200, statusText: 'OK', reason: '特殊协议' };
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    // 尝试多种方法检测
    // 方法1: 使用 fetch HEAD 请求
    try {
      await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
        redirect: 'follow'
      });
      clearTimeout(timeoutId);
      
      // 如果响应是 2xx 或 3xx，认为是有效的
      // 注意：no-cors 模式下无法获取真实状态码，这里只是一个粗略判断
      return { isBroken: false, status: 200, statusText: 'OK', reason: '请求成功' };
    } catch (fetchError) {
      // fetch 失败，可能是 CORS 限制，不一定是链接失效
      // 继续尝试其他检测方法
    }
    
    clearTimeout(timeoutId);
    
    // 方法2: 检查 URL 格式
    try {
      const urlObj = new URL(url);
      
      // 检查域名是否常见失效域名
      const deadDomains = [
        'example.com', 'test.com', 'localhost',
        '127.0.0.1', '0.0.0.0', '192.168.',
        '10.0.0.', '172.16.'
      ];
      
      for (const deadDomain of deadDomains) {
        if (urlObj.hostname.includes(deadDomain)) {
          return { 
            isBroken: true, 
            status: 0, 
            statusText: '可能失效', 
            reason: '可能是测试/本地地址' 
          };
        }
      }
      
      // 检查是否包含明显的失效特征
      const brokenPatterns = [
        /404|not.?found|page.?not/i,
        /error|failed|unavailable/i,
        /expired|deleted|removed/i
      ];
      
      for (const pattern of brokenPatterns) {
        if (pattern.test(urlObj.pathname) || pattern.test(urlObj.search)) {
          return { 
            isBroken: true, 
            status: 404, 
            statusText: '可能失效', 
            reason: 'URL 包含失效特征' 
          };
        }
      }
      
    } catch (urlError) {
      return { 
        isBroken: true, 
        status: 0, 
        statusText: '无效URL', 
        reason: 'URL 格式错误' 
      };
    }
    
    // 无法确定，标记为可疑（让用户自行判断）
    return { 
      isBroken: false, 
      status: 0, 
      statusText: '未知', 
      reason: '无法检测（可能受反爬限制）' 
    };
    
  } catch (e) {
    return { 
      isBroken: false, 
      status: 0, 
      statusText: '检测失败', 
      reason: '网络错误' 
    };
  }
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
  const [success, setSuccess] = useState<string | null>(null);
  
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

  // 扫描失效链接
  const scanBrokenLinks = useCallback(async () => {
    setScanningBroken(true);
    setError(null);
    setBrokenLinks([]);
    setSelectedBrokenIds([]);
    
    const results: BrokenLinkResult[] = [];
    
    for (const bookmark of allBookmarks) {
      if (!bookmark.url) continue;
      
      const status = await checkLinkStatus(bookmark.url);
      
      // 只记录明确失效的链接
      if (status.isBroken) {
        results.push({
          bookmark,
          status: status.status,
          statusText: status.statusText,
          reason: status.reason
        });
      }
    }
    
    setBrokenLinks(results);
    setScanningBroken(false);
  }, [allBookmarks]);

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
      setSuccess(t('clean.noDuplicates'));
      setTimeout(() => setSuccess(null), 3000);
    }
  }, [allBookmarks, t]);

  // 标准化 URL（用于比较）
  const normalizeUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      // 移除末尾的斜杠和 hash
      return `${urlObj.origin}${urlObj.pathname}`.replace(/\/$/, '').toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  };

  // 获取书签所在文件夹名称
  const getFolderName = (bookmarkId: string): string => {
    const findInTree = (nodes: BookmarkNode[]): string => {
      for (const node of nodes) {
        if (node.children) {
          for (const child of node.children) {
            if (child.id === bookmarkId) {
              return node.title || '书签栏';
            }
          }
          const found = findInTree(node.children);
          if (found) return found;
        }
      }
      return '';
    };
    return findInTree(tree) || '未知';
  };

  // 删除失效链接
  const deleteBrokenLinks = async () => {
    setDeleting(true);
    setError(null);
    
    try {
      for (const id of selectedBrokenIds) {
        await chrome.bookmarks.remove(id);
      }
      
      // 记录操作
      await addOperationLog({
        type: 'clean',
        affectedCount: selectedBrokenIds.length,
        description: `清理大师 - 删除了 ${selectedBrokenIds.length} 个失效链接`
      });
      
      setSuccess(`成功删除 ${selectedBrokenIds.length} 个失效链接`);
      setBrokenLinks(prev => prev.filter(b => !selectedBrokenIds.includes(b.bookmark.id)));
      setSelectedBrokenIds([]);
      await refetch();
      
      setTimeout(() => setSuccess(null), 3000);
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
        description: `清理大师 - 删除了 ${deletedCount} 个重复书签`
      });
      
      setSuccess(`成功删除 ${deletedCount} 个重复书签`);
      setDuplicates(prev => prev.filter(d => !selectedDuplicateUrls.includes(d.url)));
      setSelectedDuplicateUrls([]);
      setKeepSelections(new Map());
      await refetch();
      
      setTimeout(() => setSuccess(null), 3000);
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
      
      {success && (
        <Alert className="bg-green-50 border-green-200">
          <Check className="w-4 h-4 text-green-600" />
          <AlertDescription className="text-green-700">{success}</AlertDescription>
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
              {brokenLinks.length === 0 ? (
                <div className="text-center py-8">
                  <Button onClick={scanBrokenLinks} disabled={scanningBroken}>
                    {scanningBroken ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4 mr-2" />
                    )}
                    {scanningBroken ? '扫描中...' : t('clean.scan')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      发现 <span className="font-semibold">{brokenLinks.length}</span> 个失效链接
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={scanBrokenLinks}
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
                  
                  <div className="border rounded-lg divide-y">
                    {brokenLinks.map((result) => (
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
                              位于: {getFolderName(result.bookmark.id)}
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
                      发现 <span className="font-semibold">{duplicates.length}</span> 组重复书签
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
                            {group.bookmarks.length} 个重复
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
                <>确定要删除选中的 {selectedBrokenIds.length} 个失效链接吗？</>
              ) : (
                <>确定要删除选中的重复书签吗？保留的书签不会被删除。</>
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
              {deleting ? '删除中...' : t('btn.confirm') + t('btn.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CleanMaster;
