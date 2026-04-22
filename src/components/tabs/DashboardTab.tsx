import { useMemo, useState } from 'react';
import { useEmployees, Employee } from '@/hooks/useEmployees';
import { useAttendance } from '@/hooks/useAttendance';
import { StatCard } from '@/components/StatCard';
import { AttendanceTable } from '@/components/AttendanceTable';
import { Users, UserCheck, Clock, UserX, Database, Loader2, Search, X, Phone, Mail, Building2, CreditCard, CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmployeeCombobox } from '@/components/employee/EmployeeCombobox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type FilterType = 'total' | 'present' | 'late' | 'absent' | null;

export function DashboardTab() {
  const { employees: dbEmployees, isLoading: isEmployeesLoading } = useEmployees();
  const today = new Date().toISOString().split('T')[0];
  const { attendance: dbAttendance, isLoading: isAttendanceLoading } = useAttendance(today);
  const [searchEmployeeId, setSearchEmployeeId] = useState('');
  const [highlightedEmployeeId, setHighlightedEmployeeId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const activeEmployees = useMemo(() => dbEmployees.filter(emp => emp.is_active), [dbEmployees]);

  const stats = useMemo(() => ({
    total: activeEmployees.length,
    present: dbAttendance.filter((att) => att.status === 'present').length,
    late: dbAttendance.filter((att) => att.status === 'late').length,
    absent: dbAttendance.filter((att) => att.status === 'absent').length,
  }), [activeEmployees, dbAttendance]);

  const filteredList = useMemo(() => {
    if (!activeFilter) return [];

    if (activeFilter === 'total') {
      return activeEmployees.map(emp => ({
        id: emp.id,
        employee_number: emp.employee_number,
        name: emp.name,
        department: emp.department || '-',
        position: emp.position || '-',
      }));
    }

    const matchingAttendance = dbAttendance.filter(att => att.status === activeFilter);
    return matchingAttendance.map(att => {
      const emp = dbEmployees.find(e => e.id === att.employee_id);
      return {
        id: att.employee_id,
        employee_number: emp?.employee_number || '',
        name: emp?.name || '',
        department: emp?.department || '-',
        position: emp?.position || '-',
      };
    });
  }, [activeFilter, activeEmployees, dbAttendance, dbEmployees]);

  const filterLabels: Record<string, string> = {
    total: '전체 직원',
    present: '금일 출근',
    late: '금일 지각',
    absent: '금일 결근',
  };

  const comboboxEmployees = useMemo(() =>
    activeEmployees.map(e => ({
      id: e.id,
      name: e.name,
      department: e.department,
      employee_number: e.employee_number,
      position: e.position,
    })),
    [activeEmployees]
  );

  const handleEmployeeSearch = (empId: string) => {
    setSearchEmployeeId(empId);
    setHighlightedEmployeeId(empId);
    setTimeout(() => setHighlightedEmployeeId(null), 5000);
    setTimeout(() => {
      const el = document.getElementById(`dashboard-row-${empId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const handleStatClick = (filter: FilterType) => {
    setActiveFilter(prev => prev === filter ? null : filter);
  };

  const isLoading = isEmployeesLoading || isAttendanceLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        {isLoading ? (
          <Badge variant="outline" className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            로딩 중...
          </Badge>
        ) : (
          <Badge variant="outline" className="flex items-center gap-1">
            <Database className="w-3 h-3" />
            DB 연동
          </Badge>
        )}
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <div className="w-64">
            <EmployeeCombobox
              employees={comboboxEmployees}
              value={searchEmployeeId}
              onValueChange={handleEmployeeSearch}
              placeholder="직원 검색..."
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="전체 직원"
          value={stats.total}
          variant="blue"
          icon={<Users />}
          active={activeFilter === 'total'}
          onClick={() => handleStatClick('total')}
        />
        <StatCard
          title="금일 출근"
          value={stats.present}
          variant="green"
          icon={<UserCheck />}
          active={activeFilter === 'present'}
          onClick={() => handleStatClick('present')}
        />
        <StatCard
          title="금일 지각"
          value={stats.late}
          variant="yellow"
          icon={<Clock />}
          active={activeFilter === 'late'}
          onClick={() => handleStatClick('late')}
        />
        <StatCard
          title="금일 결근"
          value={stats.absent}
          variant="purple"
          icon={<UserX />}
          active={activeFilter === 'absent'}
          onClick={() => handleStatClick('absent')}
        />
      </div>

      {activeFilter && (
        <div className="rounded-lg border bg-card animate-fade-in">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="text-sm font-semibold">{filterLabels[activeFilter]} 명단 ({filteredList.length}명)</h3>
            <button onClick={() => setActiveFilter(null)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>사원번호</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>부서</TableHead>
                <TableHead>직위</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredList.length > 0 ? filteredList.map(emp => (
                <TableRow key={emp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => {
                  const full = dbEmployees.find(e => e.id === emp.id);
                  if (full) setSelectedEmployee(full);
                }}>
                  <TableCell className="font-medium">{emp.employee_number}</TableCell>
                  <TableCell>{emp.name}</TableCell>
                  <TableCell>{emp.department}</TableCell>
                  <TableCell>{emp.position}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                    해당하는 직원이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <AttendanceTable highlightedEmployeeId={highlightedEmployeeId} />

      <Dialog open={!!selectedEmployee} onOpenChange={(open) => !open && setSelectedEmployee(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              직원 상세 정보
            </DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                  {selectedEmployee.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-lg">{selectedEmployee.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedEmployee.employee_number}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoItem icon={<Building2 className="w-4 h-4" />} label="부서" value={selectedEmployee.department || '-'} />
                <InfoItem icon={<Users className="w-4 h-4" />} label="직위" value={selectedEmployee.position || '-'} />
                <InfoItem icon={<Phone className="w-4 h-4" />} label="연락처" value={selectedEmployee.phone || '-'} />
                <InfoItem icon={<Mail className="w-4 h-4" />} label="이메일" value={selectedEmployee.email || '-'} />
                <InfoItem icon={<CalendarDays className="w-4 h-4" />} label="입사일" value={selectedEmployee.hire_date} />
                <InfoItem icon={<CreditCard className="w-4 h-4" />} label="급여유형" value={
                  selectedEmployee.pay_type === 'monthly' ? '월급' : selectedEmployee.pay_type === 'hourly' ? '시급' : '일급'
                } />
                <InfoItem icon={<CreditCard className="w-4 h-4" />} label="기본급" value={`${selectedEmployee.base_salary.toLocaleString()}원`} />
                <InfoItem icon={<Building2 className="w-4 h-4" />} label="고용형태" value={
                  { regular: '정규직', contract: '계약직', daily: '일용직', freelancer: '프리랜서' }[selectedEmployee.employment_type] || selectedEmployee.employment_type
                } />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}