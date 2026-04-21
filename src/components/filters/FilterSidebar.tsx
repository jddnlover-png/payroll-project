import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Building2, Users, ChevronRight, Filter, ChevronDown, Wallet, Briefcase } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface DeptWithParent {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

interface FilterSidebarProps {
  employees: { id: string; department?: string | null; employment_type?: string; pay_type?: string; job_category?: string }[];
  selectedDepartment: string | null;
  onDepartmentChange: (dept: string | null) => void;
  selectedEmploymentType: string | null;
  onEmploymentTypeChange: (type: string | null) => void;
  selectedPayType?: string | null;
  onPayTypeChange?: (type: string | null) => void;
  selectedJobCategory?: string | null;
  onJobCategoryChange?: (type: string | null) => void;
  showEmploymentTypeFilter?: boolean;
  showPayTypeFilter?: boolean;
  showJobCategoryFilter?: boolean;
  employmentTypeOptions?: { key: string; label: string }[];
}

const defaultEmploymentTypes = [
  { key: 'regular', label: '정규직' },
  { key: 'contract', label: '계약직' },
  { key: 'daily', label: '일용직' },
  { key: 'freelancer', label: '프리랜서' },
];

const defaultPayTypes = [
  { key: 'monthly', label: '월급' },
  { key: 'hourly', label: '시급' },
  { key: 'daily', label: '일급' },
];

const defaultJobCategories = [
  { key: 'office', label: '사무직' },
  { key: 'production', label: '생산직' },
];

function buildDeptTreeFlat(depts: DeptWithParent[]): (DeptWithParent & { depth: number; childNames: string[] })[] {
  const map = new Map<string | null, DeptWithParent[]>();
  depts.forEach(d => {
    const key = d.parent_id || null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  });
  const result: (DeptWithParent & { depth: number; childNames: string[] })[] = [];
  function walk(parentId: string | null, depth: number) {
    (map.get(parentId) || []).forEach(d => {
      const allChildNames = getAllChildNames(d.id, map);
      result.push({ ...d, depth, childNames: [d.name, ...allChildNames] });
      walk(d.id, depth + 1);
    });
  }
  walk(null, 0);
  return result;
}

function getAllChildNames(parentId: string, map: Map<string | null, DeptWithParent[]>): string[] {
  const children = map.get(parentId) || [];
  const names: string[] = [];
  children.forEach(c => {
    names.push(c.name);
    names.push(...getAllChildNames(c.id, map));
  });
  return names;
}

export function FilterSidebar({
  employees,
  selectedDepartment,
  onDepartmentChange,
  selectedEmploymentType,
  onEmploymentTypeChange,
  selectedPayType = null,
  onPayTypeChange,
  selectedJobCategory = null,
  onJobCategoryChange,
  showEmploymentTypeFilter = true,
  showPayTypeFilter = true,
  showJobCategoryFilter = true,
  employmentTypeOptions = defaultEmploymentTypes,
}: FilterSidebarProps) {
  const { currentOrganization } = useOrganization();
  const [dbDeptTree, setDbDeptTree] = useState<DeptWithParent[]>([]);
  const [dbDepartments, setDbDepartments] = useState<string[]>([]);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentOrganization) return;
    const fetchDepartments = async () => {
      const { data } = await supabase
        .from('departments')
        .select('id, name, parent_id, sort_order')
        .eq('organization_id', currentOrganization.id)
        .order('sort_order');
      const depts = (data || []) as DeptWithParent[];
      setDbDeptTree(depts);
      setDbDepartments(depts.map(d => d.name));
    };
    fetchDepartments();
  }, [currentOrganization]);

  const deptTree = useMemo(() => buildDeptTreeFlat(dbDeptTree), [dbDeptTree]);

  // 부서별 직원 수 계산
  const departmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach(emp => {
      const dept = emp.department || '미분류';
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return counts;
  }, [employees]);

  // 고용형태별 직원 수 계산
  const employmentTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach(emp => {
      const type = emp.employment_type || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [employees]);

  // 급여유형별 직원 수 계산
  const payTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach(emp => {
      const type = emp.pay_type || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [employees]);

  // 직종별 직원 수 계산
  const jobCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach(emp => {
      const type = emp.job_category || 'office';
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }, [employees]);

  // 모든 부서 목록 (flat)
  const allDepartmentOptions = useMemo(() => {
    const options: { value: string; label: string; count: number }[] = [
      { value: '__all__', label: '전체 직원', count: employees.length },
    ];
    deptTree.forEach(node => {
      const totalCount = node.childNames.reduce((sum, name) => sum + (departmentCounts[name] || 0), 0);
      options.push({
        value: node.name,
        label: '  '.repeat(node.depth) + node.name,
        count: totalCount,
      });
    });
    // 미분류
    const uncategorizedCount = employees.filter(e => !e.department || !dbDepartments.includes(e.department)).length;
    if (uncategorizedCount > 0) {
      options.push({ value: '미분류', label: '미분류', count: uncategorizedCount });
    }
    return options;
  }, [deptTree, departmentCounts, employees, dbDepartments]);

  return (
    <>
      {/* 모바일 드롭다운 필터 */}
      <div className="md:hidden flex flex-wrap gap-2 mb-4">
        <Select
          value={selectedDepartment || '__all__'}
          onValueChange={(v) => onDepartmentChange(v === '__all__' ? null : v)}
        >
          <SelectTrigger className="w-[180px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="부서 선택" />
          </SelectTrigger>
          <SelectContent>
            {allDepartmentOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label} ({opt.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showEmploymentTypeFilter && (
          <Select
            value={selectedEmploymentType || '__all__'}
            onValueChange={(v) => onEmploymentTypeChange(v === '__all__' ? null : v)}
          >
            <SelectTrigger className="w-[140px]">
              <Users className="w-4 h-4 mr-2" />
              <SelectValue placeholder="고용형태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체 ({employees.length})</SelectItem>
              {employmentTypeOptions.map(({ key, label }) => {
                const count = employmentTypeCounts[key] || 0;
                return (
                  <SelectItem key={key} value={key}>
                    {label} ({count})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}

        {showPayTypeFilter && onPayTypeChange && (
          <Select
            value={selectedPayType || '__all__'}
            onValueChange={(v) => onPayTypeChange(v === '__all__' ? null : v)}
          >
            <SelectTrigger className="w-[130px]">
              <Wallet className="w-4 h-4 mr-2" />
              <SelectValue placeholder="급여유형" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체 ({employees.length})</SelectItem>
              {defaultPayTypes.map(({ key, label }) => {
                const count = payTypeCounts[key] || 0;
                return (
                  <SelectItem key={key} value={key}>
                    {label} ({count})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}

        {showJobCategoryFilter && onJobCategoryChange && (
          <Select
            value={selectedJobCategory || '__all__'}
            onValueChange={(v) => onJobCategoryChange(v === '__all__' ? null : v)}
          >
            <SelectTrigger className="w-[130px]">
              <Briefcase className="w-4 h-4 mr-2" />
              <SelectValue placeholder="직종" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">전체 ({employees.length})</SelectItem>
              {defaultJobCategories.map(({ key, label }) => {
                const count = jobCategoryCounts[key] || 0;
                return (
                  <SelectItem key={key} value={key}>
                    {label} ({count})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* 데스크톱 사이드바 */}
      <div className="w-56 shrink-0 rounded-lg border bg-card p-3 space-y-1 hidden md:block">
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
          <Building2 className="w-4 h-4" />
          부서 목록
        </h3>
        <button
          onClick={() => onDepartmentChange(null)}
          className={cn(
            'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between',
            !selectedDepartment ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'
          )}
        >
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            전체 직원
          </span>
          <span className="text-xs opacity-70">{employees.length}</span>
        </button>
        <ScrollArea className="max-h-[40vh]">
          <div className="space-y-0.5">
            {deptTree.map(node => {
              const hasChildren = dbDeptTree.some(d => d.parent_id === node.id);
              const isExpanded = expandedDepts.has(node.id);
              // Hide children if parent is collapsed
              if (node.depth > 0) {
                let ancestor = dbDeptTree.find(d => d.id === node.parent_id);
                while (ancestor) {
                  if (!expandedDepts.has(ancestor.id)) return null;
                  ancestor = dbDeptTree.find(d => d.id === ancestor!.parent_id) || undefined;
                }
              }
              // Count includes self + child dept employees
              const totalCount = node.childNames.reduce((sum, name) => sum + (departmentCounts[name] || 0), 0);

              return (
                <button
                  key={node.id}
                  onClick={() => {
                    onDepartmentChange(selectedDepartment === node.name ? null : node.name);
                    if (hasChildren) {
                      setExpandedDepts(prev => {
                        const next = new Set(prev);
                        if (next.has(node.id)) next.delete(node.id);
                        else next.add(node.id);
                        return next;
                      });
                    }
                  }}
                  className={cn(
                    'w-full text-left py-2 rounded-md text-sm transition-colors flex items-center justify-between',
                    selectedDepartment === node.name ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'
                  )}
                  style={{ paddingLeft: `${12 + node.depth * 16}px`, paddingRight: '12px' }}
                >
                  <span className="flex items-center gap-1.5">
                    {hasChildren ? (
                      <ChevronRight className={cn('w-3 h-3 transition-transform', isExpanded && 'rotate-90')} />
                    ) : (
                      <span className="w-3" />
                    )}
                    {node.name}
                  </span>
                  <span className="text-xs opacity-70">{totalCount}</span>
                </button>
              );
            })}
            {/* 미분류 부서가 있을 경우 표시 */}
            {employees.some(e => !e.department || !dbDepartments.includes(e.department)) && (() => {
              const uncategorizedCount = employees.filter(e => !e.department || !dbDepartments.includes(e.department)).length;
              return (
                <button
                  onClick={() => onDepartmentChange(selectedDepartment === '미분류' ? null : '미분류')}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between',
                    selectedDepartment === '미분류' ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted text-muted-foreground'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-3" />
                    미분류
                  </span>
                  <span className="text-xs opacity-70">{uncategorizedCount}</span>
                </button>
              );
            })()}
          </div>
        </ScrollArea>

        {/* 고용형태 필터 */}
        {showEmploymentTypeFilter && (
          <div className="border-t my-2 pt-2">
            <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              고용형태
            </h3>
            <button
              onClick={() => onEmploymentTypeChange(null)}
              className={cn(
                'w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between',
                !selectedEmploymentType ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'
              )}
            >
              <span>전체</span>
              <span className="text-xs opacity-70">{employees.length}</span>
            </button>
            {employmentTypeOptions.map(({ key, label }) => {
              const count = employmentTypeCounts[key] || 0;
              return (
                <button
                  key={key}
                  onClick={() => onEmploymentTypeChange(selectedEmploymentType === key ? null : key)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between',
                    selectedEmploymentType === key ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'
                  )}
                >
                  <span>{label}</span>
                  <span className="text-xs opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 급여유형 필터 */}
        {showPayTypeFilter && onPayTypeChange && (
          <div className="border-t my-2 pt-2">
            <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Wallet className="w-4 h-4" />
              급여유형
            </h3>
            <button
              onClick={() => onPayTypeChange(null)}
              className={cn(
                'w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between',
                !selectedPayType ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'
              )}
            >
              <span>전체</span>
              <span className="text-xs opacity-70">{employees.length}</span>
            </button>
            {defaultPayTypes.map(({ key, label }) => {
              const count = payTypeCounts[key] || 0;
              return (
                <button
                  key={key}
                  onClick={() => onPayTypeChange(selectedPayType === key ? null : key)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between',
                    selectedPayType === key ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'
                  )}
                >
                  <span>{label}</span>
                  <span className="text-xs opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 직종 필터 */}
        {showJobCategoryFilter && onJobCategoryChange && (
          <div className="border-t my-2 pt-2">
            <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Briefcase className="w-4 h-4" />
              직종
            </h3>
            <button
              onClick={() => onJobCategoryChange(null)}
              className={cn(
                'w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between',
                !selectedJobCategory ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'
              )}
            >
              <span>전체</span>
              <span className="text-xs opacity-70">{employees.length}</span>
            </button>
            {defaultJobCategories.map(({ key, label }) => {
              const count = jobCategoryCounts[key] || 0;
              return (
                <button
                  key={key}
                  onClick={() => onJobCategoryChange(selectedJobCategory === key ? null : key)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between',
                    selectedJobCategory === key ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'
                  )}
                >
                  <span>{label}</span>
                  <span className="text-xs opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// 부서 필터링 헬퍼 함수
export function filterByDepartmentTree(
  items: { department?: string | null }[],
  selectedDepartment: string | null,
  dbDepartments: string[],
  deptTree: { name: string; childNames: string[] }[]
): typeof items {
  if (!selectedDepartment) return items;
  
  if (selectedDepartment === '미분류') {
    return items.filter(item => !item.department || !dbDepartments.includes(item.department));
  }
  
  const node = deptTree.find(d => d.name === selectedDepartment);
  if (node) {
    return items.filter(item => node.childNames.includes(item.department || ''));
  }
  
  return items.filter(item => item.department === selectedDepartment);
}
