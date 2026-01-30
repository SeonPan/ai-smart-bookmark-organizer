import { useState, useCallback } from 'react';
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

// 递归获取所有子节点 ID
const getAllDescendantIds = (node: BookmarkNode): string[] => {
  const ids: string[] = [];
  if (node.children) {
    for (const child of node.children) {
      if (child.url) {
        ids.push(child.id);
      }
      ids.push(...getAllDescendantIds(child));
    }
  }
  return ids;
};

// 统计节点中的书签数量
const countBookmarks = (node: BookmarkNode): number => {
  let count = 0;
  if (node.url) {
    count = 1;
  }
  if (node.children) {
    for (const child of node.children) {
      count += countBookmarks(child);
    }
  }
  return count;
};

interface TreeNodeProps {
  node: BookmarkNode;
  level: number;
  selectedIds: string[];
  expandedIds: string[];
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string, isFolder: boolean) => void;
  showBookmarks: boolean;
}

const TreeNode = ({
  node,
  level,
  selectedIds,
  expandedIds,
  onToggleExpand,
  onToggleSelect,
  showBookmarks
}: TreeNodeProps) => {
  const isFolder = !node.url;
  const isSystem = isSystemFolder(node);
  const isExpanded = expandedIds.includes(node.id);
  const isSelected = selectedIds.includes(node.id);
  
  // 统计子书签数量
  const bookmarkCount = isFolder ? countBookmarks(node) : 0;
  
  // 计算选中状态（用于文件夹的 indeterminate 状态）
  const descendantIds = isFolder ? getAllDescendantIds(node) : [];
  const selectedDescendants = descendantIds.filter(id => selectedIds.includes(id));
  const isIndeterminate = isFolder && selectedDescendants.length > 0 && selectedDescendants.length < descendantIds.length;
  const isAllSelected = isFolder && descendantIds.length > 0 && selectedDescendants.length === descendantIds.length;
  
  const handleCheckboxChange = () => {
    onToggleSelect(node.id, isFolder);
  };
  
  const handleExpandClick = () => {
    if (isFolder && node.children && node.children.length > 0) {
      onToggleExpand(node.id);
    }
  };
  
  // 如果是书签且不显示书签，则跳过
  if (!isFolder && !showBookmarks) {
    return null;
  }
  
  // 系统文件夹只显示但不允许选择
  const canSelect = !isSystem || (isSystem && isFolder && bookmarkCount > 0);
  
  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 hover:bg-muted/50 rounded px-1"
        style={{ paddingLeft: `${level * 16 + 4}px` }}
      >
        {/* 展开/折叠按钮 */}
        {isFolder && node.children && node.children.length > 0 ? (
          <button
            onClick={handleExpandClick}
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
        {canSelect && (
          <Checkbox
            checked={isSelected || isAllSelected}
            onCheckedChange={handleCheckboxChange}
            data-state={isIndeterminate ? 'indeterminate' : isSelected || isAllSelected ? 'checked' : 'unchecked'}
          />
        )}
        {!canSelect && <span className="w-4" />}
        
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
      
      {/* 子节点 */}
      {isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedIds={selectedIds}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
              showBookmarks={showBookmarks}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const BookmarkTreeSelect = ({
  nodes,
  selectedIds,
  onSelectionChange,
  showBookmarks = true
}: BookmarkTreeSelectProps) => {
  const [expandedIds, setExpandedIds] = useState<string[]>(['0', '1']);
  
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
      const folder = findNodeById(nodes, id);
      if (folder) {
        const descendantIds = getAllDescendantIds(folder);
        const allSelected = descendantIds.every(did => selectedIds.includes(did));
        
        if (allSelected) {
          // 取消选中所有
          onSelectionChange(selectedIds.filter(sid => !descendantIds.includes(sid)));
        } else {
          // 选中所有
          onSelectionChange([...new Set([...selectedIds, ...descendantIds])]);
        }
      }
    } else {
      // 单个书签
      if (selectedIds.includes(id)) {
        onSelectionChange(selectedIds.filter(sid => sid !== id));
      } else {
        onSelectionChange([...selectedIds, id]);
      }
    }
  }, [nodes, selectedIds, onSelectionChange]);
  
  return (
    <div className="border rounded-lg p-2 max-h-[400px] overflow-auto">
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          level={0}
          selectedIds={selectedIds}
          expandedIds={expandedIds}
          onToggleExpand={handleToggleExpand}
          onToggleSelect={handleToggleSelect}
          showBookmarks={showBookmarks}
        />
      ))}
    </div>
  );
};

// 辅助函数：根据 ID 查找节点
const findNodeById = (nodes: BookmarkNode[], id: string): BookmarkNode | null => {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
};

export default BookmarkTreeSelect;
