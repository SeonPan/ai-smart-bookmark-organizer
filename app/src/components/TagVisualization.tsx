import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAllTags, type Tag } from '@/services/storageService';
import { useBookmarkTree, flattenBookmarks } from '@/hooks/useBookmarks';
import { useLanguage } from '@/hooks/useLanguage';
import {
  Tag as TagIcon,
  Loader2,
  ExternalLink,
  Folder,
  Bookmark,
  ArrowLeft
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

  // 加载标签数据
  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const tagsData = await getAllTags();
      // 按书签数量排序
      tagsData.sort((a, b) => b.bookmarkIds.length - a.bookmarkIds.length);
      setTags(tagsData);
    } catch (e) {
      console.error('加载标签失败:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  // 响应外部刷新触发
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadTags();
    }
  }, [refreshTrigger, loadTags]);

  // 获取书签所在文件夹名称
  const getFolderName = (bookmarkId: string): string => {
    const findInTree = (nodes: typeof tree): string => {
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
      return '未知';
    };
    return findInTree(tree);
  };

  // 点击标签气泡
  const handleTagClick = (tag: Tag) => {
    setSelectedTag(tag);
    
    // 获取该标签下的所有书签信息
    const bookmarks: BookmarkInfo[] = [];
    for (const bookmarkId of tag.bookmarkIds) {
      const bookmark = allBookmarks.find(b => b.id === bookmarkId);
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

  const maxCount = tags.length > 0 ? tags[0].bookmarkIds.length : 1;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TagIcon className="w-5 h-5" />
            {t('tags.title')}
          </CardTitle>
          <CardDescription>
            {t('tags.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tags.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <TagIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('tags.noTags')}</p>
              <p className="text-sm mt-2">{t('tags.useSmartSave')}</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-4 justify-center py-4">
              {tags.map((tag, index) => {
                const size = getBubbleSize(tag.bookmarkIds.length, maxCount);
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
                      {t('tags.bookmarksCount', { count: tag.bookmarkIds.length })}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          
          {tags.length > 0 && (
            <div className="text-center text-sm text-muted-foreground mt-4">
              {t('tags.summary', { count: tags.length, bookmarks: tags.reduce((sum, tag) => sum + tag.bookmarkIds.length, 0) })}
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
                {tagBookmarks.length} 个书签
              </Badge>
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="h-[50vh]">
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
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TagVisualization;
