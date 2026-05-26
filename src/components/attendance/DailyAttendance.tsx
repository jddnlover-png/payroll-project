import { useState, useEffect, useMemo } from "react";
import { useEmployeeStore } from "@/store/employeeStore";
import { useEmployees, Employee } from "@/hooks/useEmployees";
import { useAttendance, ShiftType } from "@/hooks/useAttendance";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { useLeaveRecords } from "@/hooks/useLeaveRecords";
import { formatWorkHours } from "@/utils/workHoursCalculation";
import { calculateSingleAttendance } from "@/utils/attendanceCalculation";
import { FilterSidebar } from "@/components/filters/FilterSidebar";
import { DepartmentGroupHeader } from "@/components/filters/DepartmentGroupHeader";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  Calendar,
  Filter,
  UserCheck,
  UserX,
  AlertCircle,
  Palmtree,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Info,
  Search,
  X,
  Phone,
  Mail,
  Building2,
  CreditCard,
  CalendarDays,
  Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AttendanceEditDialog } from "./AttendanceEditDialog";
import { EmployeeCombobox } from "@/components/employee/EmployeeCombobox";

const statusConfig = {
  present: { label: "출근", class: "status-green" },
  late: { label: "지각", class: "status-yellow" },
  absent: { label: "결근", class: "status-red" },
  unrecorded: { label: "미기록", class: "bg-muted text-muted-foreground" },
  leave: { label: "휴가", class: "status-purple" },
  half_day: { label: "반차", class: "status-blue" },
  annual: { label: "연차", class: "status-purple" },
  sick: { label: "병가", class: "status-red" },
  personal: { label: "경조사", class: "status-purple" },
  other: { label: "기타휴가", class: "status-purple" },
  paid_holiday: { label: "유급휴일", class: "status-purple" },
};

export function DailyAttendance() {
  const {
    employees: storeEmployees,
    attendance: storeAttendance,
    checkIn: storeCheckIn,
    checkOut: storeCheckOut,
  } = useEmployeeStore();
  const { employees: dbEmployees } = useEmployees();
  const { leaveRecords } = useLeaveRecords();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedEmploymentType, setSelectedEmploymentType] = useState<string | null>(null);
  const [selectedPayType, setSelectedPayType] = useState<string | null>(null);
  const [selectedJobCategory, setSelectedJobCategory] = useState<string | null>(null);
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [highlightedEmployeeId, setHighlightedEmployeeId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [activeStatFilter, setActiveStatFilter] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // DB 근태 데이터 조회
  const {
    attendance: dbAttendance,
    isLoading,
    checkIn: dbCheckIn,
    checkOut: dbCheckOut,
    bulkUpdateStatus,
    updateShiftType,
  } = useAttendance(selectedDate);
  const { settings, loading: settingsLoading } = useOrganizationSettings();
    const [publicHolidayMap, setPublicHolidayMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const fetchPublicHoliday = async () => {
      const { data, error } = await (supabase as any)
  .from("public_holidays")
  .select("holiday_date, holiday_name, is_holiday")
  .eq("holiday_date", selectedDate)
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

    fetchPublicHoliday();
  }, [selectedDate]);

  // 선택된 날짜에 해당하는 휴가 기록 조회
  const leaveRecordsByEmployee = useMemo(() => {
    const map = new Map<string, { leave_type: string; status: string }>();
    leaveRecords.forEach((record) => {
      if (record.status === "approved") {
        const start = new Date(record.start_date);
        const end = new Date(record.end_date);
        const selected = new Date(selectedDate);
        if (selected >= start && selected <= end) {
          map.set(record.employee_id, {
            leave_type: record.leave_type,
            status: record.status,
          });
        }
      }
    });
    return map;
  }, [leaveRecords, selectedDate]);

  // DB 직원이 있으면 DB 사용, 없으면 스토어 사용
  const employees = useMemo(() => {
    if (dbEmployees.length > 0) {
      return dbEmployees.map((emp) => ({
        id: emp.id,
        employeeNumber: emp.employee_number,
        name: emp.name,
        department: emp.department || "",
        position: emp.position || "",
        payType: emp.pay_type,
        employmentType: emp.employment_type,
        status: emp.is_active ? "active" : "inactive",
      }));
    }
    return storeEmployees;
  }, [dbEmployees, storeEmployees]);

  // 일일 근태 테이블은 '직원 목록'이 기준.
  const attendance = useMemo(() => {
    const hasDbEmployees = dbEmployees.length > 0;

    if (!hasDbEmployees) {
      return storeAttendance.filter((att) => att.date === selectedDate);
    }

    const byEmployeeId = new Map(dbAttendance.map((att) => [att.employee_id, att] as const));

    return employees.map((emp: any) => {
      const att = byEmployeeId.get(emp.id);
      const leaveRecord = leaveRecordsByEmployee.get(emp.id);

      let status: keyof typeof statusConfig = (att?.status as keyof typeof statusConfig) ?? "unrecorded";
      if (leaveRecord) {
        status = leaveRecord.leave_type as keyof typeof statusConfig;
      }

      return {
        id: att?.id ?? `${emp.id}-${selectedDate}`,
        employeeId: emp.id,
        employeeNumber: emp.employeeNumber,
        employeeName: emp.name,
        department: emp.department,
        date: selectedDate,
        checkIn: att?.check_in ? new Date(att.check_in).toTimeString().slice(0, 5) : null,
        checkOut: att?.check_out ? new Date(att.check_out).toTimeString().slice(0, 5) : null,
        rawCheckIn: att?.check_in || null,
        rawCheckOut: att?.check_out || null,
        breakMinutes: att?.break_minutes ?? 0,
        status,
        shiftType: (att?.work_type as ShiftType) || null,
        hasDbRecord: !!att,
      };
    });
  }, [dbEmployees.length, dbAttendance, employees, selectedDate, storeAttendance, leaveRecordsByEmployee]);

  const filteredAttendance = useMemo(() => {
    let result = [...attendance];

    if (selectedDepartment) {
      if (selectedDepartment === "미분류") {
        result = result.filter((att) => !att.department);
      } else {
        result = result.filter((att) => att.department === selectedDepartment);
      }
    }

    if (selectedEmploymentType) {
      result = result.filter((att) => {
        const emp = employees.find((e: any) => e.id === att.employeeId);
        return emp?.employmentType === selectedEmploymentType;
      });
    }

    if (selectedPayType) {
      result = result.filter((att) => {
        const emp = employees.find((e: any) => e.id === att.employeeId);
        return emp?.payType === selectedPayType;
      });
    }

    if (selectedJobCategory) {
      result = result.filter((att) => {
        const emp = dbEmployees.find((e: any) => e.id === att.employeeId);
        return (emp?.job_category || "office") === selectedJobCategory;
      });
    }

    return result;
  }, [
    attendance,
    selectedDepartment,
    selectedEmploymentType,
    selectedPayType,
    selectedJobCategory,
    employees,
    dbEmployees,
  ]);

  const groupedAttendance = useMemo(() => {
    const map = new Map<string, typeof filteredAttendance>();
    filteredAttendance.forEach((att) => {
      const dept = att.department || "미분류";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(att);
    });
    return Array.from(map.entries()).map(([department, items]) => ({ department, items }));
  }, [filteredAttendance]);

  const toggleCollapseDept = (dept: string) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };
  const isScheduledWorkday = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`);
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
  };

  const getPaidHolidayMinutes = () => {
    return Math.round((settings.standard_work_hours || 8) * 60);
  };

  const isPaidPublicHolidayRecord = (rec: any) => {
    const hasActualWork = !!(rec.rawCheckIn && rec.rawCheckOut);
    const isHoliday = publicHolidayMap.has(rec.date || selectedDate);

    return (
      settings.apply_public_holiday &&
      isHoliday &&
      isScheduledWorkday(rec.date || selectedDate) &&
      !hasActualWork
    );
  };
  const getKstMinutes = (value: string | null) => {
    if (!value) return null;
    const d = new Date(value);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.getUTCHours() * 60 + kst.getUTCMinutes();
  };

  const getActualLateMinutes = (rec: any) => {
    if (!rec.rawCheckIn) return 0;

    const shiftType: ShiftType = rec.shiftType || "day";
    const isNight = shiftType === "night";
    const checkInMin = getKstMinutes(rec.rawCheckIn);
    if (checkInMin === null) return 0;

    const startTime = isNight ? settings.shift_tier1_start : settings.work_start_time;
    const lateThreshold = isNight ? settings.shift_late_threshold : settings.late_threshold;

    const [h, m] = startTime.split(":").map(Number);
    const startMin = h * 60 + m;

    return checkInMin > startMin + lateThreshold ? checkInMin - startMin : 0;
  };

  const getActualEarlyLeaveMinutes = (rec: any) => {
    if (!rec.rawCheckOut) return 0;

    const shiftType: ShiftType = rec.shiftType || "day";
    const isNight = shiftType === "night";
    const checkOutMin = getKstMinutes(rec.rawCheckOut);
    if (checkOutMin === null) return 0;

    const endTime = isNight ? settings.shift_tier3_end : settings.work_end_time;
    const [h, m] = endTime.split(":").map(Number);
    const endMin = h * 60 + m;

    if (!isNight && checkOutMin < 720) return 0;

    return checkOutMin < endMin ? endMin - checkOutMin : 0;
  };

    const getDisplayStatus = (rec: any, hoverData?: any) => {
    if (isPaidPublicHolidayRecord(rec)) return "paid_holiday";

    if (rec.status !== "present") return rec.status;

    const lateMinutes = getActualLateMinutes(rec);
    if (lateMinutes > 0) return "late";

    const shiftType: ShiftType = rec.shiftType || "day";
    const isNight = shiftType === "night";

    if (!isNight) {
      const earlyLeaveMinutes = getActualEarlyLeaveMinutes(rec);
      if (earlyLeaveMinutes > 0) return "early_leave";
    }

    return rec.status;
  };

  const statusConfigWithEarlyLeave = {
    ...statusConfig,
    early_leave: { label: "조퇴", class: "status-yellow" },
  };

  const stats = {
  present: filteredAttendance.filter((a) => getDisplayStatus(a) === "present").length,
  late: filteredAttendance.filter((a) => getDisplayStatus(a) === "late").length,
  absent: filteredAttendance.filter((a) => getDisplayStatus(a) === "absent").length,
  unrecorded: filteredAttendance.filter((a) => getDisplayStatus(a) === "unrecorded").length,
  leave: filteredAttendance.filter((a) => getDisplayStatus(a) === "leave").length,
  paid_holiday: filteredAttendance.filter((a) => getDisplayStatus(a) === "paid_holiday").length,
};

  const isAllSelected = filteredAttendance.length > 0 && selectedIds.length === filteredAttendance.length;
  const isSomeSelected = selectedIds.length > 0 && selectedIds.length < filteredAttendance.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredAttendance.map((att) => att.employeeId));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (employeeId: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, employeeId]);
    } else {
      setSelectedIds(selectedIds.filter((id) => id !== employeeId));
    }
  };

  const handleBulkCheckIn = () => {
    const eligibleIds = selectedIds.filter((id) => {
      const record = filteredAttendance.find((att) => att.employeeId === id);
      return record && !record.checkIn;
    });

    if (eligibleIds.length === 0) {
      toast.error("출근 처리할 직원이 없습니다.");
      return;
    }

    if (dbEmployees.length > 0) {
      eligibleIds.forEach((id) => dbCheckIn.mutate(id));
    } else {
      eligibleIds.forEach((id) => storeCheckIn(id));
    }
    toast.success(`${eligibleIds.length}명의 출근이 처리되었습니다.`);
    setSelectedIds([]);
  };

  const handleBulkCheckOut = () => {
    const eligibleIds = selectedIds.filter((id) => {
      const record = filteredAttendance.find((att) => att.employeeId === id);
      return record && record.checkIn && !record.checkOut;
    });

    if (eligibleIds.length === 0) {
      toast.error("퇴근 처리할 직원이 없습니다.");
      return;
    }

    if (dbEmployees.length > 0) {
      eligibleIds.forEach((id) => dbCheckOut.mutate(id));
    } else {
      eligibleIds.forEach((id) => storeCheckOut(id));
    }
    toast.success(`${eligibleIds.length}명의 퇴근이 처리되었습니다.`);
    setSelectedIds([]);
  };

  const handleBulkMarkAbsent = () => {
    const eligibleIds = selectedIds.filter((id) => {
      const record = filteredAttendance.find((att) => att.employeeId === id);
      return record && record.status !== "absent";
    });

    if (eligibleIds.length === 0) {
      toast.error("결근 처리할 직원이 없습니다.");
      return;
    }

    if (dbEmployees.length > 0) {
      bulkUpdateStatus.mutate({ employeeIds: eligibleIds, status: "absent" });
    }
    toast.success(`${eligibleIds.length}명이 결근 처리되었습니다.`);
    setSelectedIds([]);
  };

  const handleBulkMarkLeave = () => {
    const unrecordedIds = selectedIds.filter((id) => {
      const record = filteredAttendance.find((att) => att.employeeId === id);
      return record && record.status === "unrecorded";
    });

    if (unrecordedIds.length === 0) {
      toast.error("휴가 처리할 미기록 직원이 없습니다.");
      return;
    }

    if (dbEmployees.length > 0) {
      bulkUpdateStatus.mutate({ employeeIds: unrecordedIds, status: "leave" });
    }
    setSelectedIds([]);
  };

  const handleCheckIn = (employeeId: string) => {
    if (dbEmployees.length > 0) {
      dbCheckIn.mutate(employeeId);
    } else {
      storeCheckIn(employeeId);
    }
  };

  const handleCheckOut = async (employeeId: string) => {
    if (dbEmployees.length > 0) {
      dbCheckOut.mutate(employeeId);
    } else {
      storeCheckOut(employeeId);
    }
  };

  if (settingsLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">설정 로딩 중...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() - 1);
              setSelectedDate(d.toISOString().split("T")[0]);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="pl-10 w-44"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() + 1);
              setSelectedDate(d.toISOString().split("T")[0]);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* 직원 검색 콤보박스 */}
        <div className="flex items-center gap-1">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="w-64">
            <EmployeeCombobox
              employees={dbEmployees.length > 0 ? dbEmployees : []}
              value=""
              onValueChange={(empId) => {
                setHighlightedEmployeeId(empId);
                setTimeout(() => setHighlightedEmployeeId(null), 5000);
                const el = document.getElementById(`att-row-${empId}`);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
              placeholder="직원 검색..."
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* 부서/고용형태 사이드바 필터 */}
        <FilterSidebar
          employees={employees.map((e: any) => ({
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

        {/* 메인 컨텐츠 */}
        <div className="flex-1 space-y-4 min-w-0">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {[
  { key: "present", label: "출근", value: stats.present, cls: "status-green" },
  { key: "late", label: "지각", value: stats.late, cls: "status-yellow" },
  { key: "absent", label: "결근", value: stats.absent, cls: "status-red" },
  { key: "unrecorded", label: "미기록", value: stats.unrecorded, cls: "bg-muted text-muted-foreground" },
  { key: "leave", label: "휴가", value: stats.leave, cls: "status-purple" },
  { key: "paid_holiday", label: "유급휴일", value: stats.paid_holiday, cls: "status-purple" },
].map((item) => (
              <div
                key={item.key}
                role="button"
                tabIndex={0}
                onClick={() => setActiveStatFilter((prev) => (prev === item.key ? null : item.key))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    setActiveStatFilter((prev) => (prev === item.key ? null : item.key));
                }}
                className={cn(
                  "p-4 rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
                  item.cls,
                  activeStatFilter === item.key && "ring-2 ring-primary shadow-md scale-[1.02]",
                )}
              >
                <p className="text-sm opacity-80">{item.label}</p>
                <p className="text-2xl font-bold">{item.value}명</p>
              </div>
            ))}
          </div>

          {activeStatFilter &&
            (() => {
              const statFilteredEmps = filteredAttendance
                .filter((a) => getDisplayStatus(a) === activeStatFilter)
                .map((a) => {
                  const emp = dbEmployees.find((e) => e.id === a.employeeId);
                  return {
                    id: a.employeeId,
                    employee_number: a.employeeNumber,
                    name: a.employeeName,
                    department: a.department || "-",
                    position: emp?.position || "-",
                  };
                });
              const filterLabel: Record<string, string> = {
                present: "출근",
                late: "지각",
                absent: "결근",
                unrecorded: "미기록",
                leave: "휴가",
              };
              return (
                <div className="rounded-lg border bg-card animate-fade-in">
                  <div className="p-4 border-b flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {filterLabel[activeStatFilter]} 명단 ({statFilteredEmps.length}명)
                    </h3>
                    <button
                      onClick={() => setActiveStatFilter(null)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
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
                      {statFilteredEmps.length > 0 ? (
                        statFilteredEmps.map((emp) => (
                          <TableRow
                            key={emp.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => {
                              const full = dbEmployees.find((e) => e.id === emp.id);
                              if (full) setSelectedEmployee(full);
                            }}
                          >
                            <TableCell className="font-medium">{emp.employee_number}</TableCell>
                            <TableCell>{emp.name}</TableCell>
                            <TableCell>{emp.department}</TableCell>
                            <TableCell>{emp.position}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                            해당하는 직원이 없습니다.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              );
            })()}

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium">{selectedIds.length}명 선택됨</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleBulkCheckIn}>
                  <UserCheck className="w-4 h-4 mr-2" />
                  일괄 출근
                </Button>
                <Button size="sm" variant="outline" onClick={handleBulkCheckOut}>
                  <UserX className="w-4 h-4 mr-2" />
                  일괄 퇴근
                </Button>
                <Button size="sm" variant="destructive" onClick={handleBulkMarkAbsent}>
                  <AlertCircle className="w-4 h-4 mr-2" />
                  일괄 결근
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="secondary">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      미기록 일괄 처리
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={handleBulkMarkAbsent}>
                      <AlertCircle className="w-4 h-4 mr-2 text-destructive" />
                      결근 처리
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleBulkMarkLeave}>
                      <Palmtree className="w-4 h-4 mr-2 text-primary" />
                      휴가 처리
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="전체 선택"
                      className={isSomeSelected ? "opacity-50" : ""}
                    />
                  </TableHead>
                  <TableHead>사원번호</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>직종</TableHead>
                  <TableHead>급여유형</TableHead>
                  <TableHead>부서</TableHead>
                  <TableHead>근무조</TableHead>
                  <TableHead>출근시간</TableHead>
                  <TableHead>퇴근시간</TableHead>
                  <TableHead>근무시간</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedAttendance.length > 0 ? (
                  groupedAttendance.map((group) => {
                                        const groupWorkMinutes = group.items.reduce((sum, record) => {
                      const rec = record as any;

                      if (isPaidPublicHolidayRecord(rec)) {
                        return sum + getPaidHolidayMinutes();
                      }

                      if (rec.rawCheckIn && rec.rawCheckOut) {
                        const shiftType: ShiftType = rec.shiftType || "day";
                        const isNight = shiftType === "night";
                        const breakdown = calculateSingleAttendance(
                          rec.rawCheckIn,
                          rec.rawCheckOut,
                          rec.date || selectedDate,
                          rec.breakMinutes || 0,
                          isNight,
                          settings,
                        );
                        return sum + breakdown.recognizedMinutes;
                      }

                      return sum;
                    }, 0);

                    return (
                      <>
                        <DepartmentGroupHeader
                          key={`header-${group.department}`}
                          department={group.department}
                          count={group.items.length}
                          summary={`총 ${formatWorkHours(groupWorkMinutes)}`}
                          isExpanded={!collapsedDepts.has(group.department)}
                          onToggle={() => toggleCollapseDept(group.department)}
                          colSpan={11}
                        />
                        {!collapsedDepts.has(group.department) &&
                          group.items.map((record) => {
                            const rec = record as any;
                                                        let workHours = "-";
                            let hoverData: any = null;

                            if (isPaidPublicHolidayRecord(rec)) {
                              const paidHolidayMinutes = getPaidHolidayMinutes();

                              workHours = `유급 ${formatWorkHours(paidHolidayMinutes)}`;
                              hoverData = {
                                isPaidHolidayOnly: true,
                                paidHolidayMinutes,
                                publicHolidayActualWorkMinutes: 0,
                                recognizedMinutes: paidHolidayMinutes,
                                regularMinutes: 0,
                                overtimeWorkMinutes: 0,
                                nightWorkMinutes: 0,
                                nightShiftWorkMinutes: 0,
                                nightShiftTier1Minutes: 0,
                                nightShiftTier2Minutes: 0,
                                nightShiftTier3Minutes: 0,
                                nightShiftTier4Minutes: 0,
                              };
                            } else if (rec.rawCheckIn && rec.rawCheckOut) {
                              const shiftType: ShiftType = rec.shiftType || "day";
                              const isNight = shiftType === "night";
                              const breakdown = calculateSingleAttendance(
                                rec.rawCheckIn,
                                rec.rawCheckOut,
                                rec.date || selectedDate,
                                rec.breakMinutes || 0,
                                isNight,
                                settings,
                              );

                              workHours = formatWorkHours(breakdown.recognizedMinutes);
                              const isPublicHolidayWork =
  settings.apply_public_holiday &&
  publicHolidayMap.has(rec.date || selectedDate) &&
  isScheduledWorkday(rec.date || selectedDate);

hoverData = {
  ...breakdown,
  isPaidHolidayOnly: false,
  paidHolidayMinutes: isPublicHolidayWork ? getPaidHolidayMinutes() : 0,
  publicHolidayActualWorkMinutes: isPublicHolidayWork ? breakdown.recognizedMinutes : 0,
};
                            }

                            return (
                              <TableRow
                                key={record.id}
                                id={`att-row-${record.employeeId}`}
                                data-highlighted={highlightedEmployeeId === record.employeeId || undefined}
                              >
                                <TableCell>
                                  <Checkbox
                                    checked={selectedIds.includes(record.employeeId)}
                                    onCheckedChange={(checked) => handleSelectOne(record.employeeId, !!checked)}
                                    aria-label={`${record.employeeName} 선택`}
                                  />
                                </TableCell>
                                <TableCell className="font-medium">{record.employeeNumber}</TableCell>
                                <TableCell>{record.employeeName}</TableCell>
                                <TableCell>
                                  {(() => {
                                    const jobCat = dbEmployees.find((e) => e.id === record.employeeId)?.job_category;
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
                                    {employees.find((e) => e.id === record.employeeId)?.payType === "monthly"
                                      ? "월급"
                                      : employees.find((e) => e.id === record.employeeId)?.payType === "daily"
                                        ? "일급"
                                        : "시급"}
                                  </Badge>
                                </TableCell>
                                <TableCell>{record.department}</TableCell>
                                <TableCell>
                                  {rec.hasDbRecord ? (
                                    <Select
                                      value={
                                        rec.shiftType === "day" || rec.shiftType === "night" ? rec.shiftType : undefined
                                      }
                                      onValueChange={(val: ShiftType) => {
                                        if (rec.hasDbRecord) {
                                          updateShiftType.mutate({ id: rec.id, shiftType: val });
                                        }
                                      }}
                                      disabled={!rec.hasDbRecord}
                                    >
                                      <SelectTrigger className="w-20 h-7 text-xs">
                                        <SelectValue
                                          placeholder={
                                            rec.shiftType && rec.shiftType !== "day" && rec.shiftType !== "night"
                                              ? "미분류"
                                              : undefined
                                          }
                                        />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="day">주간조</SelectItem>
                                        <SelectItem value="night">야간조</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </TableCell>
                                <TableCell>{record.checkIn || "-"}</TableCell>
                                <TableCell>{record.checkOut || "-"}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <span>{workHours}</span>
                                    {hoverData && (
                                      <HoverCard openDelay={200} closeDelay={100}>
                                        <HoverCardTrigger asChild>
                                          <button
                                            className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                                            aria-label="근무시간 상세"
                                          >
                                            <Info className="w-3.5 h-3.5" />
                                          </button>
                                        </HoverCardTrigger>
                                        <HoverCardContent className="w-64 text-sm" side="left">
                                          <div className="space-y-2">
                                            <div className="flex justify-between">
                                              <span className="text-muted-foreground">체류시간</span>
                                              <span className="font-medium">
                                                {formatWorkHours(hoverData.stayMinutes)}{" "}
                                                <span className="text-xs text-muted-foreground">
                                                  ({hoverData.actualCheckIn}~{hoverData.actualCheckOut})
                                                </span>
                                              </span>
                                            </div>
                                            <div className="flex justify-between">
                                              <span className="text-muted-foreground">휴게시간</span>
                                              <span className="font-medium">-{hoverData.breakMinutes}분</span>
                                            </div>
                                            {getActualLateMinutes(rec) > 0 && (
                                              <div className="flex justify-between">
                                                <span className="text-muted-foreground">지각시간</span>
                                                <span className="font-medium text-yellow-600">
                                                  +{getActualLateMinutes(rec)}분
                                                </span>
                                              </div>
                                            )}

                                            {(rec.shiftType || "day") !== "night" &&
                                              getActualEarlyLeaveMinutes(rec) > 0 && (
                                                <div className="flex justify-between">
                                                  <span className="text-muted-foreground">조퇴시간</span>
                                                  <span className="font-medium text-yellow-600">
                                                    +{getActualEarlyLeaveMinutes(rec)}분
                                                  </span>
                                                </div>
                                              )}

                                            <div className="text-muted-foreground text-xs font-medium mb-1">
                                              근태 정보
                                            </div>

                                            {getActualLateMinutes(rec) > 0 && (
                                              <div className="flex justify-between pl-2">
                                                <span className="text-muted-foreground text-xs">지각시간</span>
                                                <span className="text-xs text-yellow-600 font-medium">
                                                  +{getActualLateMinutes(rec)}분
                                                </span>
                                              </div>
                                            )}

                                            {getActualEarlyLeaveMinutes(rec) > 0 && (
                                              <div className="flex justify-between pl-2">
                                                <span className="text-muted-foreground text-xs">조퇴시간</span>
                                                <span className="text-xs text-yellow-600 font-medium">
                                                  +{getActualEarlyLeaveMinutes(rec)}분
                                                </span>
                                              </div>
                                            )}

                                            <div className="text-muted-foreground text-xs font-medium mb-1">
                                              정책차감/보정
                                            </div>
                                            <div className="flex justify-between pl-2">
                                              <span className="text-muted-foreground text-xs">출근 보정 절사</span>
                                              <span className="text-xs">
                                                {hoverData.lateTruncation > 0
                                                  ? `-${hoverData.lateTruncation}분`
                                                  : "0분"}
                                              </span>
                                            </div>
                                            <div className="flex justify-between pl-2">
                                              <span className="text-muted-foreground text-xs">근무시간 단위 절사</span>
                                              <span className="text-xs">
                                                {hoverData.overtimeTruncation > 0
                                                  ? `-${hoverData.overtimeTruncation}분`
                                                  : "0분"}
                                              </span>
                                            </div>
                                            <div className="flex justify-between pl-2">
                                              <span className="text-muted-foreground text-xs">퇴근 보정 절사</span>
                                              <span className="text-xs">
                                                {hoverData.earlyLeaveTruncation > 0
                                                  ? `-${hoverData.earlyLeaveTruncation}분`
                                                  : "0분"}
                                              </span>
                                            </div>
                                            <div className="flex justify-between pl-2">
                                              <span className="text-muted-foreground text-xs">외출 절사</span>
                                              <span className="text-xs">
                                                {hoverData.outingTruncation > 0
                                                  ? `-${hoverData.outingTruncation}분`
                                                  : "0분"}
                                              </span>
                                            </div>
                                            <div className="border-t pt-2 flex justify-between">
                                              <span className="font-semibold">인정근무</span>
                                              <span className="font-semibold text-primary">
                                                {formatWorkHours(hoverData.recognizedMinutes)}
                                              </span>
                                            </div>
                                            <div className="flex justify-between pl-2">
                                              <span className="text-muted-foreground text-xs">정규근무시간</span>
                                              <span className="text-xs font-medium">
                                                {formatWorkHours(hoverData.regularMinutes)}
                                              </span>
                                            </div>
                                            <div className="flex justify-between pl-2">
                                              <span className="text-muted-foreground text-xs">연장근무시간</span>
                                              <span className="text-xs font-medium">
                                                {formatWorkHours(hoverData.overtimeWorkMinutes)}
                                              </span>
                                            </div>
                                            <div className="flex justify-between pl-2">
                                              <span className="text-muted-foreground text-xs">야간근무시간</span>
                                              <span className="text-xs font-medium">
                                                {formatWorkHours(hoverData.nightWorkMinutes)}
                                              </span>
                                            </div>
                                                                                        <div className="flex justify-between pl-2">
                                              <span className="text-muted-foreground text-xs">
                                                공휴일 유급인정시간
                                              </span>
                                              <span className="text-xs font-medium">
                                                {formatWorkHours(hoverData.paidHolidayMinutes || 0)}
                                              </span>
                                            </div>

                                            <div className="flex justify-between pl-2">
                                              <span className="text-muted-foreground text-xs">
                                                공휴일 실제근무시간
                                              </span>
                                              <span className="text-xs font-medium">
                                                {formatWorkHours(hoverData.publicHolidayActualWorkMinutes || 0)}
                                              </span>
                                            </div>
                                            <div className="flex justify-between pl-2">
                                              <span className="text-muted-foreground text-xs">야간교대근무시간</span>
                                              <span className="text-xs font-medium">
                                                {formatWorkHours(hoverData.nightShiftWorkMinutes)}
                                              </span>
                                            </div>
                                            {hoverData.nightShiftWorkMinutes > 0 && (
                                              <div className="pl-4 space-y-0.5">
                                                {hoverData.nightShiftTier1Minutes > 0 && (
                                                  <div className="flex justify-between">
                                                    <span className="text-muted-foreground/70 text-[11px]">
                                                      ├ 1단계(정규+비야간)
                                                    </span>
                                                    <span className="text-[11px] text-muted-foreground">
                                                      {formatWorkHours(hoverData.nightShiftTier1Minutes)}
                                                    </span>
                                                  </div>
                                                )}
                                                {hoverData.nightShiftTier2Minutes > 0 && (
                                                  <div className="flex justify-between">
                                                    <span className="text-muted-foreground/70 text-[11px]">
                                                      ├ 2단계(정규+야간)
                                                    </span>
                                                    <span className="text-[11px] text-muted-foreground">
                                                      {formatWorkHours(hoverData.nightShiftTier2Minutes)}
                                                    </span>
                                                  </div>
                                                )}
                                                {hoverData.nightShiftTier3Minutes > 0 && (
                                                  <div className="flex justify-between">
                                                    <span className="text-muted-foreground/70 text-[11px]">
                                                      ├ 3단계(연장+야간)
                                                    </span>
                                                    <span className="text-[11px] text-muted-foreground">
                                                      {formatWorkHours(hoverData.nightShiftTier3Minutes)}
                                                    </span>
                                                  </div>
                                                )}
                                                {hoverData.nightShiftTier4Minutes > 0 && (
                                                  <div className="flex justify-between">
                                                    <span className="text-muted-foreground/70 text-[11px]">
                                                      └ 4단계(연장+비야간)
                                                    </span>
                                                    <span className="text-[11px] text-muted-foreground">
                                                      {formatWorkHours(hoverData.nightShiftTier4Minutes)}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </HoverCardContent>
                                      </HoverCard>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {(() => {
                                    const displayStatus = getDisplayStatus(rec, hoverData);

                                    return (
                                      <Badge
                                        variant="secondary"
                                        className={cn("font-medium", statusConfigWithEarlyLeave[displayStatus]?.class)}
                                      >
                                        {statusConfigWithEarlyLeave[displayStatus]?.label || displayStatus}
                                      </Badge>
                                    );
                                  })()}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    {!record.checkIn && (
                                      <Button size="sm" onClick={() => handleCheckIn(record.employeeId)}>
                                        출근
                                      </Button>
                                    )}
                                    {record.checkIn && !record.checkOut && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleCheckOut(record.employeeId)}
                                      >
                                        퇴근
                                      </Button>
                                    )}
                                    {record.checkIn && (record.status as string) !== "unrecorded" && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setEditingRecord(record)}
                                        title="근태 수정"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      해당 날짜의 근태 기록이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* 선택 요약 바 */}
            {selectedIds.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-t rounded-b-lg">
                <span className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{selectedIds.length}명</span> /{" "}
                  {filteredAttendance.length}명 선택됨
                </span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                  선택 해제
                </Button>
              </div>
            )}
          </div>

          {editingRecord && (
            <AttendanceEditDialog
              open={!!editingRecord}
              onOpenChange={(open) => {
                if (!open) setEditingRecord(null);
              }}
              record={editingRecord}
            />
          )}

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
                    <DailyInfoItem
                      icon={<Building2 className="w-4 h-4" />}
                      label="부서"
                      value={selectedEmployee.department || "-"}
                    />
                    <DailyInfoItem
                      icon={<Users className="w-4 h-4" />}
                      label="직위"
                      value={selectedEmployee.position || "-"}
                    />
                    <DailyInfoItem
                      icon={<Phone className="w-4 h-4" />}
                      label="연락처"
                      value={selectedEmployee.phone || "-"}
                    />
                    <DailyInfoItem
                      icon={<Mail className="w-4 h-4" />}
                      label="이메일"
                      value={selectedEmployee.email || "-"}
                    />
                    <DailyInfoItem
                      icon={<CalendarDays className="w-4 h-4" />}
                      label="입사일"
                      value={selectedEmployee.hire_date}
                    />
                    <DailyInfoItem
                      icon={<CreditCard className="w-4 h-4" />}
                      label="급여유형"
                      value={
                        selectedEmployee.pay_type === "monthly"
                          ? "월급"
                          : selectedEmployee.pay_type === "hourly"
                            ? "시급"
                            : "일급"
                      }
                    />
                    <DailyInfoItem
                      icon={<CreditCard className="w-4 h-4" />}
                      label="기본급"
                      value={`${selectedEmployee.base_salary.toLocaleString()}원`}
                    />
                    <DailyInfoItem
                      icon={<Building2 className="w-4 h-4" />}
                      label="고용형태"
                      value={
                        { regular: "정규직", contract: "계약직", daily: "일용직", freelancer: "프리랜서" }[
                          selectedEmployee.employment_type
                        ] || selectedEmployee.employment_type
                      }
                    />
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

function DailyInfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
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
