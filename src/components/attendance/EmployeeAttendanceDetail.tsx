import { useMemo, useCallback } from 'react';
import { useAttendanceRange } from '@/hooks/useAttendance';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Employee } from '@/types/employee';
import { Clock, LogIn, LogOut, Calendar, Download } from 'lucide-react';
import ExcelJS from 'exceljs';

interface EmployeeAttendanceDetailProps {
  employee: Employee | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: string;
  endDate: string;
}

export function EmployeeAttendanceDetail({
  employee,
  open,
  onOpenChange,
  startDate,
  endDate,
}: EmployeeAttendanceDetailProps) {
  // DB에서 근태 데이터 조회
  const { data: dbAttendance = [] } = useAttendanceRange(startDate, endDate);
  const { settings } = useOrganizationSettings();

  const employeeRecords = useMemo(() => {
    if (!employee) return [];
    
    return dbAttendance
      .filter((att) => att.employee_id === employee.id)
      .map((att) => ({
        id: att.id,
        date: att.date,
        status: att.status,
        checkIn: att.check_in,
        checkOut: att.check_out,
        breakMinutes: att.break_minutes ?? 0,
        workType: att.work_type || 'day',
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [employee, dbAttendance]);

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      present: { label: '출근', className: 'status-green' },
      late: { label: '지각', className: 'status-yellow' },
      absent: { label: '결근', className: 'status-red' },
      leave: { label: '휴가', className: 'status-purple' },
      half_day: { label: '반차', className: 'status-yellow' },
    };
    const config = statusConfig[status] || { label: status, className: '' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.getMonth() + 1}/${date.getDate()} (${days[date.getDay()]})`;
  };

  const formatTime = (isoStr: string | null) => {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // KST 시간 추출 헬퍼 (브라우저 타임존 무관)
  const getKSTMinutes = (date: Date) => {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return kst.getUTCHours() * 60 + kst.getUTCMinutes();
  };
  const getNextDayStr = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  };

  const calculateWorkHours = (checkIn: string | null, checkOut: string | null, breakMinutes: number = 0, recordDate?: string, workType?: string) => {
    if (!checkIn || !checkOut) return '-';
    
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const isNight = workType === 'night';
    
    // 주간/야간에 따라 설정값 선택
    const workStartTime = isNight ? settings.shift_tier1_start : settings.work_start_time;
    const workEndTime = isNight ? settings.shift_tier3_end : settings.work_end_time;
    const lateThreshold = isNight ? settings.shift_late_threshold : settings.late_threshold;
    const checkoutThreshold = isNight ? settings.shift_checkout_threshold : settings.checkout_threshold;
    
    const [startH, startM] = workStartTime.split(':').map(Number);
    const workStartMinutes = startH * 60 + startM;
    const checkInMinutes = getKSTMinutes(checkInDate);
    
    let effectiveCheckIn = checkInDate.getTime();
    if (checkInMinutes < workStartMinutes || (checkInMinutes >= workStartMinutes && checkInMinutes <= workStartMinutes + lateThreshold)) {
      const dateStr = recordDate || checkIn.split('T')[0];
      effectiveCheckIn = new Date(`${dateStr}T${workStartTime}:00+09:00`).getTime();
    }
    
    // 퇴근 기준 보정
    const [endH, endM] = workEndTime.split(':').map(Number);
    const workEndMinutes = endH * 60 + endM;
    const checkOutMinutes = getKSTMinutes(checkOutDate);
    
    let effectiveCheckOut = checkOutDate.getTime();
    if (isNight) {
      if (checkOutMinutes >= workEndMinutes && checkOutMinutes <= workEndMinutes + checkoutThreshold) {
        const dateStr = recordDate || checkIn.split('T')[0];
        const nextDayStr = getNextDayStr(dateStr);
        effectiveCheckOut = new Date(`${nextDayStr}T${workEndTime}:00+09:00`).getTime();
      }
    } else {
      if (checkOutMinutes >= workEndMinutes && checkOutMinutes <= workEndMinutes + checkoutThreshold) {
        const dateStr = recordDate || checkOut.split('T')[0];
        effectiveCheckOut = new Date(`${dateStr}T${workEndTime}:00+09:00`).getTime();
      }
    }
    
    // break_minutes가 0/null이면 조직 설정의 휴게시간 사용
    let effectiveBreak = breakMinutes;
    if (effectiveBreak === 0) {
      if (isNight) {
        effectiveBreak = settings.shift_break_minutes || 0;
      } else {
        const [bsH, bsM] = settings.break_start_time.split(':').map(Number);
        const [beH, beM] = settings.break_end_time.split(':').map(Number);
        effectiveBreak = (beH * 60 + beM) - (bsH * 60 + bsM);
      }
      if (effectiveBreak < 0) effectiveBreak = 0;
    }

    const diffMs = effectiveCheckOut - effectiveCheckIn;
    let totalMinutes = Math.max(0, Math.round(diffMs / 60000) - effectiveBreak);
    
    // 주간조: 초과근무 휴게시간 추가 차감
    if (!isNight) {
      const standardMinutes = settings.standard_work_hours * 60;
      const overtime = totalMinutes - standardMinutes;
      if (overtime >= 240) {
        totalMinutes = Math.max(0, totalMinutes - settings.overtime_break_4h);
      } else if (overtime >= 120) {
        totalMinutes = Math.max(0, totalMinutes - settings.overtime_break_2h);
      }
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}시간 ${minutes}분`;
  };

  const exportToExcel = useCallback(async () => {
    if (!employee || employeeRecords.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('상세 근태 기록');

    worksheet.columns = [
      { header: '날짜', key: 'date', width: 15 },
      { header: '상태', key: 'status', width: 10 },
      { header: '출근시간', key: 'checkIn', width: 12 },
      { header: '퇴근시간', key: 'checkOut', width: 12 },
      { header: '근무시간', key: 'workHours', width: 14 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    const statusLabels: Record<string, string> = {
      present: '출근', late: '지각', absent: '결근', leave: '휴가', half_day: '반차',
    };

    employeeRecords.forEach((r) => {
      const row = worksheet.addRow({
        date: formatDate(r.date),
        status: statusLabels[r.status] || r.status,
        checkIn: formatTime(r.checkIn),
        checkOut: formatTime(r.checkOut),
        workHours: calculateWorkHours(r.checkIn, r.checkOut, r.breakMinutes, r.date, r.workType),
      });
      row.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' },
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${employee.name}_근태기록_${startDate}_${endDate}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }, [employee, employeeRecords, startDate, endDate]);

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {employee.name} 상세 근태 기록
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>사원번호: {employee.employeeNumber}</span>
            <span>부서: {employee.department}</span>
            <span>기간: {startDate} ~ {endDate}</span>
          </div>
          <Button variant="outline" size="sm" onClick={exportToExcel} disabled={employeeRecords.length === 0}>
            <Download className="w-4 h-4 mr-1" />
            엑셀
          </Button>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>날짜</TableHead>
                <TableHead className="text-center">상태</TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <LogIn className="w-4 h-4" />
                    출근시간
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <LogOut className="w-4 h-4" />
                    퇴근시간
                  </div>
                </TableHead>
                <TableHead className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Clock className="w-4 h-4" />
                    근무시간
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeeRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-medium">{formatDate(record.date)}</TableCell>
                  <TableCell className="text-center">{getStatusBadge(record.status)}</TableCell>
                  <TableCell className="text-center">{formatTime(record.checkIn)}</TableCell>
                  <TableCell className="text-center">{formatTime(record.checkOut)}</TableCell>
                  <TableCell className="text-center">
                    {calculateWorkHours(record.checkIn, record.checkOut, record.breakMinutes, record.date, record.workType)}
                  </TableCell>
                </TableRow>
              ))}
              {employeeRecords.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    해당 기간의 근태 기록이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
