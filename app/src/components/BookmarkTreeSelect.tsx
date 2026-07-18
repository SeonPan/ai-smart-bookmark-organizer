import { useState, useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight, ChevronDown, Folder, Bookmark } from 'lucide-react';
import type { BookmarkNode } from '@/types';

interface BookmarkTreeSelectProps {
  nodes: BookmarkNode[];
  selectedIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  showBookmarks?: boolean;
}

// 判断是否为系统文件夹
const isSystemFolder = (node: BookmarkNode): boolean => {
  if (!node) return true;
  if (node.id === '0') return true;
  if (node.parentId === '0') return true;
  const folderType = (node as { folderType?: string }).folderType;
  if (folderType && ['bookmarks-bar', 'other', 'mobile'].includes(folderType)) {
    return true;
  }
  return false;
};

interface FolderStats {
  bookmarkCount: number;
  descendantIds: string[];
}

// 单次遍历统计每个文件夹的书签数量和后代书签 ID（避免每行渲染时重复统计子树）
const computeFolderStats = (nodes: BookmarkNode[]): Map<string, FolderStats> => {
  const stats = new Map<string, FolderStats>();

  const walk = (node: BookmarkNode): string[] => {
    if (node.url) {
      return [node.id];
    }
    let ids: string[] = [];
    if (node.children) {
      for (const child of node.children) {
        ids = ids.concat(walk(child));
      }
    }
    stats.set(node.id, { bookmarkCount: ids.length, descendantIds: ids });
    return ids;
  };

  nodes.forEach(walk);
  return stats;
};

interface FlatRow {
  node: BookmarkNode;
  level: number;
}

// 按展开状态拍平可见节点为行数组（虚拟滚动需要扁平列表）
const flattenVisibleRows = (
  nodes: BookmarkNode[],
  expandedIds: string[],
  showBookmarks: boolean
): FlatRow[] => {
  const rows: FlatRow[] = [];

  const walk = (node: BookmarkNode, level: number) => {
    const isFolder = !node.url;
    if (isFolder || showBookmarks) {
      rows.push({ node, level });
    }
    if (isFolder && node.children && expandedIds.includes(node.id)) {
      node.children.forEach(child => walk(child, level + 1));
    }
  };

  nodes.forEach(node => walk(node, 0));
  return rows;
};

export const BookmarkTreeSelect = ({
  nodes,
  selectedIds,
  onSelectionChange,
  showBookmarks = true
}: BookmarkTreeSelectProps) => {
  const [expandedIds, setExpandedIds] = useState<string[]>(['0', '1']);

  // 统计数据与选中集合（memo 化，避免每次渲染重复计算）
  const folderStats = useMemo(() => computeFolderStats(nodes), [nodes]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const flatRows = useMemo(
    () => flattenVisibleRows(nodes, expandedIds, showBookmarks),
    [nodes, expandedIds, showBookmarks]
  );

  // 虚拟滚动：只渲染可视区域的行，千级书签也不卡顿
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 32,
    overscan: 10
  });

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  }, []);

  const handleToggleSelect = useCallback((id: string, isFolder: boolean) => {
    if (isFolder) {
      // 文件夹：选中/取消选中所有子书签
      const descendantIds = folderStats.get(id)?.descendantIds || [];
      if (descendantIds.length === 0) return;

      const allSelected = descendantIds.every(did => selectedSet.has(did));
      if (allSelected) {
        const descendantSet = new Set(descendantIds);
        onSelectionChange(selectedIds.filter(sid => !descendantSet.has(sid)));
      } else {
        onSelectionChange([...new Set([...selectedIds, ...descendantIds])]);
      }
    } else {
      // 单个书签
      if (selectedSet.has(id)) {
        onSelectionChange(selectedIds.filter(sid => sid !== id));
      } else {
        onSelectionChange([...selectedIds, id]);
      }
    }
  }, [folderStats, selectedIds, selectedSet, onSelectionChange]);

  // 渲染单行
  const renderRow = (row: FlatRow) => {
    const { node, level } = row;
    const isFolder = !node.url;
    const isSystem = isSystemFolder(node);
    const isExpanded = expandedIds.includes(node.id);
    const isSelected = selectedSet.has(node.id);

    const stats = isFolder ? folderStats.get(node.id) : undefined;
    const bookmarkCount = stats?.bookmarkCount || 0;
    const descendantIds = stats?.descendantIds || [];

    // 计算选中状态（用于文件夹的 indeterminate 状态）
    const selectedDescendants = descendantIds.filter(id => selectedSet.has(id));
    const isIndeterminate =
      isFolder && selectedDescendants.length > 0 && selectedDescendants.length < descendantIds.length;
    const isAllSelected =
      isFolder && descendantIds.length > 0 && selectedDescendants.length === descendantIds.length;

    // 系统文件夹只显示但不允许选择（有内容的系统文件夹允许按文件夹选择）
    const canSelect = !isSystem || (isSystem && isFolder && bookmarkCount > 0);

    return (
      <div
        className="flex items-center gap-2 py-1.5 hover:bg-muted/50 rounded px-1"
        style={{ paddingLeft: `${level * 16 + 4}px` }}
      >
        {/* 展开/折叠按钮 */}
        {isFolder && node.children && node.children.length > 0 ? (
          <button
            onClick={() => handleToggleExpand(node.id)}
            className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* 复选框 */}
        {canSelect ? (
          <Checkbox
            checked={isSelected || isAllSelected}
            onCheckedChange={() => handleToggleSelect(node.id, isFolder)}
            data-state={isIndeterminate ? 'indeterminate' : isSelected || isAllSelected ? 'checked' : 'unchecked'}
          />
        ) : (
          <span className="w-4" />
        )}

        {/* 图标和名称 */}
        {isFolder ? (
          <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
        ) : (
          <Bookmark className="w-4 h-4 text-blue-500 flex-shrink-0" />
        )}

        <span className={`text-sm truncate ${isSystem ? 'text-muted-foreground' : ''}`}>
          {node.title || '(无标题)'}
        </span>

        {/* 书签数量 */}
        {isFolder && bookmarkCount > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {bookmarkCount} 个书签
          </span>
        )}
      </div>
    );
  };

  return (
    <div ref={scrollParentRef} className="border rounded-lg p-2 max-h-[400px] overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map(virtualItem => {
          const row = flatRows[virtualItem.index];
          return (
            <div
              key={row.node.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`
              }}
            >
              {renderRow(row)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BookmarkTreeSelect;
