import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { getAllSnapshots, deleteSnapshot, restoreSnapshot, addOperationLog } from '@/services/storageService';
import { getAllLogs } from '@/services/storageService';
import { useLanguage } from '@/hooks/useLanguage';
import type { BookmarkSnapshot, OperationLog } from '@/types';
import {
  History,
  RotateCcw,
  Trash2,
  Loader2,
  AlertTriangle,
  FolderOpen,
  Calendar,
  Clock,
  CheckCircle2
} from 'lucide-react';

// 格式化日期
const formatDate = (timestamp: number, language: string = 'zh'): string => {
  const date = new Date(timestamp);
  return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// 格式化相对时间
const formatRelativeTime = (timestamp: number, t: any): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return t('history.justNow');
  if (minutes < 60) return t('history.minutesAgo', { count: minutes });
  if (hours < 24) return t('history.hoursAgo', { count: hours });
  if (days < 7) return t('history.daysAgo', { count: days });
  return formatDate(timestamp);
};

// 获取操作类型标签
const getOperationTypeLabel = (type: string, t: any): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } => {
  switch (type) {
    case 'organize':
      return { label: t('history.organize'), variant: 'default' };
    case 'clean':
      return { label: t('history.clean'), variant: 'secondary' };
    case 'rollback':
      return { label: t('history.rollbackOp'), variant: 'outline' };
    default:
      return { label: t('history.other'), variant: 'default' };
  }
};

export const HistoryPage = () => {
  const [snapshots, setSnapshots] = useState<BookmarkSnapshot[]>([]);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { t } = useLanguage();
  
  // 回滚对话框状态
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<BookmarkSnapshot | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  
  // 删除确认对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [snapshotsData, logsData] = await Promise.all([
        getAllSnapshots(),
        getAllLogs()
      ]);
      setSnapshots(snapshotsData);
      setLogs(logsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 打开回滚对话框
  const openRollbackDialog = (snapshot: BookmarkSnapshot) => {
    setSelectedSnapshot(snapshot);
    setRollbackDialogOpen(true);
  };

  // 执行回滚
  const handleRollback = async () => {
    if (!selectedSnapshot) return;
    
    setRollingBack(true);
    setError(null);
    setSuccess(null);
    
    try {
      // 执行真正的回滚
      await restoreSnapshot(selectedSnapshot.id);
      
      // 记录回滚操作
      await addOperationLog({
        type: 'rollback',
        affectedCount: selectedSnapshot.bookmarkCount,
        description: `${t('history.rollback')} - ${formatDate(selectedSnapshot.timestamp)}`,
        snapshotId: selectedSnapshot.id
      });
      
      // 刷新数据
      await loadData();
      setRollbackDialogOpen(false);
      setSuccess(t('history.rollbackSuccess'));
      
      // 3秒后清除成功消息
      setTimeout(() => setSuccess(null), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : '回滚失败');
    } finally {
      setRollingBack(false);
    }
  };

  // 打开删除对话框
  const openDeleteDialog = (snapshot: BookmarkSnapshot) => {
    setSelectedSnapshot(snapshot);
    setDeleteDialogOpen(true);
  };

  // 删除快照
  const handleDelete = async () => {
    if (!selectedSnapshot) return;
    
    setDeleting(true);
    setError(null);
    
    try {
      await deleteSnapshot(selectedSnapshot.id);
      await loadData();
      setDeleteDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
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
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <AlertDescription className="text-green-700">{success}</AlertDescription>
        </Alert>
      )}

      {/* 操作日志 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            {t('history.operationLog')}
          </CardTitle>
          <CardDescription>
            {t('history.operationLog')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('history.noLogs')}
            </div>
          ) : (
            <div className="space-y-3">
              {logs.slice(0, 10).map((log) => {
                const typeInfo = getOperationTypeLabel(log.type, t);
                return (
                  <div
                    key={log.id}
                    className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-shrink-0">
                      <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {log.description}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(log.timestamp, t)}
                        <span className="text-muted-foreground">·</span>
                        {t('history.affectedCount', { count: log.affectedCount })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 快照列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            {t('history.snapshots')}
          </CardTitle>
          <CardDescription>
            {t('history.snapshots')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('history.noSnapshots')}
            </div>
          ) : (
            <div className="space-y-3">
              {snapshots.map((snapshot, index) => (
                <div
                  key={snapshot.id}
                  className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-semibold text-primary">
                      {snapshots.length - index}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {snapshot.description}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(snapshot.timestamp)}
                      </span>
                      <span className="flex items-center gap-1">
                        <FolderOpen className="w-3 h-3" />
                        {t('history.bookmarkCount', { count: snapshot.bookmarkCount })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRollbackDialog(snapshot)}
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      {t('history.rollback')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => openDeleteDialog(snapshot)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 回滚确认对话框 */}
      <Dialog open={rollbackDialogOpen} onOpenChange={setRollbackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              {t('history.confirmRollback')}
            </DialogTitle>
            <DialogDescription>
              {t('history.rollbackWarning')}
            </DialogDescription>
          </DialogHeader>
          
          {selectedSnapshot && (
            <div className="py-4">
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="text-sm">
                  <span className="text-muted-foreground">{t('history.snapshotTime')}：</span>
                  {formatDate(selectedSnapshot.timestamp)}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">{t('history.bookmarkCount')}：</span>
                  {selectedSnapshot.bookmarkCount}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">{t('history.description')}：</span>
                  {selectedSnapshot.description}
                </div>
              </div>
              
              <Alert className="mt-4 border-amber-300 bg-amber-50">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-amber-700 text-sm">
                  {t('history.rollbackWarning')}
                </AlertDescription>
              </Alert>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button onClick={handleRollback} disabled={rollingBack} variant="destructive">
              {rollingBack ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-2" />
              )}
              {rollingBack ? t('history.rollingBack') : t('history.confirmRollback')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              {t('history.confirmDelete')}
            </DialogTitle>
            <DialogDescription>
              {t('history.deleteConfirmMsg')}
            </DialogDescription>
          </DialogHeader>
          
          {selectedSnapshot && (
            <div className="py-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm font-medium">{selectedSnapshot.description}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatDate(selectedSnapshot.timestamp)} · {t('history.bookmarkCount', { count: selectedSnapshot.bookmarkCount })}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              {deleting ? t('history.deleting') : t('history.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HistoryPage;
