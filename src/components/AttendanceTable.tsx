import { useMemo, useState } from 'react';
import { useEmployees } from '@/hooks/useEmployees';
import { useAttendance } from '@/hooks/useAttendance';
import { useLeaveRecords } from '@/hooks/useLeaveRecords';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { DepartmentChipFilter, filterByDepartments, groupByDepartment } from '@/components/filters/DepartmentChipFilter';
import { DepartmentGroupHeader } from '@/components/filters/DepartmentGroupHeader';

const statusConfig: Record<string, { label: string; class: string }> = {
  present: { label: '출근', class: 'status-green' },
  late: { label: '지각', class: 'status-yellow' },
  absent: { label: '결근', class: 'status-red' },
  unrecorded: { label: '미기록', class: 'bg-muted text-muted-foreground' },
  leave: { label: '휴가', class: 'status-purple' },
  half_day: { label: '반차', class: 'status-blue' },
  annual: { label: '연차', class: 'status-purple' },
  sick: { label: '병가', class: 'status-red' },
  personal: { label: '경조사', class: 'status-purple' },
  other: { label: '기타휴가', class: 'status-purple' },
};

interface AttendanceTableProps {
  highlightedEmployeeId?: string | null;
}

export function AttendanceTable({ highlightedEmployeeId }: AttendanceTableProps) {
  const { employees: dbEmployees } = useEmployees();
  const today = new Date().toISOString().split('T')[0];
  const { attendance: dbAttendance, checkIn, checkOut } = useAttendance(today);
  const { leaveRecords } = useLeaveRecords();
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());

  const leaveRecordsByEmployee = useMemo(() => {
    const map = new Map<string, { leave_type: string; status: string }>();
    leaveRecords.forEach((record) => {
      if (record.status === 'approved') {
        const start = new Date(record.start_date);
        const end = new Date(record.end_date);
        const selected = new Date(today);
        if (selected >= start && selected <= end) {
          map.set(record.employee_id, {
            leave_type: record.leave_type,
            status: record.status,
          });
        }
      }
    });
    return map;
  }, [leaveRecords, today]);

  const todayAttendance = useMemo(() => {
    return dbAttendance.map(att => {
      const leaveRecord = leaveRecordsByEmployee.get(att.employee_id);
      let status: keyof typeof statusConfig = att.status as keyof typeof statusConfig;
      if (leaveRecord) {
        status = leaveRecord.leave_type as keyof typeof statusConfig;
      }
      return {
        id: att.id,
        employeeId: att.employee_id,
        employeeNumber: att.employee?.employee_number || '',
        employeeName: att.employee?.name || '',
        department: att.employee?.department || '',
        checkIn: att.check_in ? new Date(att.check_in).toTimeString().slice(0, 5) : null,
        checkOut: att.check_out ? new Date(att.check_out).toTimeString().slice(0, 5) : null,
        status,
      };
    });
  }, [dbAttendance, leaveRecordsByEmployee]);

  const filtered = useMemo(() =>
    filterByDepartments(todayAttendance, selectedDepartments),
    [todayAttendance, selectedDepartments]
  );

  const grouped = useMemo(() => groupByDepartment(filtered), [filtered]);

  const toggleCollapse = (dept: string) => {
    setCollapsedDepts(prev => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  const handleCheckIn = (employeeId: string) => checkIn.mutate(employeeId);
  const handleCheckOut = (employeeId: string) => checkOut.mutate(employeeId);

  const COL_SPAN = 7;

  return (
    <div className="rounded-lg border bg-card animate-fade-in">
      <div className="p-4 border-b space-y-3">
        <h2 className="text-lg font-semibold">오늘의 출퇴근 현황</h2>
        <DepartmentChipFilter
          items={todayAttendance}
          selectedDepartments={selectedDepartments}
          onSelectionChange={setSelectedDepartments}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>사원번호</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>부서</TableHead>
            <TableHead>출근시간</TableHead>
            <TableHead>퇴근시간</TableHead>
            <TableHead>상태</TableHead>
            <TableHead className="text-right">액션</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grouped.length > 0 ? grouped.map(group => (
            <>
              <DepartmentGroupHeader
                key={`header-${group.department}`}
                department={group.department}
                count={group.items.length}
                isExpanded={!collapsedDepts.has(group.department)}
                onToggle={() => toggleCollapse(group.department)}
                colSpan={COL_SPAN}
              />
              {!collapsedDepts.has(group.department) && group.items.map(record => (
                <TableRow key={record.id} id={`dashboard-row-${record.employeeId}`} data-highlighted={highlightedEmployeeId === record.employeeId || undefined}>
                  <TableCell className="font-medium">{record.employeeNumber}</TableCell>
                  <TableCell>{record.employeeName}</TableCell>
                  <TableCell>{record.department}</TableCell>
                  <TableCell>{record.checkIn || '-'}</TableCell>
                  <TableCell>{record.checkOut || '-'}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn('font-medium', statusConfig[record.status]?.class || '')}
                    >
                      {statusConfig[record.status]?.label || record.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {!record.checkIn && (
                        <Button size="sm" onClick={() => handleCheckIn(record.employeeId)}>출근</Button>
                      )}
                      {record.checkIn && !record.checkOut && (
                        <Button size="sm" variant="outline" onClick={() => handleCheckOut(record.employeeId)}>퇴근</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </>
          )) : (
            <TableRow>
              <TableCell colSpan={COL_SPAN} className="text-center py-8 text-muted-foreground">
                오늘의 근태 기록이 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
