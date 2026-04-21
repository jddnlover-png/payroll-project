/**
 * 현장 관리 탭 (Tab 1)
 * - 현장 CRUD (삭제 불가, status 변경만)
 * - 정렬: updated_at 내림차순
 */
import { useState } from 'react';
import { useConstructionSites, ConstructionSite } from '@/hooks/useConstructionSites';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Edit2, Building2 } from 'lucide-react';
import { format } from 'date-fns';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  active: { label: '진행중', variant: 'default' },
  completed: { label: '종료', variant: 'secondary' },
  archived: { label: '숨김', variant: 'outline' },
};

export function SiteManagementTab() {
  const { sites, isLoading, createSite, updateSite } = useConstructionSites();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSite, setEditSite] = useState<ConstructionSite | null>(null);
  const [form, setForm] = useState({ site_name: '', start_date: '', end_date: '', status: 'active' });
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const openCreate = () => {
    setEditSite(null);
    setForm({ site_name: '', start_date: '', end_date: '', status: 'active' });
    setDialogOpen(true);
  };

  const openEdit = (site: ConstructionSite) => {
    setEditSite(site);
    setForm({
      site_name: site.site_name,
      start_date: site.start_date || '',
      end_date: site.end_date || '',
      status: site.status,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.site_name.trim()) return;
    if (editSite) {
      await updateSite.mutateAsync({
        site_id: editSite.site_id,
        site_name: form.site_name.trim(),
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      });
    } else {
      await createSite.mutateAsync({
        site_name: form.site_name.trim(),
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
      });
    }
    setDialogOpen(false);
  };

  const filtered = statusFilter === 'all' ? sites : sites.filter(s => s.status === statusFilter);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          현장 관리
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="active">진행중</SelectItem>
              <SelectItem value="completed">종료</SelectItem>
              <SelectItem value="archived">숨김</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 mr-1" /> 현장 추가
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            등록된 현장이 없습니다. [현장 추가] 버튼을 눌러 추가하세요.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>현장명</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>시작일</TableHead>
                <TableHead>종료일</TableHead>
                <TableHead>최종 수정</TableHead>
                <TableHead className="w-[80px]">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(site => {
                const cfg = statusConfig[site.status] || statusConfig.active;
                return (
                  <TableRow key={site.site_id}>
                    <TableCell className="font-medium">{site.site_name}</TableCell>
                    <TableCell>
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </TableCell>
                    <TableCell>{site.start_date || '-'}</TableCell>
                    <TableCell>{site.end_date || '-'}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {format(new Date(site.updated_at), 'yyyy-MM-dd HH:mm')}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(site)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editSite ? '현장 수정' : '현장 추가'}</DialogTitle>
            <DialogDescription>
              {editSite ? '현장 정보를 수정합니다. 삭제는 법적 보관 의무(근기법 제42조)에 따라 불가합니다.' : '새 현장을 등록합니다.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>현장명 *</Label>
              <Input
                value={form.site_name}
                onChange={e => setForm(f => ({ ...f, site_name: e.target.value }))}
                placeholder="예: 강남 A현장"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>시작일</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>종료일</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
            {editSite && (
              <div>
                <Label>상태</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">진행중</SelectItem>
                    <SelectItem value="completed">종료</SelectItem>
                    <SelectItem value="archived">숨김</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSave} disabled={!form.site_name.trim()}>
              {editSite ? '수정' : '등록'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
