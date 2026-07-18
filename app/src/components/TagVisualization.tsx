import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { getAllTags, deleteTag, addTagsToBookmark, normalizeTagName, type Tag } from '@/services/storageService';
import { getTagMergeSuggestions, type TagMergeGroup } from '@/services/aiService';
import { useBookmarkTree, flattenBookmarks, buildBookmarkIndex } from '@/hooks/useBookmarks';
import { useSettings } from '@/hooks/useSettings';
import { useLanguage } from '@/hooks/useLanguage';
import { toast } from 'sonner';
import {
  Tag as TagIcon,
  Loader2,
  ExternalLink,
  Folder,
  Bookmark,
  ArrowLeft,
  Merge,
  ArrowRight
} from 'lucide-react';

// 书签信息
interface BookmarkInfo {
  id: string;
  title: string;
  url: string;
  folderName: string;
}

interface TagVisualizationProps {
  refreshTrigger?: number;
}

export const TagVisualization = ({ refreshTrigger = 0 }: TagVisualizationProps) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [tagBookmarks, setTagBookmarks] = useState<BookmarkInfo[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const { tree } = useBookmarkTree();
  const allBookmarks = flattenBookmarks(tree);
  const { t } = useLanguage();
  const { settings } = useSettings();
  
  // 书签树索引（O(1) 查找父文件夹）
  const bookmarkIndex = useMemo(() => buildBookmarkIndex(tree), [tree]);
  
  // 标签归并状态
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeGroups, setMergeGroups] = useState<TagMergeGroup[]>([]);
  const [mergeChecked, setMergeChecked] = useState<boolean[]>([]);
  const [mergeAnalyzing, setMergeAnalyzing] = useState(false);
  const [mergeApplying, setMergeApplying] = useState(false);
  
  // 发起 AI 归并分析
  const handleAnalyzeMerge = async () => {
    setMergeAnalyzing(true);
    try {
      const groups = await getTagMergeSuggestions(settings, tags.map(tag => tag.name));
      if (groups.length === 0) {
        toast.info(t('tags.mergeNone'));
      } else {
        setMergeGroups(groups);
        setMergeChecked(groups.map(() => true));
        setMergeDialogOpen(true);
      }
    } catch (e) {
      console.error('标签归并分析失败:', e);
      toast.error(t('tags.mergeFailed'));
    } finally {
      setMergeAnalyzing(false);
    }
  };
  
  // 执行归并：被合并标签的书签并入规范标签，然后删除被合并标签
  const handleApplyMerge = async () => {
    setMergeApplying(true);
    let appliedCount = 0;
    
    try {
      for (let i = 0; i < mergeGroups.length; i++) {
        if (!mergeChecked[i]) continue;
        const group = mergeGroups[i];
        const canonicalName = normalizeTagName(group.canonical);
        
        for (const memberName of group.members) {
          const memberTag = tags.find(tag => tag.name === normalizeTagName(memberName));
          if (!memberTag) continue;
          
          // 书签逐个并入规范标签（addTagsToBookmark 自动去重并创建目标标签）
          for (const bookmarkId of memberTag.bookmarkIds) {
            await addTagsToBookmark(bookmarkId, [canonicalName]);
          }
          // 删除被合并的标签
          await deleteTag(memberTag.id);
        }
        appliedCount++;
      }
      
      setMergeDialogOpen(false);
      toast.success(t('tags.mergeDone', { count: appliedCount }));
      await loadTags();
    } catch (e) {
      console.error('标签归并失败:', e);
      toast.error(t('tags.mergeFailed'));
    } finally {
      setMergeApplying(false);
    }
  };

  // 计算每个标签的有效书签数量
  const getValidBookmarkCount = (tag: Tag): number => {
    return tag.bookmarkIds.filter(id => allBookmarks.some(b => b.id === id && b.url)).length;
  };

  // 加载标签数据
  const loadTags = async () => {
    setLoading(true);
    try {
      const tagsData = await getAllTags();
      setTags(tagsData);
    } catch (e) {
      console.error('加载标签失败:', e);
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时加载标签
  useEffect(() => {
    loadTags();
  }, []);

  // 响应外部刷新触发
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadTags();
    }
  }, [refreshTrigger]);

  // 获取书签所在文件夹名称（O(1) 索引查找）
  const getFolderName = (bookmarkId: string): string => {
    const parent = bookmarkIndex.parentById.get(bookmarkId);
    if (!parent) return t('folder.unknown');
    if (!parent.title) return t('folder.bookmarksBar');
    return parent.title;
  };

  // 点击标签气泡
  const handleTagClick = (tag: Tag) => {
    setSelectedTag(tag);
    
    // 获取该标签下的所有书签信息（过滤掉已失效的书签）
    const bookmarks: BookmarkInfo[] = [];
    for (const bookmarkId of tag.bookmarkIds) {
      const bookmark = allBookmarks.find(b => b.id === bookmarkId && b.url);
      if (bookmark) {
        bookmarks.push({
          id: bookmark.id,
          title: bookmark.title,
          url: bookmark.url || '',
          folderName: getFolderName(bookmark.id)
        });
      }
    }
    
    setTagBookmarks(bookmarks);
    setDialogOpen(true);
  };

  // 计算气泡大小
  const getBubbleSize = (count: number, maxCount: number): number => {
    const minSize = 50;  // 最小气泡50px
    const maxSize = 120; // 最大气泡120px
    if (maxCount <= 1) return minSize;
    const ratio = count / maxCount;
    // 使用非线性缩放，让计数少的标签气泡更小
    return minSize + (maxSize - minSize) * Math.pow(ratio, 0.6);
  };

  // 计算气泡颜色
  const getBubbleColor = (index: number): string => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-orange-500',
      'bg-pink-500',
      'bg-cyan-500',
      'bg-indigo-500',
      'bg-teal-500',
      'bg-rose-500',
      'bg-amber-500'
    ];
    return colors[index % colors.length];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // 过滤并排序标签
  const validTags = tags.filter(tag => getValidBookmarkCount(tag) > 0);
  validTags.sort((a, b) => getValidBookmarkCount(b) - getValidBookmarkCount(a));
  
  const maxCount = validTags.length > 0 ? Math.max(...validTags.map(getValidBookmarkCount)) : 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TagIcon className="w-5 h-5" />
              {t('tags.title')}
            </span>
            {validTags.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAnalyzeMerge}
                disabled={mergeAnalyzing}
                title={t('tags.mergeDesc')}
              >
                {mergeAnalyzing ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Merge className="w-4 h-4 mr-1" />
                )}
                {mergeAnalyzing ? t('tags.mergeAnalyzing') : t('tags.merge')}
              </Button>
            )}
          </CardTitle>
          <CardDescription>
            {t('tags.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {validTags.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TagIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('tags.noTags')}</p>
              <p className="text-sm mt-2">{t('tags.useSmartSave')}</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-4 justify-center py-4">
              {validTags.map((tag, index) => {
                const validCount = getValidBookmarkCount(tag);
                const size = getBubbleSize(validCount, maxCount);
                const colorClass = getBubbleColor(index);
                
                return (
                  <button
                    key={tag.id}
                    onClick={() => handleTagClick(tag)}
                    className={`
                      ${colorClass} text-white rounded-full
                      flex flex-col items-center justify-center
                      transition-all duration-300
                      hover:scale-110 hover:shadow-lg
                      cursor-pointer
                    `}
                    style={{
                      width: `${size}px`,
                      height: `${size}px`
                    }}
                  >
                    <span className="font-semibold text-center px-2 break-words max-w-full">
                      {tag.name}
                    </span>
                    <span className="text-xs opacity-80 mt-1">
                      {t('tags.bookmarksCount', { count: validCount })}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          
          {validTags.length > 0 && (
            <div className="text-center text-sm text-muted-foreground mt-4">
              {t('tags.summary', { count: validTags.length, bookmarks: validTags.reduce((sum, tag) => sum + getValidBookmarkCount(tag), 0) })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 标签详情对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="p-0 h-auto"
                onClick={() => setDialogOpen(false)}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <TagIcon className="w-5 h-5" />
              {selectedTag?.name}
              <Badge variant="secondary">
                {t('tags.bookmarksCount', { count: tagBookmarks.length })}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          
          <div className="h-[50vh] overflow-y-auto">
            <div className="space-y-2 pr-4">
              {tagBookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <Bookmark className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {bookmark.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {bookmark.url}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Folder className="w-3 h-3" />
                      {bookmark.folderName}
                    </div>
                  </div>
                  <a
                    href={bookmark.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground flex-shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* 标签归并确认对话框 */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge className="w-5 h-5" />
              {t('tags.merge')}
            </DialogTitle>
            <DialogDescription>
              {t('tags.mergeGroups', { count: mergeGroups.length })}
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-[50vh] overflow-y-auto">
            <div className="space-y-3 pr-4">
              {mergeGroups.map((group, index) => (
                <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                  <Checkbox
                    checked={mergeChecked[index]}
                    onCheckedChange={(checked) => {
                      setMergeChecked(prev => prev.map((c, i) => i === index ? !!checked : c));
                    }}
                  />
                  <div className="flex-1 flex flex-wrap items-center gap-1.5">
                    {group.members.map(member => (
                      <Badge key={member} variant="outline" className="text-muted-foreground">
                        {member}
                      </Badge>
                    ))}
                    <ArrowRight className="w-4 h-4 text-muted-foreground mx-1" />
                    <Badge>{group.canonical}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button
              onClick={handleApplyMerge}
              disabled={mergeApplying || !mergeChecked.some(Boolean)}
            >
              {mergeApplying ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Merge className="w-4 h-4 mr-2" />
              )}
              {t('tags.mergeApply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TagVisualization;
