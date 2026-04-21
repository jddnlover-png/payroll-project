import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from 'sonner';
import { Plus, Trash2, GripVertical, ChevronRight, CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeptItem {
  id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
  parent_id: string | null;
}

interface Item {
  id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
}

function buildDeptTree(items: DeptItem[]): (DeptItem & { children: DeptItem[]; depth: number })[] {
  const map = new Map<string | null, DeptItem[]>();
  items.forEach(item => {
    const parentKey = item.parent_id || null;
    if (!map.has(parentKey)) map.set(parentKey, []);
    map.get(parentKey)!.push(item);
  });

  const result: (DeptItem & { children: DeptItem[]; depth: number })[] = [];

  function walk(parentId: string | null, depth: number) {
    const children = map.get(parentId) || [];
    children.forEach(child => {
      const subChildren = map.get(child.id) || [];
      result.push({ ...child, children: subChildren, depth });
      walk(child.id, depth + 1);
    });
  }

  walk(null, 0);
  return result;
}

function DepartmentManager({ orgId }: { orgId: string }) {
  const [items, setItems] = useState<DeptItem[]>([]);
  const [newName, setNewName] = useState('');
  const [parentId, setParentId] = useState<string>('none');
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('departments')
      .select('id, name, sort_order, is_default, parent_id')
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: true });
    if (error) {
      console.error(error);
    } else {
      setItems((data as DeptItem[]) || []);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const addItem = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (items.some(i => i.name === trimmed)) {
      toast.error('이미 존재하는 부서입니다.');
      return;
    }
    const insertData: any = {
      organization_id: orgId,
      name: trimmed,
      sort_order: items.length,
    };
    if (parentId !== 'none') {
      insertData.parent_id = parentId;
    }
    const { error } = await supabase.from('departments').insert(insertData);
    if (error) {
      toast.error('추가에 실패했습니다.');
      console.error(error);
    } else {
      setNewName('');
      setParentId('none');
      toast.success('추가되었습니다.');
      fetchItems();
    }
  };

  const removeItem = async (id: string) => {
    const hasChildren = items.some(i => i.parent_id === id);
    if (hasChildren) {
      toast.error('하위 부서가 있는 부서는 삭제할 수 없습니다. 하위 부서를 먼저 삭제해주세요.');
      return;
    }
    const { error } = await supabase.from('departments').delete().eq('id', id);
    if (error) {
      toast.error('삭제에 실패했습니다.');
    } else {
      toast.success('삭제되었습니다.');
      fetchItems();
    }
  };

  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const dragItem = items.find(i => i.id === dragId);
    const targetItem = items.find(i => i.id === targetId);
    if (!dragItem || !targetItem) return;
    // Only allow reorder within same parent level
    if (dragItem.parent_id !== targetItem.parent_id) {
      toast.error('같은 레벨의 부서끼리만 순서를 변경할 수 있습니다.');
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const siblings = items
      .filter(i => i.parent_id === dragItem.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const reordered = siblings.filter(i => i.id !== dragId);
    const targetIndex = reordered.findIndex(i => i.id === targetId);
    reordered.splice(targetIndex, 0, dragItem);

    // Update sort_order in DB
    const updates = reordered.map((item, idx) =>
      supabase.from('departments').update({ sort_order: idx }).eq('id', item.id)
    );
    await Promise.all(updates);
    setDragId(null);
    setDragOverId(null);
    fetchItems();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') addItem();
  };

  const tree = buildDeptTree(items);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">부서 관리</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="새 부서 입력"
              className="flex-1"
            />
            <Button onClick={addItem} size="sm" className="shrink-0">
              <Plus className="h-4 w-4 mr-1" />
              추가
            </Button>
          </div>
          <Select value={parentId} onValueChange={setParentId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="상위 부서 선택 (선택사항)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">상위 부서 없음 (최상위)</SelectItem>
              {items.filter(i => !i.parent_id).map(dept => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">로딩 중...</p>
        ) : tree.length === 0 ? (
          <p className="text-sm text-muted-foreground">등록된 부서이(가) 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {tree.map((item) => (
              <li
                key={item.id}
                draggable
                onDragStart={() => setDragId(item.id)}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(item.id); }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => { e.preventDefault(); handleDrop(item.id); }}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 hover:bg-muted transition-colors',
                  dragId === item.id && 'opacity-50',
                  dragOverId === item.id && dragId !== item.id && 'ring-2 ring-primary/50',
                )}
                style={{ paddingLeft: `${12 + item.depth * 24}px` }}
              >
                <div className="flex items-center gap-2">
                  {item.depth > 0 && <CornerDownRight className="h-3 w-3 text-muted-foreground" />}
                  {item.depth === 0 && <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />}
                  {item.depth > 0 && <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />}
                  <span className="text-sm">{item.name}</span>
                  {item.is_default && <span className="text-xs text-muted-foreground">(기본값)</span>}
                  {item.children.length > 0 && (
                    <span className="text-xs text-muted-foreground">({item.children.length})</span>
                  )}
                </div>
                {!item.is_default && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeItem(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ManagedList({ title, tableName, orgId }: { title: string; tableName: 'positions'; orgId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: true });
    if (error) {
      console.error(error);
    } else {
      setItems(data || []);
    }
    setLoading(false);
  }, [orgId, tableName]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const addItem = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (items.some(i => i.name === trimmed)) {
      toast.error('이미 존재하는 항목입니다.');
      return;
    }
    const { error } = await supabase
      .from(tableName)
      .insert({ organization_id: orgId, name: trimmed, sort_order: items.length });
    if (error) {
      toast.error('추가에 실패했습니다.');
      console.error(error);
    } else {
      setNewName('');
      toast.success('추가되었습니다.');
      fetchItems();
    }
  };

  const removeItem = async (id: string) => {
    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) {
      toast.error('삭제에 실패했습니다.');
    } else {
      toast.success('삭제되었습니다.');
      fetchItems();
    }
  };

  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const dragItem = items.find(i => i.id === dragId);
    if (!dragItem) return;
    const reordered = items.filter(i => i.id !== dragId);
    const targetIndex = reordered.findIndex(i => i.id === targetId);
    reordered.splice(targetIndex, 0, dragItem);

    const updates = reordered.map((item, idx) =>
      supabase.from(tableName).update({ sort_order: idx }).eq('id', item.id)
    );
    await Promise.all(updates);
    setDragId(null);
    setDragOverId(null);
    fetchItems();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') addItem();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title} 관리</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`새 ${title} 입력`}
            className="flex-1"
          />
          <Button onClick={addItem} size="sm" className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />
            추가
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">로딩 중...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">등록된 {title}이(가) 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => (
              <li
                key={item.id}
                draggable
                onDragStart={() => setDragId(item.id)}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(item.id); }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => { e.preventDefault(); handleDrop(item.id); }}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 hover:bg-muted transition-colors',
                  dragId === item.id && 'opacity-50',
                  dragOverId === item.id && dragId !== item.id && 'ring-2 ring-primary/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  <span className="text-sm">{item.name}</span>
                  {item.is_default && <span className="text-xs text-muted-foreground">(기본값)</span>}
                </div>
                {!item.is_default && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeItem(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function DepartmentPositionSettings() {
  const { currentOrganization } = useOrganization();

  if (!currentOrganization) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <DepartmentManager orgId={currentOrganization.id} />
      <ManagedList title="직급" tableName="positions" orgId={currentOrganization.id} />
    </div>
  );
}
