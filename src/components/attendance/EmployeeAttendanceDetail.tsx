import { useMemo, useCallback, useEffect, useState } from 'react';
import { useAttendanceRange } from '@/hooks/useAttendance';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { supabase } from '@/integrations/supabase/client';
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

interface PublicHoliday {
  holiday_date: string;
  holiday_name: string;
  is_holiday: boolean;
}

export function EmployeeAttendanceDetail({
  employee,
  open,
  onOpenChange,
  startDate,
  endDate,
}: EmployeeAttendanceDetailProps) {
  const { data: dbAttendance = [] } = useAttendanceRange(startDate, endDate);
  const { settings } = useOrganizationSettings();

  const [publicHolidays, setPublicHolidays] = useState<PublicHoliday[]>([]);

  useEffect(() => {
    const fetchPublicHolidays = async () => {
      const { data, error } = await (supabase as any)
  .from('public_holidays')
  .select('holiday_date, holiday_name, is_holiday')
  .gte('holiday_date', startDate)
  .lte('holiday_date', endDate)
  .eq('is_holiday', true);

      if (error) {
        console.error('공휴일 조회 실패:', error);
        setPublicHolidays([]);
        return;
      }

      setPublicHolidays(data || []);
    };

    fetchPublicHolidays();
  }, [startDate, endDate]);

  const publicHolidayMap = useMemo<Map<string, string>>(() => {
  return new Map(
    publicHolidays.map((h) => [h.holiday_date, h.holiday_name] as [string, string]),
  );
}, [publicHolidays]);

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

  const isScheduledWorkday = useCallback(
    (dateStr: string) => {
      const date = new Date(dateStr + 'T00:00:00');
      const day = date.getDay();

      const anySettings = settings as any;

      const scheduledDays =
        anySettings?.scheduled_work_days ||
        anySettings?.work_days ||
        anySettings?.workdays ||
        [1, 2, 3, 4, 5];

      if (Array.isArray(scheduledDays)) {
        return scheduledDays.includes(day) || scheduledDays.includes(String(day));
      }

      return day >= 1 && day <= 5;
    },
    [settings],
  );

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}시간 ${mins}분`;
  };

  const getPaidHolidayMinutes = useCallback(() => {
    return Math.round((settings.standard_work_hours || 8) * 60);
  }, [settings.standard_work_hours]);

  const isPaidPublicHolidayRecord = useCallback(
    (record: { date: string; checkIn: string | null; checkOut: string | null }) => {
      const hasActualWork = !!(record.checkIn && record.checkOut);
      const holidayName = publicHolidayMap.get(record.date);

      return (
        settings.apply_public_holiday &&
        !hasActualWork &&
        !!holidayName &&
        isScheduledWorkday(record.date)
      );
    },
    [settings.apply_public_holiday, publicHolidayMap, isScheduledWorkday],
  );

  const getDisplayStatus = useCallback(
    (record: {
      date: string;
      status: string;
      checkIn: string | null;
      checkOut: string | null;
    }) => {
      if (isPaidPublicHolidayRecord(record)) {
        return 'paid_holiday';
      }

      return record.status;
    },
    [isPaidPublicHolidayRecord],
  );

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      present: { label: '출근', className: 'status-green' },
      late: { label: '지각', className: 'status-yellow' },
      absent: { label: '결근', className: 'status-red' },
      leave: { label: '휴가', className: 'status-purple' },
      half_day: { label: '반차', className: 'status-yellow' },
      paid_holiday: { label: '유급휴일', className: 'status-purple' },
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

  const getKSTMinutes = (date: Date) => {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return kst.getUTCHours() * 60 + kst.getUTCMinutes();
  };

  const getNextDayStr = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  };

  const calculateWorkHours = useCallback(
    (
      checkIn: string | null,
      checkOut: string | null,
      breakMinutes: number = 0,
      recordDate?: string,
      workType?: string,
    ) => {
      if (!checkIn || !checkOut) return '-';

      const checkInDate = new Date(checkIn);
      const checkOutDate = new Date(checkOut);
      const isNight = workType === 'night';

      const workStartTime = isNight ? settings.shift_tier1_start : settings.work_start_time;
      const workEndTime = isNight ? settings.shift_tier3_end : settings.work_end_time;
      const lateThreshold = isNight ? settings.shift_late_threshold : settings.late_threshold;
      const checkoutThreshold = isNight ? settings.shift_checkout_threshold : settings.checkout_threshold;

      const [startH, startM] = workStartTime.split(':').map(Number);
      const workStartMinutes = startH * 60 + startM;
      const checkInMinutes = getKSTMinutes(checkInDate);

      let effectiveCheckIn = checkInDate.getTime();
      if (
        checkInMinutes < workStartMinutes ||
        (checkInMinutes >= workStartMinutes && checkInMinutes <= workStartMinutes + lateThreshold)
      ) {
        const dateStr = recordDate || checkIn.split('T')[0];
        effectiveCheckIn = new Date(`${dateStr}T${workStartTime}:00+09:00`).getTime();
      }

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

      let effectiveBreak = breakMinutes;
      if (effectiveBreak === 0) {
        if (isNight) {
          effectiveBreak = settings.shift_break_minutes || 0;
        } else {
          const [bsH, bsM] = settings.break_start_time.split(':').map(Number);
          const [beH, beM] = settings.break_end_time.split(':').map(Number);
          effectiveBreak = beH * 60 + beM - (bsH * 60 + bsM);
        }

        if (effectiveBreak < 0) effectiveBreak = 0;
      }

      const diffMs = effectiveCheckOut - effectiveCheckIn;
      let totalMinutes = Math.max(0, Math.round(diffMs / 60000) - effectiveBreak);

      if (!isNight) {
        const standardMinutes = settings.standard_work_hours * 60;
        const overtime = totalMinutes - standardMinutes;

        if (overtime >= 240) {
          totalMinutes = Math.max(0, totalMinutes - settings.overtime_break_4h);
        } else if (overtime >= 120) {
          totalMinutes = Math.max(0, totalMinutes - settings.overtime_break_2h);
        }
      }

      return formatMinutes(totalMinutes);
    },
    [settings],
  );

  const getDisplayWorkHours = useCallback(
  (record: {
    date: string;
    checkIn: string | null;
    checkOut: string | null;
    breakMinutes: number;
    workType: string;
  }) => {
    if (isPaidPublicHolidayRecord(record)) {
      return `유급 ${formatMinutes(getPaidHolidayMinutes())}`;
    }

    return calculateWorkHours(
      record.checkIn,
      record.checkOut,
      record.breakMinutes,
      record.date,
      record.workType,
    );
  },
  [isPaidPublicHolidayRecord, getPaidHolidayMinutes, calculateWorkHours],
);

const getWeeklyHolidayPaidMinutes = useCallback(() => {
  const dailyMinutes = getPaidHolidayMinutes();

  const recordsByWeek = new Map<
    string,
    {
      scheduledTotal: number;
      scheduledWorked: number;
    }
  >();

  employeeRecords.forEach((record) => {
    if (!isScheduledWorkday(record.date)) return;

    const date = new Date(`${record.date}T00:00:00`);
    const day = date.getDay();
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((day + 6) % 7));

    const weekKey = monday.toISOString().slice(0, 10);

    const current = recordsByWeek.get(weekKey) || {
      scheduledTotal: 0,
      scheduledWorked: 0,
    };

    current.scheduledTotal += 1;

    const displayStatus = getDisplayStatus(record);

    if (
      displayStatus === 'present' ||
      displayStatus === 'late' ||
      displayStatus === 'paid_holiday'
    ) {
      current.scheduledWorked += 1;
    }

    recordsByWeek.set(weekKey, current);
  });

  let eligibleWeeks = 0;

  recordsByWeek.forEach((week) => {
    if (week.scheduledTotal > 0 && week.scheduledWorked === week.scheduledTotal) {
      eligibleWeeks += 1;
    }
  });

  return eligibleWeeks * dailyMinutes;
}, [employeeRecords, getPaidHolidayMinutes, isScheduledWorkday, getDisplayStatus]);

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
      present: '출근',
      late: '지각',
      absent: '결근',
      leave: '휴가',
      half_day: '반차',
      paid_holiday: '유급휴일',
    };

    employeeRecords.forEach((r) => {
  const displayStatus = getDisplayStatus(r);

  const row = worksheet.addRow({
    date: formatDate(r.date),
    status: statusLabels[displayStatus] || displayStatus,
    checkIn: formatTime(r.checkIn),
    checkOut: formatTime(r.checkOut),
    workHours: getDisplayWorkHours(r),
  });

  row.alignment = { vertical: 'middle', horizontal: 'center' };
});

const paidPublicHolidayMinutes = employeeRecords.reduce((sum, r) => {
  return isPaidPublicHolidayRecord(r) ? sum + getPaidHolidayMinutes() : sum;
}, 0);

const actualPublicHolidayWorkMinutes = employeeRecords.reduce((sum, r) => {
  const hasActualWork = !!(r.checkIn && r.checkOut);
  const isPublicHolidayWork =
    settings.apply_public_holiday &&
    publicHolidayMap.has(r.date) &&
    isScheduledWorkday(r.date) &&
    hasActualWork;

  if (!isPublicHolidayWork) return sum;

  const workHoursText = calculateWorkHours(
    r.checkIn,
    r.checkOut,
    r.breakMinutes,
    r.date,
    r.workType,
  );

  const match = workHoursText.match(/(\d+)시간\s*(\d+)분/);
  if (!match) return sum;

  return sum + Number(match[1]) * 60 + Number(match[2]);
}, 0);

const weeklyHolidayPaidMinutes = getWeeklyHolidayPaidMinutes();

worksheet.addRow({});
worksheet.addRow({ date: '근무시간 상세' });

worksheet.addRow({
  date: '공휴일 유급인정시간',
  status: formatMinutes(paidPublicHolidayMinutes),
});

worksheet.addRow({
  date: '공휴일 실제근무시간',
  status: formatMinutes(actualPublicHolidayWorkMinutes),
});

worksheet.addRow({
  date: '주휴수당 인정시간',
  status: formatMinutes(weeklyHolidayPaidMinutes),
});

worksheet.eachRow((row) => {
  row.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
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
  }, [
  employee,
  employeeRecords,
  startDate,
  endDate,
  getDisplayStatus,
  getDisplayWorkHours,
  isPaidPublicHolidayRecord,
  getPaidHolidayMinutes,
  publicHolidayMap,
  isScheduledWorkday,
  settings.apply_public_holiday,
  calculateWorkHours,
  getWeeklyHolidayPaidMinutes,
]);

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
            <span>
              기간: {startDate} ~ {endDate}
            </span>
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
                  <TableCell className="text-center">{getStatusBadge(getDisplayStatus(record))}</TableCell>
                  <TableCell className="text-center">{formatTime(record.checkIn)}</TableCell>
                  <TableCell className="text-center">{formatTime(record.checkOut)}</TableCell>
                  <TableCell className="text-center">{getDisplayWorkHours(record)}</TableCell>
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