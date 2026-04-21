import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, X, Search, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmployeePickerEmployee {
  id: string;
  name: string;
  department: string | null;
  employee_number: string;
  position: string | null;
}

interface EmployeePickerProps {
  employees: EmployeePickerEmployee[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  description?: string;
}

export function EmployeePicker({
  employees,
  selectedIds,
  onSelectedIdsChange,
  description = '직원 선택 (엑셀 내보내기용, 미선택 시 전체)',
}: EmployeePickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const filteredEmployees = useMemo(() =>
    employees.filter(emp =>
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.department || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_number.toLowerCase().includes(searchTerm.toLowerCase())
    ), [employees, searchTerm]);

  const groupedByDept = useMemo(() => {
    const grouped = filteredEmployees.reduce<Record<string, EmployeePickerEmployee[]>>((acc, emp) => {
      const dept = emp.department || '미지정';
      if (!acc[dept]) acc[dept] = [];
      acc[dept].push(emp);
      return acc;
    }, {});
    return grouped;
  }, [filteredEmployees]);

  const deptNames = useMemo(() =>
    Object.keys(groupedByDept).sort((a, b) => a === '미지정' ? 1 : b === '미지정' ? -1 : a.localeCompare(b)),
    [groupedByDept]);

  const toggleEmployee = (id: string) => {
    onSelectedIdsChange(
      selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]
    );
  };

  const toggleAll = () => {
    onSelectedIdsChange(
      selectedIds.length === employees.length ? [] : employees.map(e => e.id)
    );
  };

  const toggleDept = (deptEmpIds: string[]) => {
    const allSelected = deptEmpIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      onSelectedIdsChange(selectedIds.filter(id => !deptEmpIds.includes(id)));
    } else {
      onSelectedIdsChange([...new Set([...selectedIds, ...deptEmpIds])]);
    }
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{description}</span>
          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {selectedIds.length}명 선택
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(!isOpen)}
              className="gap-1"
            >
              <Users className="w-4 h-4" />
              직원 선택
              <ChevronsUpDown className="w-3 h-3 opacity-50" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {selectedIds.length > 0 && (
        <CardContent className="pt-0 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {selectedIds.map(id => {
              const emp = employees.find(e => e.id === id);
              if (!emp) return null;
              return (
                <Badge
                  key={id}
                  variant="secondary"
                  className="gap-1 cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
                  onClick={() => toggleEmployee(id)}
                >
                  {emp.name}
                  <X className="w-3 h-3" />
                </Badge>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => onSelectedIdsChange([])}
            >
              전체 해제
            </Button>
          </div>
        </CardContent>
      )}

      {isOpen && (
        <CardContent className="pt-0">
          <div className="border rounded-md">
            <div className="p-2 border-b space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="이름, 부서, 사번으로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-1 flex-wrap">
                  <Button variant="outline" size="sm" className="h-6 text-xs" onClick={toggleAll}>
                    {selectedIds.length === employees.length ? '전체 해제' : '전체 선택'}
                  </Button>
                  {deptNames.map(dept => {
                    const deptEmpIds = groupedByDept[dept].map(e => e.id);
                    const allSelected = deptEmpIds.every(id => selectedIds.includes(id));
                    return (
                      <Button
                        key={dept}
                        variant={allSelected ? 'default' : 'outline'}
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => toggleDept(deptEmpIds)}
                      >
                        {dept}
                      </Button>
                    );
                  })}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {filteredEmployees.length}명 표시
                </span>
              </div>
            </div>

            <ScrollArea className="h-[240px]">
              <div className="p-1">
                {deptNames.map(dept => (
                  <div key={dept}>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50 sticky top-0">
                      {dept} ({groupedByDept[dept].length})
                    </div>
                    {groupedByDept[dept].map(emp => (
                      <label
                        key={emp.id}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm text-sm hover:bg-accent transition-colors",
                          selectedIds.includes(emp.id) && "bg-accent/50"
                        )}
                      >
                        <Checkbox
                          checked={selectedIds.includes(emp.id)}
                          onCheckedChange={() => toggleEmployee(emp.id)}
                        />
                        <span className="flex-1">{emp.name}</span>
                        <span className="text-xs text-muted-foreground">{emp.employee_number}</span>
                        {emp.position && (
                          <span className="text-xs text-muted-foreground">{emp.position}</span>
                        )}
                      </label>
                    ))}
                  </div>
                ))}
                {filteredEmployees.length === 0 && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    검색 결과가 없습니다
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
