import React, { useState, useMemo, useEffect } from "react";
import { useEmployeeStore } from "@/store/employeeStore";
import { useEmployees } from "@/hooks/useEmployees";
import { useAttendanceRange } from "@/hooks/useAttendance";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { usePayrollCalculation } from "@/hooks/usePayrollCalculation";
import { usePayroll } from "@/hooks/usePayroll";
import { calculateAttendanceTotals, calculateSingleAttendance } from "@/utils/attendanceCalculation";
import { isPublicHoliday, isWeeklyHoliday, isScheduledWorkday } from "@/utils/salaryDetailCalculation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Download,
  BarChart3,
  Calculator,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Info,
  Search,
  FileSpreadsheet,
} from "lucide-react";
import { FilterSidebar } from "@/components/filters/FilterSidebar";
import { groupByDepartment } from "@/components/filters/DepartmentChipFilter";
import { DepartmentGroupHeader } from "@/components/filters/DepartmentGroupHeader";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { EmployeeAttendanceDetail } from "./EmployeeAttendanceDetail";
import { EmployeeCombobox } from "@/components/employee/EmployeeCombobox";
import { Employee } from "@/types/employee";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function AttendanceSummary() {
  const { settings } = useOrganizationSettings();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [payrollDialogOpen, setPayrollDialogOpen] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [checkedSummaryIds, setCheckedSummaryIds] = useState<string[]>([]);
  const [highlightedEmployeeId, setHighlightedEmployeeId] = useState<string | null>(null);
  const [payTypeFilter, setPayTypeFilter] = useState<"all" | "monthly" | "daily" | "hourly">("all");
  const [isCalculating, setIsCalculating] = useState(false);
  const { employees: storeEmployees, attendance: storeAttendance, calculatePayrollFromAttendance } = useEmployeeStore();
  const { employees: dbEmployees } = useEmployees();

  const today = new Date();
  const [viewType, setViewType] = useState<"monthly" | "period">("monthly");
  const [selectedMonth, setSelectedMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
  );
  const [startDate, setStartDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState(today.toISOString().split("T")[0]);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedEmploymentType, setSelectedEmploymentType] = useState<string | null>(null);
  const [selectedPayType, setSelectedPayType] = useState<string | null>(null);
  const [selectedJobCategory, setSelectedJobCategory] = useState<string | null>(null);
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());

  const convertedDbEmployees: Employee[] = useMemo(() => {
    return dbEmployees.map((emp) => ({
      id: emp.id,
      employeeNumber: emp.employee_number,
      name: emp.name,
      residentNumber: emp.resident_number || undefined,
      department: emp.department || "",
      position: emp.position || "",
      email: emp.email || "",
      phone: emp.phone || "",
      hireDate: emp.hire_date,
      baseSalary: emp.base_salary,
      payType: emp.pay_type,
      dailyRate: emp.daily_rate || undefined,
      hourlyRate: emp.hourly_rate || undefined,
      employmentType: emp.employment_type,
      status: emp.is_active ? "active" : "inactive",
    }));
  }, [dbEmployees]);

  const employees = useMemo(() => {
    return convertedDbEmployees.length > 0 ? convertedDbEmployees : storeEmployees;
  }, [convertedDbEmployees, storeEmployees]);

  const dateRange = useMemo(() => {
    if (viewType === "monthly") {
      const [year, month] = selectedMonth.split("-").map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
      const endStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      return {
        start: startStr,
        end: endStr,
        daysInPeriod: lastDay,
      };
    }

    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return {
      start: startDate,
      end: endDate,
      daysInPeriod: diffDays,
    };
  }, [viewType, selectedMonth, startDate, endDate]);

  const { data: dbAttendance = [] } = useAttendanceRange(dateRange.start, dateRange.end);

const [publicHolidayMap, setPublicHolidayMap] = useState<Map<string, string>>(new Map());

useEffect(() => {
  const fetchPublicHolidays = async () => {
    const { data, error } = await (supabase as any)
      .from("public_holidays")
      .select("holiday_date, holiday_name, is_holiday")
      .gte("holiday_date", dateRange.start)
      .lte("holiday_date", dateRange.end)
      .eq("is_holiday", true);

    if (error) {
      console.error("공휴일 조회 실패:", error);
      setPublicHolidayMap(new Map());
      return;
    }

    setPublicHolidayMap(
      new Map(
        (data || []).map((h: { holiday_date: string; holiday_name: string }) => [
          h.holiday_date,
          h.holiday_name,
        ]),
      ),
    );
  };

  fetchPublicHolidays();
}, [dateRange.start, dateRange.end]);

  const attendance = useMemo(() => {
    if (dbAttendance.length > 0) {
      return dbAttendance.map((att) => ({
        id: att.id,
        employeeId: att.employee_id,
        employeeNumber: att.employee?.employee_number || "",
        employeeName: att.employee?.name || "",
        department: att.employee?.department || "",
        date: att.date,
        checkIn: att.check_in ? new Date(att.check_in).toTimeString().slice(0, 5) : null,
        checkOut: att.check_out ? new Date(att.check_out).toTimeString().slice(0, 5) : null,
        rawCheckIn: att.check_in,
        rawCheckOut: att.check_out,
        breakMinutes: att.break_minutes ?? 0,
        workType: att.work_type || "day",
        status: att.status as "present" | "late" | "absent" | "leave",
      }));
    }

    return storeAttendance;
  }, [dbAttendance, storeAttendance]);

  const [selectedYear, selectedMonthNum] = useMemo(() => {
    const month = viewType === "monthly" ? selectedMonth : startDate.slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    return [y, m];
  }, [viewType, selectedMonth, startDate]);

  const { calculatePayroll } = usePayrollCalculation(selectedYear, selectedMonthNum);
  const { payroll: dbPayroll = [] } = usePayroll(selectedYear, selectedMonthNum);

  const payrollTimeMap = useMemo(() => {
    const map = new Map<string, any>();

    dbPayroll.forEach((record: any) => {
      map.set(record.employee_id, {
        totalWorkMinutes: record.total_work_minutes || 0,
        regularWorkMinutes: record.regular_work_minutes || 0,
        overtimeMinutes: record.overtime_minutes || 0,
        nightWorkMinutes: record.night_work_minutes || 0,
        // 야간교대는 payroll_records의 비휴일 야간교대 값으로 덮어쓰지 않는다.
        // 화면/엑셀의 야간교대근무시간은 전체 야간교대 기준을 유지한다.
      });
    });

    return map;
  }, [dbPayroll]);

  const employeeSummary = useMemo(() => {
    let filteredEmps = [...employees];

    if (selectedDepartment) {
      if (selectedDepartment === "미분류") {
        filteredEmps = filteredEmps.filter((e) => !e.department);
      } else {
        filteredEmps = filteredEmps.filter((e) => e.department === selectedDepartment);
      }
    }

    if (selectedEmploymentType) {
      filteredEmps = filteredEmps.filter((e) => e.employmentType === selectedEmploymentType);
    }

    if (selectedPayType) {
      filteredEmps = filteredEmps.filter((e) => e.payType === selectedPayType);
    }

    if (selectedJobCategory) {
      filteredEmps = filteredEmps.filter((e) => {
        const dbEmp = dbEmployees.find((d) => d.id === e.id);
        return (dbEmp?.job_category || "office") === selectedJobCategory;
      });
    }

    return filteredEmps.map((emp) => {
      const empAttendance = attendance.filter((att) => {
        if (att.employeeId !== emp.id) return false;
        return att.date >= dateRange.start && att.date <= dateRange.end;
      });

      const presentDays = empAttendance.filter((a) => a.status === "present").length;
      const lateDays = empAttendance.filter((a) => a.status === "late").length;
      const absentDays = empAttendance.filter((a) => a.status === "absent").length;
      const leaveDays = empAttendance.filter((a) => a.status === "leave").length;

      const totals = calculateAttendanceTotals(
        empAttendance.map((att: any) => ({
          date: att.date,
          rawCheckIn: att.rawCheckIn,
          rawCheckOut: att.rawCheckOut,
          breakMinutes: att.breakMinutes ?? 0,
          workType: att.workType || "day",
        })),
        settings,
      );

      const {
        totalMinutes,
        totalStayMinutes,
        totalBreakMinutes,
        totalLateTruncation,
        totalOvertimeTruncation,
        totalEarlyLeaveTruncation,
        totalOutingTruncation,
        totalRegularMinutes,
        totalOvertimeWorkMinutes,
        totalNightWorkMinutes,
        totalNightShiftWorkMinutes,
        totalNightShiftTier1Minutes,
        totalNightShiftTier2Minutes,
        totalNightShiftTier3Minutes,
        totalNightShiftTier4Minutes,
        totalHoliday8hMinutes,
        totalHolidayOver8hMinutes,
        totalHolidayNightMinutes,
      } = totals;

      let totalActualLateMinutes = 0;
      let totalActualEarlyLeaveMinutes = 0;

      const getKstMinutes = (value: string | null) => {
        if (!value) return null;
        const d = new Date(value);
        const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        return kst.getUTCHours() * 60 + kst.getUTCMinutes();
      };

      empAttendance.forEach((att: any) => {
        const ci = att.rawCheckIn || att.checkIn;
        const co = att.rawCheckOut || att.checkOut;
        if (!ci || !co) return;

        const isNight = (att.workType || "day") === "night";

        const checkInMin = getKstMinutes(ci);
        const checkOutMin = getKstMinutes(co);
        if (checkInMin === null || checkOutMin === null) return;

        const startTime = isNight ? settings.shift_tier1_start : settings.work_start_time;
        const endTime = isNight ? settings.shift_tier3_end : settings.work_end_time;
        const lateThreshold = isNight ? settings.shift_late_threshold : settings.late_threshold;

        const [sh, sm] = startTime.split(":").map(Number);
        const startMin = sh * 60 + sm;

        const [eh, em] = endTime.split(":").map(Number);
        const endMin = eh * 60 + em;

        if (checkInMin > startMin + lateThreshold) {
          totalActualLateMinutes += checkInMin - startMin;
        }

        if (!isNight && checkOutMin < endMin) {
          totalActualEarlyLeaveMinutes += endMin - checkOutMin;
        }
      });

      let holidayNightShiftMinutes = 0;
let holidayNightShiftTier1Minutes = 0;
let holidayNightShiftTier2Minutes = 0;
let holidayNightShiftTier3Minutes = 0;
let holidayNightShiftTier4Minutes = 0;

let actualHolidayWithin8Minutes = 0;
let actualHolidayOver8Minutes = 0;

let totalPaidPublicHolidayMinutes = 0;
let totalPublicHolidayActualWorkMinutes = 0;

      empAttendance.forEach((att: any) => {
  const ci = att.rawCheckIn || att.checkIn;
  const co = att.rawCheckOut || att.checkOut;
  const isNight = (att.workType || "day") === "night";

  const isDbPublicHoliday = publicHolidayMap.has(att.date);
const isScheduledForPaidHoliday = isScheduledWorkday(att.date, settings);
const hasActualWork = !!(ci && co);

if (settings.apply_public_holiday && isDbPublicHoliday && isScheduledForPaidHoliday) {
    const paidMinutes = Math.round((settings.standard_work_hours || 8) * 60);
    totalPaidPublicHolidayMinutes += paidMinutes;

    if (hasActualWork) {
  const bd = calculateSingleAttendance(
    ci,
    co,
    att.date,
    att.breakMinutes ?? 0,
    isNight,
    settings,
    false,
  );

  totalPublicHolidayActualWorkMinutes += bd.recognizedMinutes;

  if (!isNight) {
    const holidayWorkedMinutes = bd.recognizedMinutes || 0;
    actualHolidayWithin8Minutes += Math.min(holidayWorkedMinutes, 8 * 60);
    actualHolidayOver8Minutes += Math.max(0, holidayWorkedMinutes - 8 * 60);
  }
}
  }

  if (!ci || !co || !isNight) return;

        const isWeeklyHol = isWeeklyHoliday(att.date, settings);
        const isPubHol = isPublicHoliday(att.date);
        const isScheduled = isScheduledWorkday(att.date, settings);
        const nonWorkDayType = (settings as any).non_work_day_default_type ?? "REST_DAY";
        const isNonScheduledHoliday =
          !isScheduled && !isWeeklyHol && !(isPubHol && settings.apply_public_holiday) && nonWorkDayType === "HOLIDAY";

        const isHolidayDay = isWeeklyHol || (isPubHol && settings.apply_public_holiday) || isNonScheduledHoliday;

        if (!isHolidayDay) return;

        const bd = calculateSingleAttendance(ci, co, att.date, att.breakMinutes ?? 0, true, settings, false);

const holidayWorkedMinutes = bd.recognizedMinutes || bd.nightShiftWorkMinutes || 0;
actualHolidayWithin8Minutes += Math.min(holidayWorkedMinutes, 8 * 60);
actualHolidayOver8Minutes += Math.max(0, holidayWorkedMinutes - 8 * 60);

holidayNightShiftMinutes += bd.nightShiftWorkMinutes;
holidayNightShiftTier1Minutes += bd.nightShiftTier1Minutes;
holidayNightShiftTier2Minutes += bd.nightShiftTier2Minutes;
holidayNightShiftTier3Minutes += bd.nightShiftTier3Minutes;
holidayNightShiftTier4Minutes += bd.nightShiftTier4Minutes;
      });

      const nonHolidayNightShiftMinutes = Math.max(0, totalNightShiftWorkMinutes - holidayNightShiftMinutes);
      const nonHolidayNightShiftTier1Minutes = Math.max(0, totalNightShiftTier1Minutes - holidayNightShiftTier1Minutes);
      const nonHolidayNightShiftTier2Minutes = Math.max(0, totalNightShiftTier2Minutes - holidayNightShiftTier2Minutes);
      const nonHolidayNightShiftTier3Minutes = Math.max(0, totalNightShiftTier3Minutes - holidayNightShiftTier3Minutes);
      const nonHolidayNightShiftTier4Minutes = Math.max(0, totalNightShiftTier4Minutes - holidayNightShiftTier4Minutes);

      const displayHoliday8hMinutes = actualHolidayWithin8Minutes;
const displayHolidayOver8hMinutes = actualHolidayOver8Minutes;

      const nightShiftDays = empAttendance.filter(
        (att) =>
          (att as any).workType === "night" &&
          ((att as any).rawCheckIn || att.checkIn) &&
          ((att as any).rawCheckOut || att.checkOut),
      ).length;

      const displayTotalMinutes = totalMinutes + totalPaidPublicHolidayMinutes;

const totalHours = Math.floor(displayTotalMinutes / 60);
const remainingMinutes = displayTotalMinutes % 60;

      const attendanceRate =
        dateRange.daysInPeriod > 0 ? Math.round(((presentDays + lateDays) / dateRange.daysInPeriod) * 100) : 0;

      const actualEarlyLeaveDays = empAttendance.filter((att: any) => {
        const co = att.rawCheckOut || att.checkOut;
        if (!co) return false;

        const isNight = (att.workType || "day") === "night";
        if (isNight) return false;

        const checkOutMin = getKstMinutes(co);
        if (checkOutMin === null) return false;

        const [eh, em] = settings.work_end_time.split(":").map(Number);
        const endMin = eh * 60 + em;

        return checkOutMin < endMin;
      }).length;

      const payrollTime = payrollTimeMap.get(emp.id);

      return {
        ...emp,
        presentDays,
        lateDays,
        earlyLeaveDays: actualEarlyLeaveDays,
        absentDays,
        leaveDays,
        totalWorkTime: `${totalHours}시간 ${remainingMinutes}분`,
        totalMinutes: displayTotalMinutes,
        totalStayMinutes,
        totalBreakMinutes,
        totalLateTruncation,
        totalOvertimeTruncation,
        totalEarlyLeaveTruncation,
        totalOutingTruncation,
        totalRegularMinutes,
        totalOvertimeWorkMinutes,
        totalNightWorkMinutes,
        totalNightShiftWorkMinutes,
        totalNightShiftTier1Minutes,
        totalNightShiftTier2Minutes,
        totalNightShiftTier3Minutes,
        totalNightShiftTier4Minutes,
        totalHoliday8hMinutes,
        totalHolidayOver8hMinutes,
        totalHolidayNightMinutes,

        displayRegularMinutes: payrollTime?.regularWorkMinutes ?? totalRegularMinutes,
        displayOvertimeMinutes: payrollTime?.overtimeMinutes ?? totalOvertimeWorkMinutes,
        displayNightWorkMinutes: payrollTime?.nightWorkMinutes ?? totalNightWorkMinutes,
        displayNightShiftWorkMinutes: totalNightShiftWorkMinutes,

        holidayNightShiftMinutes,
        nonHolidayNightShiftMinutes,
        holidayNightShiftTier1Minutes,
        holidayNightShiftTier2Minutes,
        holidayNightShiftTier3Minutes,
        holidayNightShiftTier4Minutes,
        nonHolidayNightShiftTier1Minutes,
        nonHolidayNightShiftTier2Minutes,
        nonHolidayNightShiftTier3Minutes,
        nonHolidayNightShiftTier4Minutes,
        displayHoliday8hMinutes,
        displayHolidayOver8hMinutes,

        totalActualLateMinutes,
totalActualEarlyLeaveMinutes,

totalPaidPublicHolidayMinutes,
totalPublicHolidayActualWorkMinutes,

attendanceRate,
      };
    });
  }, [
    employees,
    attendance,
    selectedDepartment,
    selectedEmploymentType,
    selectedPayType,
    selectedJobCategory,
    dbEmployees,
    dateRange,
    settings,
    payrollTimeMap,
publicHolidayMap,
]);

  const overallStats = useMemo(() => {
    const totalPresent = employeeSummary.reduce((sum, e) => sum + e.presentDays, 0);
    const totalLate = employeeSummary.reduce((sum, e) => sum + e.lateDays, 0);
    const totalAbsent = employeeSummary.reduce((sum, e) => sum + e.absentDays, 0);
    const totalLeave = employeeSummary.reduce((sum, e) => sum + e.leaveDays, 0);
    const avgAttendanceRate =
      employeeSummary.length > 0
        ? Math.round(employeeSummary.reduce((sum, e) => sum + e.attendanceRate, 0) / employeeSummary.length)
        : 0;

    return { totalPresent, totalLate, totalAbsent, totalLeave, avgAttendanceRate };
  }, [employeeSummary]);

  const getAttendanceRateColor = (rate: number) => {
    if (rate >= 90) return "status-green";
    if (rate >= 70) return "status-yellow";
    return "status-red";
  };

  const groupedSummary = useMemo(() => groupByDepartment(employeeSummary), [employeeSummary]);

  const toggleCollapseDept = (dept: string) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  const COL_SPAN = 12;

  const activeEmployees = employees.filter((e) => e.status === "active");
  const filteredEmployees = activeEmployees.filter((emp) => payTypeFilter === "all" || emp.payType === payTypeFilter);

  const handleOpenPayrollDialog = () => {
    setPayTypeFilter("all");
    setSelectedEmployeeIds(activeEmployees.map((e) => e.id));
    setPayrollDialogOpen(true);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedEmployeeIds((prev) => {
        const filteredIds = filteredEmployees.map((e) => e.id);
        const otherSelected = prev.filter(
          (id) => !activeEmployees.find((e) => e.id === id) || !filteredEmployees.find((e) => e.id === id),
        );
        return [...new Set([...otherSelected, ...filteredIds])];
      });
    } else {
      const filteredIds = filteredEmployees.map((e) => e.id);
      setSelectedEmployeeIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    }
  };

  const handleSelectEmployee = (employeeId: string, checked: boolean) => {
    if (checked) {
      setSelectedEmployeeIds((prev) => [...prev, employeeId]);
    } else {
      setSelectedEmployeeIds((prev) => prev.filter((id) => id !== employeeId));
    }
  };

  const handlePayTypeFilterChange = (value: "all" | "monthly" | "daily" | "hourly") => {
    setPayTypeFilter(value);
  };

  const handleExcelDownload = async () => {
    const targetSummary =
      checkedSummaryIds.length > 0
        ? employeeSummary.filter((emp) => checkedSummaryIds.includes(emp.id))
        : employeeSummary;

    if (targetSummary.length === 0) {
      toast.error("다운로드할 직원이 없습니다.");
      return;
    }

    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const label = viewType === "monthly" ? selectedMonth : `${startDate}~${endDate}`;
      const sheet = workbook.addWorksheet(`근태현황_${label}`);

      let periodText = "";
      if (viewType === "monthly") {
        const [year, month] = selectedMonth.split("-");
        periodText = `조회기간: ${year}년 ${parseInt(month)}월`;
      } else {
        periodText = `조회기간: ${startDate} ~ ${endDate}`;
      }

      const titleRow = sheet.addRow([periodText]);
      titleRow.font = { bold: true, size: 12 };
      sheet.mergeCells(1, 1, 1, 30);
      titleRow.height = 24;

      sheet.addRow([]);

      const headerRow = sheet.addRow([
        "사원번호",
        "이름",
        "급여유형",
        "부서",
        "출근",
        "지각",
        "조퇴",
        "결근",
        "휴가",
        "체류시간",
        "휴게시간",
        "지각시간",
        "조퇴시간",
        "지각 절사",
        "근무시간 단위 절사",
        "조기퇴근 절사",
        "외출 절사",
        "인정근무",
        "정규근무시간",
        "연장근무시간",
        "야간근무시간",
"공휴일 유급인정시간",
"휴일근로(8h이내)",
"휴일근로(8h초과)",
"야간교대근무시간",
        "1단계(정규+비야간)",
        "2단계(정규+야간)",
        "3단계(연장+야간)",
        "4단계(연장+비야간)",
        "출근율",
      ]);

      sheet.columns = [
        { width: 14 },
        { width: 12 },
        { width: 10 },
        { width: 14 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 8 },
        { width: 16 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 18 },
        { width: 14 },
        { width: 12 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
{ width: 20 },
{ width: 18 },
{ width: 18 },
{ width: 18 },
        { width: 18 },
        { width: 16 },
        { width: 16 },
        { width: 10 },
      ];

      const payTypeMap: Record<string, string> = { monthly: "월급", daily: "일급", hourly: "시급" };
      const fmtMin = (m: number) => `${Math.floor(m / 60)}시간 ${m % 60}분`;

      targetSummary.forEach((emp: any) => {
        sheet.addRow([
          emp.employeeNumber,
          emp.name,
          payTypeMap[emp.payType] || emp.payType,
          emp.department,
          emp.presentDays,
          emp.lateDays,
          emp.earlyLeaveDays || 0,
          emp.absentDays,
          emp.leaveDays,
          fmtMin(emp.totalStayMinutes),
          `-${emp.totalBreakMinutes}분`,
          emp.totalActualLateMinutes > 0 ? `+${emp.totalActualLateMinutes}분` : "0분",
          emp.totalActualEarlyLeaveMinutes > 0 ? `+${emp.totalActualEarlyLeaveMinutes}분` : "0분",
          emp.totalLateTruncation > 0 ? `-${emp.totalLateTruncation}분` : "0분",
          emp.totalOvertimeTruncation > 0 ? `-${emp.totalOvertimeTruncation}분` : "0분",
          emp.totalEarlyLeaveTruncation > 0 ? `-${emp.totalEarlyLeaveTruncation}분` : "0분",
          emp.totalOutingTruncation > 0 ? `-${emp.totalOutingTruncation}분` : "0분",
          fmtMin(emp.totalMinutes),
          fmtMin(emp.displayRegularMinutes ?? emp.totalRegularMinutes ?? 0),
          fmtMin(emp.displayOvertimeMinutes ?? emp.totalOvertimeWorkMinutes ?? 0),
          fmtMin(emp.displayNightWorkMinutes ?? emp.totalNightWorkMinutes ?? 0),
fmtMin(emp.totalPaidPublicHolidayMinutes || 0),
fmtMin(emp.displayHoliday8hMinutes || 0),
fmtMin(emp.displayHolidayOver8hMinutes || 0),
fmtMin(emp.displayNightShiftWorkMinutes ?? emp.totalNightShiftWorkMinutes ?? 0),
          emp.totalNightShiftTier1Minutes > 0 ? fmtMin(emp.totalNightShiftTier1Minutes) : "-",
          emp.totalNightShiftTier2Minutes > 0 ? fmtMin(emp.totalNightShiftTier2Minutes) : "-",
          emp.totalNightShiftTier3Minutes > 0 ? fmtMin(emp.totalNightShiftTier3Minutes) : "-",
          emp.totalNightShiftTier4Minutes > 0 ? fmtMin(emp.totalNightShiftTier4Minutes) : "-",
          `${emp.attendanceRate}%`,
        ]);
      });

      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `근태현황_${label}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("엑셀 다운로드가 완료되었습니다");
    } catch (error) {
      console.error("Excel download error:", error);
      toast.error("엑셀 다운로드 중 오류가 발생했습니다");
    }
  };

  const handleDetailExcelDownload = async () => {
    const targetEmployees =
      checkedSummaryIds.length > 0
        ? employeeSummary.filter((emp) => checkedSummaryIds.includes(emp.id))
        : employeeSummary;

    if (targetEmployees.length === 0) {
      toast.error("다운로드할 직원이 없습니다.");
      return;
    }

    try {
      const ExcelJS = await import("exceljs");
      const { calculateSingleAttendance } = await import("@/utils/attendanceCalculation");
      const workbook = new ExcelJS.Workbook();

      const statusLabels: Record<string, string> = {
  present: "출근",
  late: "지각",
  absent: "결근",
  leave: "휴가",
  half_day: "반차",
  paid_holiday: "유급휴일",
  paid_holiday_work: "유급휴일 출근",
};

      const formatDate = (dateStr: string) => {
        const date = new Date(dateStr + "T00:00:00");
        const days = ["일", "월", "화", "수", "목", "금", "토"];
        return `${date.getMonth() + 1}/${date.getDate()} (${days[date.getDay()]})`;
      };

      const fmtMinutes = (m: number) => `${Math.floor(m / 60)}시간 ${m % 60}분`;

      for (const emp of targetEmployees) {
        const empRecords = attendance
          .filter((att) => att.employeeId === emp.id)
          .sort((a, b) => b.date.localeCompare(a.date));

        const sheetName = `${emp.name}(${emp.employeeNumber})`.slice(0, 31);
        const sheet = workbook.addWorksheet(sheetName);

        const titleRow = sheet.addRow([`${emp.name} (${emp.employeeNumber}) - ${emp.department || "미분류"}`]);
        titleRow.font = { bold: true, size: 12 };
        sheet.mergeCells(1, 1, 1, 5);
        titleRow.height = 24;

        const periodText =
          viewType === "monthly"
            ? `조회기간: ${selectedMonth.split("-")[0]}년 ${parseInt(selectedMonth.split("-")[1])}월`
            : `조회기간: ${dateRange.start} ~ ${dateRange.end}`;
        const periodRow = sheet.addRow([periodText]);
        periodRow.font = { size: 10, color: { argb: "FF666666" } };
        sheet.mergeCells(2, 1, 2, 5);
        sheet.addRow([]);

        sheet.columns = [{ width: 15 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 14 }];

        const headerRow = sheet.addRow(["날짜", "상태", "출근시간", "퇴근시간", "근무시간"]);
        headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
        headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
        headerRow.alignment = { vertical: "middle", horizontal: "center" };
        headerRow.height = 24;

        let totalStay = 0;
        let totalBreak = 0;
        let totalLate = 0;
        let totalOT = 0;
        let totalEarly = 0;
        let totalOuting = 0;
        let totalRecognized = 0;
        let totalRegular = 0;
        let totalOvertime = 0;
        let totalNight = 0;
        let totalNightShift = 0;
        let totalTier1 = 0;
        let totalTier2 = 0;
        let totalTier3 = 0;
        let totalTier4 = 0;
        let totalHoliday8h = 0;
let totalHolidayOver8h = 0;
let totalHolidayNightShift = 0;
let actualHolidayWithin8Minutes = 0;
let actualHolidayOver8Minutes = 0;
let totalHolidayNightShiftTier1 = 0;
let totalHolidayNightShiftTier2 = 0;
let totalHolidayNightShiftTier3 = 0;
let totalHolidayNightShiftTier4 = 0;

let totalPaidPublicHolidayMinutes = 0;
let totalPublicHolidayActualWorkMinutes = 0;

        empRecords.forEach((r: any) => {
  const ci = r.rawCheckIn || r.checkIn;
  const co = r.rawCheckOut || r.checkOut;
  let workTimeStr = "-";

  const isDbPublicHoliday = publicHolidayMap.has(r.date);
  const hasActualWork = !!(ci && co);

  const isPaidPublicHolidayOnly =
    settings.apply_public_holiday &&
    isDbPublicHoliday &&
    isScheduledWorkday(r.date, settings) &&
    !hasActualWork;

const isPaidPublicHolidayWork =
  settings.apply_public_holiday &&
  isDbPublicHoliday &&
  isScheduledWorkday(r.date, settings) &&
  hasActualWork;

  if (isPaidPublicHolidayOnly) {
    const paidMinutes = Math.round((settings.standard_work_hours || 8) * 60);

    workTimeStr = `유급 ${fmtMinutes(paidMinutes)}`;
    totalPaidPublicHolidayMinutes += paidMinutes;
    totalRecognized += paidMinutes;
  }

  if (ci && co) {
            const isNight = (r.workType || "day") === "night";

            const isHolidayDay =
              isWeeklyHoliday(r.date, settings) || (isPublicHoliday(r.date) && settings.apply_public_holiday);

            const bd = calculateSingleAttendance(
              ci,
              co,
              r.date,
              r.breakMinutes ?? 0,
              isNight,
              settings,
              isHolidayDay && !isNight,
            );

            workTimeStr = fmtMinutes(bd.recognizedMinutes);
totalStay += bd.stayMinutes;
totalBreak += bd.breakMinutes;

if (isPaidPublicHolidayWork) {
  const paidMinutes = Math.round((settings.standard_work_hours || 8) * 60);
  totalPaidPublicHolidayMinutes += paidMinutes;
  totalPublicHolidayActualWorkMinutes += bd.recognizedMinutes;

  if (!isNight) {
    const holidayWorkedMinutes = bd.recognizedMinutes || 0;
    actualHolidayWithin8Minutes += Math.min(holidayWorkedMinutes, 8 * 60);
    actualHolidayOver8Minutes += Math.max(0, holidayWorkedMinutes - 8 * 60);
  }
}

totalLate += bd.lateTruncation;
            totalOT += bd.overtimeTruncation;
            totalEarly += bd.earlyLeaveTruncation;
            totalOuting += bd.outingTruncation;
            totalRecognized += bd.recognizedMinutes;

            if (isNight) {
              totalNightShift += bd.nightShiftWorkMinutes;
              totalTier1 += bd.nightShiftTier1Minutes;
              totalTier2 += bd.nightShiftTier2Minutes;
              totalTier3 += bd.nightShiftTier3Minutes;
              totalTier4 += bd.nightShiftTier4Minutes;

              if (isHolidayDay) {
  const holidayWorkedMinutes = bd.recognizedMinutes || bd.nightShiftWorkMinutes || 0;
  actualHolidayWithin8Minutes += Math.min(holidayWorkedMinutes, 8 * 60);
  actualHolidayOver8Minutes += Math.max(0, holidayWorkedMinutes - 8 * 60);

  totalHolidayNightShift += bd.nightShiftWorkMinutes;
  totalHolidayNightShiftTier1 += bd.nightShiftTier1Minutes;
  totalHolidayNightShiftTier2 += bd.nightShiftTier2Minutes;
  totalHolidayNightShiftTier3 += bd.nightShiftTier3Minutes;
  totalHolidayNightShiftTier4 += bd.nightShiftTier4Minutes;
}
            } else if (isHolidayDay) {
              totalHoliday8h += bd.holidayMinutesWithin8h;
              totalHolidayOver8h += bd.holidayMinutesOver8h;
              totalNight += bd.nightWorkMinutes;
            } else if (!isScheduledWorkday(r.date, settings)) {
              totalOvertime += bd.recognizedMinutes - bd.nightWorkMinutes;
              totalNight += bd.nightWorkMinutes;
            } else {
              totalRegular += bd.regularMinutes;
              totalOvertime += bd.overtimeWorkMinutes;
              totalNight += bd.nightWorkMinutes;
            }
          }


const displayStatus = isPaidPublicHolidayOnly
  ? "paid_holiday"
  : isPaidPublicHolidayWork
    ? "paid_holiday_work"
    : r.status;

const row = sheet.addRow([
  formatDate(r.date),
  statusLabels[displayStatus] || displayStatus,
  ci
    ? new Date(ci).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: "Asia/Seoul",
                })
              : "-",
            co
              ? new Date(co).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: "Asia/Seoul",
                })
              : "-",
            workTimeStr,
          ]);

          row.alignment = { vertical: "middle", horizontal: "center" };
        });

        if (empRecords.length === 0) {
          const row = sheet.addRow(["해당 기간의 근태 기록이 없습니다."]);
          sheet.mergeCells(sheet.rowCount, 1, sheet.rowCount, 5);
          row.alignment = { horizontal: "center" };
        }

        if (empRecords.length > 0) {
          sheet.addRow([]);

          const summaryHeaderRow = sheet.addRow(["근무시간 상세"]);
          summaryHeaderRow.font = { bold: true, size: 11 };
          sheet.mergeCells(sheet.rowCount, 1, sheet.rowCount, 5);

          const nightShiftDaysExcel = empRecords.filter((r: any) => {
            const ci = r.rawCheckIn || r.checkIn;
            const co = r.rawCheckOut || r.checkOut;
            return (r.workType || "day") === "night" && ci && co;
          }).length;

          const correctedRecognized =
  totalRecognized + totalPaidPublicHolidayMinutes;

          const nonHolidayNightShift = Math.max(0, totalNightShift - totalHolidayNightShift);
          const displayHoliday8h = actualHolidayWithin8Minutes;
const displayHolidayOver8h = actualHolidayOver8Minutes;

          const summaryData = [
            ["체류시간", fmtMinutes(totalStay)],
            ["휴게시간", `-${totalBreak}분`],

            ["[근태 정보]", ""],
            [
              "  지각시간",
              (emp as any).totalActualLateMinutes > 0 ? `+${(emp as any).totalActualLateMinutes}분` : "0분",
            ],
            [
              "  조퇴시간",
              (emp as any).totalActualEarlyLeaveMinutes > 0 ? `+${(emp as any).totalActualEarlyLeaveMinutes}분` : "0분",
            ],

            ["[정책차감/보정]", ""],
            ["  출근 보정 절사", totalLate > 0 ? `-${totalLate}분` : "0분"],
            ["  근무시간 단위 절사", totalOT > 0 ? `-${totalOT}분` : "0분"],
            ["  퇴근 보정 절사", totalEarly > 0 ? `-${totalEarly}분` : "0분"],
            ["  외출 절사", totalOuting > 0 ? `-${totalOuting}분` : "0분"],

            ["인정근무", fmtMinutes(correctedRecognized)],
            ["  정규근무시간", fmtMinutes((emp as any).displayRegularMinutes ?? totalRegular)],
            ["  연장근무시간", fmtMinutes((emp as any).displayOvertimeMinutes ?? totalOvertime)],
            ["  야간근무시간", fmtMinutes((emp as any).displayNightWorkMinutes ?? totalNight)],
["  공휴일 유급인정시간", fmtMinutes(totalPaidPublicHolidayMinutes)],
["  휴일근로(8h이내)", fmtMinutes(displayHoliday8h)],
["  휴일근로(8h초과)", fmtMinutes(displayHolidayOver8h)],
["  야간교대근무시간", fmtMinutes((emp as any).displayNightShiftWorkMinutes ?? totalNightShift)],

            ...(totalHolidayNightShift > 0
              ? [
                  ["    ├ 비휴일 야간교대", fmtMinutes(nonHolidayNightShift)],
                  ["    └ 휴일 야간교대", fmtMinutes(totalHolidayNightShift)],
                  ...(totalHolidayNightShiftTier1 > 0
                    ? [["      ├ 휴일1단계", fmtMinutes(totalHolidayNightShiftTier1)]]
                    : []),
                  ...(totalHolidayNightShiftTier2 > 0
                    ? [["      ├ 휴일2단계", fmtMinutes(totalHolidayNightShiftTier2)]]
                    : []),
                  ...(totalHolidayNightShiftTier3 > 0
                    ? [["      ├ 휴일3단계", fmtMinutes(totalHolidayNightShiftTier3)]]
                    : []),
                  ...(totalHolidayNightShiftTier4 > 0
                    ? [["      └ 휴일4단계", fmtMinutes(totalHolidayNightShiftTier4)]]
                    : []),
                ]
              : [
                  ...(totalTier1 > 0 ? [["    ├ 1단계(정규+비야간)", fmtMinutes(totalTier1)]] : []),
                  ...(totalTier2 > 0 ? [["    ├ 2단계(정규+야간)", fmtMinutes(totalTier2)]] : []),
                  ...(totalTier3 > 0 ? [["    ├ 3단계(연장+야간)", fmtMinutes(totalTier3)]] : []),
                  ...(totalTier4 > 0 ? [["    └ 4단계(연장+비야간)", fmtMinutes(totalTier4)]] : []),
                ]),
          ];

          summaryData.forEach(([label, value]) => {
            const row = sheet.addRow([label, "", "", "", value]);
            sheet.mergeCells(row.number, 1, row.number, 4);

            if (label === "인정근무" || label === "[근태 정보]" || label === "[정책차감/보정]") {
              row.font = { bold: true };
            }

            if (label === "인정근무") {
              row.getCell(5).font = { bold: true, color: { argb: "FF2563EB" } };
            }
          });
        }

        sheet.eachRow((row) => {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const label = viewType === "monthly" ? selectedMonth : `${dateRange.start}_${dateRange.end}`;
      a.download = `상세근태기록_${label}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${targetEmployees.length}명의 상세 근태기록이 다운로드되었습니다`);
    } catch (error) {
      console.error("Detail Excel download error:", error);
      toast.error("상세 근태기록 다운로드 중 오류가 발생했습니다");
    }
  };

  const handleCalculatePayroll = async () => {
    if (selectedEmployeeIds.length === 0) {
      toast.error("급여 계산할 직원을 선택해주세요.");
      return;
    }

    const month = viewType === "monthly" ? selectedMonth : startDate.slice(0, 7);

    setIsCalculating(true);
    try {
      if (dbEmployees.length > 0) {
        await calculatePayroll(selectedEmployeeIds);
      } else {
        calculatePayrollFromAttendance(month, selectedEmployeeIds, employees);
      }

      setPayrollDialogOpen(false);
      toast.success(`${month} 급여계산이 완료되었습니다`, {
        description: `${selectedEmployeeIds.length}명의 급여가 계산되었습니다. 급여관리 탭에서 결과를 확인하세요.`,
      });
    } catch (error) {
      console.error("Payroll calculation failed:", error);
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        <Select value={viewType} onValueChange={(v) => setViewType(v as "monthly" | "period")}>
          <SelectTrigger className="w-32">
            <Calendar className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">월별 조회</SelectItem>
            <SelectItem value="period">기간 조회</SelectItem>
          </SelectContent>
        </Select>

        {viewType === "monthly" ? (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => {
                const [y, m] = selectedMonth.split("-").map(Number);
                const d = new Date(y, m - 2, 1);
                setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-44"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => {
                const [y, m] = selectedMonth.split("-").map(Number);
                const d = new Date(y, m, 1);
                setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
            <span className="text-muted-foreground">~</span>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <FilterSidebar
          employees={employees.map((e) => ({
            id: e.id,
            department: e.department,
            employment_type: e.employmentType,
            pay_type: e.payType,
            job_category: dbEmployees.find((d) => d.id === e.id)?.job_category || "office",
          }))}
          selectedDepartment={selectedDepartment}
          onDepartmentChange={setSelectedDepartment}
          selectedEmploymentType={selectedEmploymentType}
          onEmploymentTypeChange={setSelectedEmploymentType}
          selectedPayType={selectedPayType}
          onPayTypeChange={setSelectedPayType}
          selectedJobCategory={selectedJobCategory}
          onJobCategoryChange={setSelectedJobCategory}
        />

        <div className="flex-1 space-y-4 min-w-0">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">평균 출근율</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallStats.avgAttendanceRate}%</div>
              </CardContent>
            </Card>
            <Card className="status-green">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium opacity-80">총 출근</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallStats.totalPresent}일</div>
              </CardContent>
            </Card>
            <Card className="status-yellow">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium opacity-80">총 지각</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallStats.totalLate}일</div>
              </CardContent>
            </Card>
            <Card className="status-red">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium opacity-80">총 결근</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallStats.totalAbsent}일</div>
              </CardContent>
            </Card>
            <Card className="status-purple">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium opacity-80">총 휴가</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallStats.totalLeave}일</div>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-lg border bg-card">
            <div className="p-4 border-b flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-muted-foreground" />
                <h3 className="font-semibold">직원별 근태 현황</h3>
                <Badge variant="secondary">{employeeSummary.length}명</Badge>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="w-56">
                    <EmployeeCombobox
                      employees={dbEmployees.length > 0 ? dbEmployees : []}
                      value=""
                      onValueChange={(empId) => {
                        setHighlightedEmployeeId(empId);
                        setTimeout(() => setHighlightedEmployeeId(null), 5000);
                        const el = document.getElementById(`summary-row-${empId}`);
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      placeholder="직원 검색..."
                    />
                  </div>
                </div>

                <Button variant="default" size="sm" onClick={handleOpenPayrollDialog}>
                  <Calculator className="w-4 h-4 mr-2" />
                  급여계산
                </Button>
                <Button variant="outline" size="sm" onClick={handleDetailExcelDownload}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  {checkedSummaryIds.length > 0 ? `선택 ${checkedSummaryIds.length}명 상세기록` : "상세근태기록"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExcelDownload}>
                  <Download className="w-4 h-4 mr-2" />
                  {checkedSummaryIds.length > 0 ? `선택 ${checkedSummaryIds.length}명 엑셀` : "엑셀 다운로드"}
                </Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={employeeSummary.length > 0 && checkedSummaryIds.length === employeeSummary.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setCheckedSummaryIds(employeeSummary.map((e) => e.id));
                        } else {
                          setCheckedSummaryIds([]);
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>사원번호</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>직종</TableHead>
                  <TableHead>급여유형</TableHead>
                  <TableHead>부서</TableHead>
                  <TableHead className="text-center">출근</TableHead>
                  <TableHead className="text-center">지각</TableHead>
                  <TableHead className="text-center">결근</TableHead>
                  <TableHead className="text-center">휴가</TableHead>
                  <TableHead className="text-center">총 근무시간</TableHead>
                  <TableHead className="text-center">출근율</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {groupedSummary.length > 0 ? (
                  groupedSummary.map((group) => {
                    const groupTotalMinutes = group.items.reduce((s, e) => s + e.totalMinutes, 0);
                    const groupHrs = Math.floor(groupTotalMinutes / 60);
                    const groupMins = groupTotalMinutes % 60;

                    return (
                      <React.Fragment key={`grp-${group.department}`}>
                        <DepartmentGroupHeader
                          department={group.department}
                          count={group.items.length}
                          summary={`총 근무: ${groupHrs}시간 ${groupMins}분`}
                          isExpanded={!collapsedDepts.has(group.department)}
                          onToggle={() => toggleCollapseDept(group.department)}
                          colSpan={COL_SPAN}
                        />
                        {!collapsedDepts.has(group.department) &&
                          group.items.map((emp: any) => (
                            <TableRow
                              key={emp.id}
                              id={`summary-row-${emp.id}`}
                              className={cn("cursor-pointer hover:bg-muted/50 transition-colors")}
                              data-highlighted={highlightedEmployeeId === emp.id || undefined}
                              onClick={() => {
                                setSelectedEmployee(emp);
                                setDetailOpen(true);
                              }}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={checkedSummaryIds.includes(emp.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setCheckedSummaryIds((prev) => [...prev, emp.id]);
                                    } else {
                                      setCheckedSummaryIds((prev) => prev.filter((id) => id !== emp.id));
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </TableCell>
                              <TableCell className="font-medium">{emp.employeeNumber}</TableCell>
                              <TableCell>{emp.name}</TableCell>
                              <TableCell>
                                {(() => {
                                  const dbEmp = dbEmployees.find((e) => e.id === emp.id);
                                  const jobCat = dbEmp?.job_category;
                                  return (
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        "text-xs font-normal",
                                        jobCat === "production"
                                          ? "bg-amber-50 text-amber-700 border-amber-200"
                                          : "bg-slate-50 text-slate-700 border-slate-200",
                                      )}
                                    >
                                      {jobCat === "production" ? "생산직" : "사무직"}
                                    </Badge>
                                  );
                                })()}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-medium">
                                  {emp.payType === "monthly" ? "월급" : emp.payType === "daily" ? "일급" : "시급"}
                                </Badge>
                              </TableCell>
                              <TableCell>{emp.department}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary" className="status-green">
                                  {emp.presentDays}일
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary" className={emp.lateDays > 0 ? "status-yellow" : ""}>
                                  {emp.lateDays}일
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary" className={emp.absentDays > 0 ? "status-red" : ""}>
                                  {emp.absentDays}일
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary" className={emp.leaveDays > 0 ? "status-purple" : ""}>
                                  {emp.leaveDays}일
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <span className="font-medium">{emp.totalWorkTime}</span>
                                  {emp.totalMinutes > 0 && (
                                    <HoverCard openDelay={200} closeDelay={100}>
                                      <HoverCardTrigger asChild>
                                        <button
                                          className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                                          aria-label="근무시간 상세"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Info className="w-3.5 h-3.5" />
                                        </button>
                                      </HoverCardTrigger>
                                      <HoverCardContent
                                        className="w-64 text-sm"
                                        side="top"
                                        align="start"
                                        avoidCollisions={true}
                                        collisionPadding={16}
                                      >
                                        <div className="space-y-2">
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">체류시간</span>
                                            <span className="font-medium">
                                              {Math.floor(emp.totalStayMinutes / 60)}시간 {emp.totalStayMinutes % 60}분
                                            </span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">휴게시간</span>
                                            <span className="font-medium">-{emp.totalBreakMinutes}분</span>
                                          </div>

                                          <div className="text-muted-foreground text-xs font-medium mb-1">
                                            근태 정보
                                          </div>
                                          <div className="flex justify-between pl-2">
                                            <span className="text-muted-foreground text-xs">지각시간</span>
                                            <span className="text-xs text-yellow-600 font-medium">
                                              {emp.totalActualLateMinutes > 0
                                                ? `+${emp.totalActualLateMinutes}분`
                                                : "0분"}
                                            </span>
                                          </div>
                                          <div className="flex justify-between pl-2">
                                            <span className="text-muted-foreground text-xs">조퇴시간</span>
                                            <span className="text-xs text-yellow-600 font-medium">
                                              {emp.totalActualEarlyLeaveMinutes > 0
                                                ? `+${emp.totalActualEarlyLeaveMinutes}분`
                                                : "0분"}
                                            </span>
                                          </div>

                                          <div className="text-muted-foreground text-xs font-medium mb-1">
                                            정책차감/보정
                                          </div>
                                          <div className="flex justify-between pl-2">
                                            <span className="text-muted-foreground text-xs">출근 보정 절사</span>
                                            <span className="text-xs">
                                              {emp.totalLateTruncation > 0 ? `-${emp.totalLateTruncation}분` : "0분"}
                                            </span>
                                          </div>
                                          <div className="flex justify-between pl-2">
                                            <span className="text-muted-foreground text-xs">근무시간 단위 절사</span>
                                            <span className="text-xs">
                                              {emp.totalOvertimeTruncation > 0
                                                ? `-${emp.totalOvertimeTruncation}분`
                                                : "0분"}
                                            </span>
                                          </div>
                                          <div className="flex justify-between pl-2">
                                            <span className="text-muted-foreground text-xs">퇴근 보정 절사</span>
                                            <span className="text-xs">
                                              {emp.totalEarlyLeaveTruncation > 0
                                                ? `-${emp.totalEarlyLeaveTruncation}분`
                                                : "0분"}
                                            </span>
                                          </div>
                                          <div className="flex justify-between pl-2">
                                            <span className="text-muted-foreground text-xs">외출 절사</span>
                                            <span className="text-xs">
                                              {emp.totalOutingTruncation > 0
                                                ? `-${emp.totalOutingTruncation}분`
                                                : "0분"}
                                            </span>
                                          </div>

                                          <div className="border-t pt-2 flex justify-between">
                                            <span className="font-semibold">인정근무</span>
                                            <span className="font-semibold text-primary">{emp.totalWorkTime}</span>
                                          </div>

                                          <div className="pl-2 space-y-1">
                                            <div className="flex justify-between">
                                              <span className="text-muted-foreground text-xs">정규근무시간</span>
                                              <span className="text-xs">
                                                {Math.floor(emp.displayRegularMinutes / 60)}시간{" "}
                                                {emp.displayRegularMinutes % 60}분
                                              </span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span className="text-muted-foreground text-xs">연장근무시간</span>
                                              <span className="text-xs">
                                                {Math.floor(emp.displayOvertimeMinutes / 60)}시간{" "}
                                                {emp.displayOvertimeMinutes % 60}분
                                              </span>
                                            </div>
                                            <div className="flex justify-between">
  <span className="text-muted-foreground text-xs">야간근무시간</span>
  <span className="text-xs">
    {Math.floor(emp.displayNightWorkMinutes / 60)}시간{" "}
    {emp.displayNightWorkMinutes % 60}분
  </span>
</div>

<div className="flex justify-between">
  <span className="text-muted-foreground text-xs">공휴일 유급인정시간</span>
  <span className="text-xs">
    {Math.floor((emp.totalPaidPublicHolidayMinutes || 0) / 60)}시간{" "}
    {(emp.totalPaidPublicHolidayMinutes || 0) % 60}분
  </span>
</div>


{(emp.displayHoliday8hMinutes > 0 ||
  emp.displayHolidayOver8hMinutes > 0) && (
                                              <>
                                                <div className="flex justify-between">
                                                  <span className="text-muted-foreground text-xs">
                                                    휴일근로(8h이내)
                                                  </span>
                                                  <span className="text-xs">
                                                    {Math.floor(emp.displayHoliday8hMinutes / 60)}시간{" "}
                                                    {emp.displayHoliday8hMinutes % 60}분
                                                  </span>
                                                </div>
                                                <div className="flex justify-between">
                                                  <span className="text-muted-foreground text-xs">
                                                    휴일근로(8h초과)
                                                  </span>
                                                  <span className="text-xs">
                                                    {Math.floor(emp.displayHolidayOver8hMinutes / 60)}시간{" "}
                                                    {emp.displayHolidayOver8hMinutes % 60}분
                                                  </span>
                                                </div>
                                              </>
                                            )}

                                            <div className="flex justify-between">
                                              <span className="text-muted-foreground text-xs">야간교대근무시간</span>
                                              <span className="text-xs">
                                                {Math.floor(emp.displayNightShiftWorkMinutes / 60)}시간{" "}
                                                {emp.displayNightShiftWorkMinutes % 60}분
                                              </span>
                                            </div>

                                            {emp.holidayNightShiftMinutes > 0 && (
                                              <div className="pl-4 space-y-0.5">
                                                <div className="flex justify-between">
                                                  <span className="text-muted-foreground/70 text-[11px]">
                                                    ├ 비휴일 야간교대
                                                  </span>
                                                  <span className="text-[11px] text-muted-foreground">
                                                    {Math.floor(emp.nonHolidayNightShiftMinutes / 60)}시간{" "}
                                                    {emp.nonHolidayNightShiftMinutes % 60}분
                                                  </span>
                                                </div>
                                                <div className="flex justify-between">
                                                  <span className="text-muted-foreground/70 text-[11px]">
                                                    └ 휴일 야간교대
                                                  </span>
                                                  <span className="text-[11px] text-muted-foreground">
                                                    {Math.floor(emp.holidayNightShiftMinutes / 60)}시간{" "}
                                                    {emp.holidayNightShiftMinutes % 60}분
                                                  </span>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </HoverCardContent>
                                    </HoverCard>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant="secondary"
                                  className={cn("font-bold", getAttendanceRateColor(emp.attendanceRate))}
                                >
                                  {emp.attendanceRate}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={COL_SPAN} className="text-center py-8 text-muted-foreground">
                      해당 기간의 근태 기록이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {checkedSummaryIds.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-t rounded-b-lg">
                <span className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{checkedSummaryIds.length}명</span> /{" "}
                  {employeeSummary.length}명 선택됨
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCheckedSummaryIds([])}>
                    선택 해제
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExcelDownload}>
                    <Download className="w-3 h-3 mr-1" />
                    선택 직원 엑셀 다운로드
                  </Button>
                </div>
              </div>
            )}
          </div>

          <EmployeeAttendanceDetail
            employee={selectedEmployee}
            open={detailOpen}
            onOpenChange={setDetailOpen}
            startDate={dateRange.start}
            endDate={dateRange.end}
          />

          <Dialog open={payrollDialogOpen} onOpenChange={setPayrollDialogOpen}>
            <DialogContent className="max-w-md max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>급여계산 대상 선택</DialogTitle>
                <DialogDescription>급여를 계산할 직원을 선택하세요.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant={payTypeFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePayTypeFilterChange("all")}
                  >
                    전체 ({activeEmployees.length})
                  </Button>
                  <Button
                    variant={payTypeFilter === "monthly" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePayTypeFilterChange("monthly")}
                  >
                    월급 ({activeEmployees.filter((e) => e.payType === "monthly").length})
                  </Button>
                  <Button
                    variant={payTypeFilter === "daily" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePayTypeFilterChange("daily")}
                  >
                    일급 ({activeEmployees.filter((e) => e.payType === "daily").length})
                  </Button>
                  <Button
                    variant={payTypeFilter === "hourly" ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePayTypeFilterChange("hourly")}
                  >
                    시급 ({activeEmployees.filter((e) => e.payType === "hourly").length})
                  </Button>
                </div>

                <div className="flex items-center justify-between pb-2 border-b">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="select-all"
                      checked={
                        filteredEmployees.length > 0 &&
                        filteredEmployees.every((e) => selectedEmployeeIds.includes(e.id))
                      }
                      onCheckedChange={handleSelectAll}
                    />
                    <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                      {payTypeFilter === "all"
                        ? "전체 선택"
                        : `${payTypeFilter === "monthly" ? "월급" : payTypeFilter === "daily" ? "일급" : "시급"} 전체 선택`}{" "}
                      ({filteredEmployees.length}명)
                    </label>
                  </div>
                  <Badge variant="secondary">{selectedEmployeeIds.length}명 선택됨</Badge>
                </div>

                <div className="max-h-[300px] overflow-y-auto space-y-2">
                  {filteredEmployees.map((emp) => (
                    <div key={emp.id} className="flex items-center space-x-2 p-2 rounded hover:bg-muted">
                      <Checkbox
                        id={`emp-${emp.id}`}
                        checked={selectedEmployeeIds.includes(emp.id)}
                        onCheckedChange={(checked) => handleSelectEmployee(emp.id, checked as boolean)}
                      />
                      <label htmlFor={`emp-${emp.id}`} className="flex-1 text-sm cursor-pointer">
                        <span className="font-medium">{emp.name}</span>
                        <Badge variant="outline" className="text-xs font-normal ml-1">
                          {emp.employmentType === "regular"
                            ? "정규직"
                            : emp.employmentType === "contract"
                              ? "계약직"
                              : "일용직"}
                        </Badge>
                        <Badge variant="secondary" className="text-xs font-normal ml-1">
                          {emp.payType === "monthly" ? "월급" : emp.payType === "daily" ? "일급" : "시급"}
                        </Badge>
                        <span className="text-muted-foreground ml-2">({emp.employeeNumber})</span>
                        <span className="text-muted-foreground ml-2">- {emp.department}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setPayrollDialogOpen(false)}>
                  취소
                </Button>
                <Button onClick={handleCalculatePayroll} disabled={selectedEmployeeIds.length === 0 || isCalculating}>
                  {isCalculating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Calculator className="w-4 h-4 mr-2" />
                  )}
                  {isCalculating ? "계산 중..." : `${selectedEmployeeIds.length}명 급여계산`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
