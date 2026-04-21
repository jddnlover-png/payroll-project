import { useState, useMemo, useRef, useEffect } from 'react';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxEmployee {
  id: string;
  name: string;
  department: string | null;
  employee_number: string;
  position: string | null;
}

interface EmployeeComboboxProps {
  employees: ComboboxEmployee[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

const RECENT_STORAGE_KEY = 'recent-selected-employees';
const MAX_RECENT = 5;

function getRecentIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function addRecentId(id: string) {
  const recent = getRecentIds().filter(r => r !== id);
  recent.unshift(id);
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export function EmployeeCombobox({
  employees,
  value,
  onValueChange,
  placeholder = '직원 이름, 사번, 부서 검색...',
}: EmployeeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedEmployee = employees.find(e => e.id === value);

  const recentEmployees = useMemo(() => {
    const ids = getRecentIds();
    return ids
      .map(id => employees.find(e => e.id === id))
      .filter((e): e is ComboboxEmployee => !!e);
  }, [employees, open]);

  const groupedByDept = useMemo(() => {
    const filtered = search.length === 0
      ? employees
      : employees.filter(emp =>
          emp.name.toLowerCase().includes(search.toLowerCase()) ||
          emp.employee_number.toLowerCase().includes(search.toLowerCase()) ||
          (emp.department || '').toLowerCase().includes(search.toLowerCase())
        );

    const grouped = filtered.reduce<Record<string, ComboboxEmployee[]>>((acc, emp) => {
      const dept = emp.department || '미지정';
      if (!acc[dept]) acc[dept] = [];
      acc[dept].push(emp);
      return acc;
    }, {});

    return grouped;
  }, [employees, search]);

  const deptNames = useMemo(() =>
    Object.keys(groupedByDept).sort((a, b) =>
      a === '미지정' ? 1 : b === '미지정' ? -1 : a.localeCompare(b)
    ),
    [groupedByDept]
  );

  const totalFiltered = useMemo(() =>
    Object.values(groupedByDept).reduce((sum, arr) => sum + arr.length, 0),
    [groupedByDept]
  );

  const handleSelect = (empId: string) => {
    onValueChange(empId);
    addRecentId(empId);
    setOpen(false);
    setSearch('');
  };

  const displayValue = selectedEmployee
    ? `${selectedEmployee.name} (${selectedEmployee.department || '부서 없음'} / ${selectedEmployee.employee_number})`
    : '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground"
          )}
        >
          <span className="truncate">
            {displayValue || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[280px] overflow-y-auto">
            {totalFiltered === 0 && search.length > 0 && (
              <CommandEmpty>검색 결과가 없습니다</CommandEmpty>
            )}

            {search.length === 0 && recentEmployees.length > 0 && (
              <CommandGroup heading="최근 선택">
                {recentEmployees.map(emp => (
                  <CommandItem
                    key={`recent-${emp.id}`}
                    value={`recent-${emp.id}`}
                    onSelect={() => handleSelect(emp.id)}
                    className="flex items-center gap-2"
                  >
                    <Check
                      className={cn("h-4 w-4 shrink-0", value === emp.id ? "opacity-100" : "opacity-0")}
                    />
                    <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{emp.name}</span>
                    <span className="text-xs text-muted-foreground">{emp.department || '미지정'}</span>
                    <span className="text-xs text-muted-foreground">{emp.employee_number}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {deptNames.map(dept => (
              <CommandGroup key={dept} heading={`${dept} (${groupedByDept[dept].length})`}>
                {groupedByDept[dept].map(emp => (
                  <CommandItem
                    key={emp.id}
                    value={emp.id}
                    onSelect={() => handleSelect(emp.id)}
                    className="flex items-center gap-2"
                  >
                    <Check
                      className={cn("h-4 w-4 shrink-0", value === emp.id ? "opacity-100" : "opacity-0")}
                    />
                    <span className="flex-1 truncate">{emp.name}</span>
                    <span className="text-xs text-muted-foreground">{emp.department || '미지정'}</span>
                    <span className="text-xs text-muted-foreground">{emp.employee_number}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
