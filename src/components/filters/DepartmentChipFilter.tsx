import { useMemo, useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Building2 } from 'lucide-react';

interface DepartmentChipFilterProps {
  /** All items that have a `department` field */
  items: { department?: string | null }[];
  /** Currently selected department names */
  selectedDepartments: string[];
  /** Callback when selection changes */
  onSelectionChange: (departments: string[]) => void;
}

export function DepartmentChipFilter({ items, selectedDepartments, onSelectionChange }: DepartmentChipFilterProps) {
  const { currentOrganization } = useOrganization();
  const [dbDepartments, setDbDepartments] = useState<string[]>([]);

  useEffect(() => {
    if (!currentOrganization) return;
    supabase
      .from('departments')
      .select('name')
      .eq('organization_id', currentOrganization.id)
      .order('sort_order')
      .then(({ data }) => {
        setDbDepartments((data || []).map(d => d.name));
      });
  }, [currentOrganization]);

  const departmentStats = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(item => {
      const dept = item.department || '미분류';
      counts[dept] = (counts[dept] || 0) + 1;
    });
    // Build ordered list: DB departments first, then any extra from items, then 미분류
    const ordered: { name: string; count: number }[] = [];
    const seen = new Set<string>();

    dbDepartments.forEach(d => {
      ordered.push({ name: d, count: counts[d] || 0 });
      seen.add(d);
    });

    Object.keys(counts).forEach(d => {
      if (!seen.has(d) && d !== '미분류') {
        ordered.push({ name: d, count: counts[d] });
        seen.add(d);
      }
    });

    if (counts['미분류']) {
      ordered.push({ name: '미분류', count: counts['미분류'] });
    }

    return ordered;
  }, [items, dbDepartments]);

  const isAllSelected = selectedDepartments.length === 0;

  const toggleDepartment = useCallback((dept: string) => {
    if (selectedDepartments.includes(dept)) {
      onSelectionChange(selectedDepartments.filter(d => d !== dept));
    } else {
      onSelectionChange([...selectedDepartments, dept]);
    }
  }, [selectedDepartments, onSelectionChange]);

  const selectAll = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
      <button
        onClick={selectAll}
        className={cn(
          'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors border',
          isAllSelected
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-background text-muted-foreground border-border hover:bg-muted'
        )}
      >
        전체
        <span className="opacity-70">{items.length}</span>
      </button>
      {departmentStats.map(dept => {
        const isActive = selectedDepartments.includes(dept.name);
        return (
          <button
            key={dept.name}
            onClick={() => toggleDepartment(dept.name)}
            className={cn(
              'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors border',
              isActive
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted'
            )}
          >
            {dept.name}
            <span className="opacity-70">{dept.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Helper: filter items based on selected departments (empty = all) */
export function filterByDepartments<T extends { department?: string | null }>(
  items: T[],
  selectedDepartments: string[]
): T[] {
  if (selectedDepartments.length === 0) return items;
  return items.filter(item => {
    const dept = item.department || '미분류';
    return selectedDepartments.includes(dept);
  });
}

/** Helper: group items by department */
export function groupByDepartment<T extends { department?: string | null }>(
  items: T[]
): { department: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  items.forEach(item => {
    const dept = item.department || '미분류';
    if (!map.has(dept)) map.set(dept, []);
    map.get(dept)!.push(item);
  });
  return Array.from(map.entries()).map(([department, items]) => ({ department, items }));
}
