import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useEmployees } from "@/hooks/useEmployees";
import { useAttendanceRange } from "@/hooks/useAttendance";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { useDailyPayrollSettings } from "@/hooks/useDailyPayrollSettings";
import { useDailyPayrollRecords } from "@/hooks/useDailyPayrollRecords";
import { calculateSingleAttendance, getKSTMinutes } from "@/utils/attendanceCalculation";
import { calculateDailyPayroll, DailyPayrollInput } from "@/utils/dailyPayrollCalculation";
import { calculateWeeklyHolidayPay, type DailyHolidayRecord } from "@/utils/dailyHolidayPayCalculation";
import { classifyWorkDate, calculateHolidayWorkSurcharge } from "@/utils/holidayWorkUtils";
import { useOrganization } from "@/contexts/OrganizationContext";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import {
  Calculator,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Lock,
  Unlock,
  Trash2,
  Info,
  CheckCircle2,
  RefreshCw,
  Search,
  X,
  Printer,
  FileSpreadsheet,
  Eye,
  ClipboardList,
  ChevronDown,
  MessageSquare,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { FilterSidebar } from "@/components/filters/FilterSidebar";
import { EmployeeCombobox } from "@/components/employee/EmployeeCombobox";
import { DailyPaySlip } from "@/components/payroll/DailyPaySlip";
import { DailyPayrollLedger } from "@/components/payroll/DailyPayrollLedger";
import {
  exportDailyPayrollLedger,
  exportDailyPayslips,
  exportDailyPayrollList,
} from "@/components/payroll/DailyPayrollExcelExport";
import { useAuth } from "@/contexts/AuthContext";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(amount);

const formatTime = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}시간 ${m}분`;
};

const statusLabels: Record<string, { label: string; class: string }> = {
  auto_generated: { label: "자동 생성", class: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
  modified: { label: "수정됨", class: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" },
  confirmed: { label: "급여 확정", class: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
};

export function DailyPayrollTab() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { employees: dbEmployees } = useEmployees();
  const { settings: orgSettings } = useOrganizationSettings();
  const { settings: dpSettings } = useDailyPayrollSettings();

  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [searchedEmployeeId, setSearchedEmployeeId] = useState<string | null>(null);
  const [paySlipRecord, setPaySlipRecord] = useState<any>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsProgress, setSmsProgress] = useState({ current: 0, total: 0 });
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  // 부서 트리 데이터
  const [dbDeptTree, setDbDeptTree] = useState<
    { id: string; name: string; parent_id: string | null; sort_order: number }[]
  >([]);
  const [dbDepartments, setDbDepartments] = useState<string[]>([]);

  useEffect(() => {
    if (!currentOrganization) return;
    const fetchDepartments = async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name, parent_id, sort_order")
        .eq("organization_id", currentOrganization.id)
        .order("sort_order");
      const depts = (data || []) as { id: string; name: string; parent_id: string | null; sort_order: number }[];
      setDbDeptTree(depts);
      setDbDepartments(depts.map((d) => d.name));
    };
    fetchDepartments();
  }, [currentOrganization]);

  // Build dept tree for filtering
  const deptTree = useMemo(() => {
    const map = new Map<string | null, typeof dbDeptTree>();
    dbDeptTree.forEach((d) => {
      const key = d.parent_id || null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    });
    const result: { name: string; childNames: string[] }[] = [];
    const getAllChildNames = (parentId: string): string[] => {
      const children = map.get(parentId) || [];
      const names: string[] = [];
      children.forEach((c) => {
        names.push(c.name);
        names.push(...getAllChildNames(c.id));
      });
      return names;
    };
    const walk = (parentId: string | null) => {
      (map.get(parentId) || []).forEach((d) => {
        const allChildNames = getAllChildNames(d.id);
        result.push({ name: d.name, childNames: [d.name, ...allChildNames] });
        walk(d.id);
      });
    };
    walk(null);
    return result;
  }, [dbDeptTree]);

  // Date range for month
  const dateRange = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      start: `${year}-${String(month).padStart(2, "0")}-01`,
      end: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }, [selectedMonth]);

  // 일용직/프리랜서 직원만 필터 (월급제 프리랜서는 정기급여에서 처리하므로 제외)
  const dailyWorkers = useMemo(
    () =>
      dbEmployees.filter(
        (e) =>
          e.employment_type === "daily" ||
          (e.employment_type === "freelancer" && (e.pay_type === "daily" || e.pay_type === "hourly")),
      ),
    [dbEmployees],
  );

  // 근태 데이터
  const { data: attendanceData = [] } = useAttendanceRange(dateRange.start, dateRange.end);

  // 일용직 급여 레코드
  const { records, isLoading, upsertRecords, updateStatus, deleteRecords } = useDailyPayrollRecords(
    dateRange.start,
    dateRange.end,
  );

  // 부서 필터링된 레코드
  const filteredRecords = useMemo(() => {
    if (!selectedDepartment) return records;

    if (selectedDepartment === "미분류") {
      return records.filter((r) => {
        const emp = dbEmployees.find((e) => e.id === r.employee_id);
        return !emp?.department || !dbDepartments.includes(emp.department);
      });
    }

    const node = deptTree.find((d) => d.name === selectedDepartment);
    if (node) {
      return records.filter((r) => {
        const emp = dbEmployees.find((e) => e.id === r.employee_id);
        return node.childNames.includes(emp?.department || "");
      });
    }

    return records.filter((r) => {
      const emp = dbEmployees.find((e) => e.id === r.employee_id);
      return emp?.department === selectedDepartment;
    });
  }, [records, selectedDepartment, deptTree, dbDepartments, dbEmployees]);

  // 월 근무일수 경고
  const workdayCountByEmployee = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => {
      counts[r.employee_id] = (counts[r.employee_id] || 0) + 1;
    });
    return counts;
  }, [records]);

  // 급여 생성 로직
  const handleGenerate = useCallback(async () => {
    if (!currentOrganization) return;
    setGenerating(true);

    try {
      const dailyWorkerIds = new Set(dailyWorkers.map((e) => e.id));
      // 일용직 직원의 완료된 근태 기록만 필터
      const eligibleAttendance = attendanceData.filter(
        (att) =>
          dailyWorkerIds.has(att.employee_id) &&
          att.check_in &&
          att.check_out &&
          (att.status === "present" || att.status === "late"),
      );

      if (eligibleAttendance.length === 0) {
        toast.error("생성할 근태 기록이 없습니다.");
        setGenerating(false);
        return;
      }

      // ── 주휴수당 맵 생성 ──
      // employee별로 근태를 그룹화 → calculateWeeklyHolidayPay → 마지막 근무일에 매핑
      const holidayPayMap: Record<string, number> = {};
      const attByEmployee: Record<string, typeof eligibleAttendance> = {};
      eligibleAttendance.forEach((att) => {
        if (!attByEmployee[att.employee_id]) attByEmployee[att.employee_id] = [];
        attByEmployee[att.employee_id].push(att);
      });

      Object.entries(attByEmployee).forEach(([empId, atts]) => {
        const emp = dbEmployees.find((e) => e.id === empId);
        if (!emp) return;

        const holidayRecords: DailyHolidayRecord[] = atts.map((att) => {
          const isNight = att.work_type === "night";
          const breakdown = calculateSingleAttendance(
            att.check_in!,
            att.check_out!,
            att.date,
            att.break_minutes ?? 0,
            isNight,
            orgSettings,
          );
          const standardMinutes = orgSettings.standard_work_hours * 60;
          // base_daily_wage = 정상근로 1일 기본급 (연장/야간 제외)
          let baseDailyWage = 0;
          if (emp.pay_type === "hourly") {
            const rate = emp.hourly_rate || 0;
            const regularMinutes = Math.min(breakdown.recognizedMinutes, standardMinutes);
            baseDailyWage = Math.round(rate * (regularMinutes / 60));
          } else {
            baseDailyWage = emp.daily_rate || 0;
          }

          return {
            work_date: att.date,
            work_type: (emp.pay_type === "hourly" ? "hourly" : "fixed") as "fixed" | "hourly",
            daily_wage: emp.pay_type === "hourly" ? emp.hourly_rate || 0 : emp.daily_rate || 0,
            work_hours: breakdown.recognizedMinutes / 60,
            base_daily_wage: baseDailyWage,
          };
        });

        const results = calculateWeeklyHolidayPay({
          records: holidayRecords,
          weeklyWorkDays: dpSettings.weekly_work_days ?? 5,
          weeklyWorkDayList: dpSettings.weekly_work_day_list ?? ["MON", "TUE", "WED", "THU", "FRI"],
          weeklyHoliday: dpSettings.weekly_holiday ?? "sun",
          weeklyWorkHours: dpSettings.weekly_work_hours ?? 40,
          lastWorkDate: null,
        });

        results.forEach((result) => {
          if (!result.isEligible || !result.holidayPay || result.holidayPay <= 0) return;
          if (!result.records || result.records.length === 0) return;
          const lastWorkedDate = [...result.records]
            .map((rr) => rr.work_date)
            .sort()
            .slice(-1)[0];
          if (!lastWorkedDate) return;
          const key = `${empId}__${lastWorkedDate}`;
          holidayPayMap[key] = (holidayPayMap[key] || 0) + result.holidayPay;
        });

        if (emp.name === "기간테스트") {
          console.log("HOLIDAY_GENERATE_MAP", { empId, holidayRecords, results, holidayPayMap });
        }
      });

      const newRecords = eligibleAttendance
        .map((att) => {
          const emp = dbEmployees.find((e) => e.id === att.employee_id);
          if (!emp) return null;

          const isNight = att.work_type === "night";
          const breakdown = calculateSingleAttendance(
            att.check_in!,
            att.check_out!,
            att.date,
            att.break_minutes ?? 0,
            isNight,
            orgSettings,
          );

          // Calculate overtime/night minutes
          const standardMinutes = orgSettings.standard_work_hours * 60;
          const overtimeMin = Math.max(0, breakdown.recognizedMinutes - standardMinutes);

          // 야간 근무 시간 계산: 야간조는 전체 인정근무시간, 주간조는 야간수당적용시작시간 이후 실제 근무분
          let nightMin = 0;
          if (isNight) {
            nightMin = breakdown.recognizedMinutes;
          } else if (att.check_in && att.check_out) {
            nightMin = calculateDayWorkerNightMinutes(
              new Date(att.check_in),
              new Date(att.check_out),
              orgSettings.night_shift_start_time,
            );
          }

          const settlementType = (emp.settlement_type as any) || dpSettings.default_settlement_type;

          const input: DailyPayrollInput = {
            employeeId: emp.id,
            workDate: att.date,
            attendanceRecordId: att.id,
            recognizedMinutes: breakdown.recognizedMinutes,
            stayMinutes: breakdown.stayMinutes,
            breakMinutes: breakdown.breakMinutes,
            policyDeductionMinutes:
              breakdown.lateTruncation +
              breakdown.overtimeTruncation +
              breakdown.earlyLeaveTruncation +
              breakdown.outingTruncation,
            overtimeMinutes: overtimeMin,
            nightMinutes: nightMin,
            baseSalary: emp.daily_rate || emp.hourly_rate || 0,
            dailyRate: emp.daily_rate,
            hourlyRate: emp.hourly_rate,
            payType: emp.pay_type as "daily" | "hourly",
            settlementType,
          };

          const result = calculateDailyPayroll(input, dpSettings, orgSettings);
          console.log("급여계산확인", {
            employeeName: emp.name,
            workDate: att.date,
            totalWage: result.totalWage,
            incomeTax: result.incomeTax,
            netPay: result.netPay,
          });
          // ── 주휴수당 세금/공제 반영 ──
          const holidayPay = holidayPayMap[`${emp.id}__${att.date}`] ?? 0;
          let finalResult = result;
          // 유급휴일 실제 반영용 계산
          const holidayType = classifyWorkDate(
            att.date,
            dpSettings.weekly_work_day_list ?? ["MON", "TUE", "WED", "THU", "FRI"],
            dpSettings.weekly_holiday ?? "sun",
            (dpSettings as any).non_work_day_default_type ?? "REST_DAY",
          );

          const legalHolidayPay = calculateHolidayWorkSurcharge({
            holidayType,
            workType: emp.pay_type === "hourly" ? "hourly" : "fixed",
            dailyWage: emp.pay_type === "hourly" ? emp.hourly_rate || 0 : emp.daily_rate || 0,
            workMinutes: breakdown.recognizedMinutes,
          });

          const holidayPolicy = dpSettings.holiday_work_policy ?? "REFERENCE_ONLY";

          let holidayWorkPay = 0;

          // 정책별 지급금액 결정
          if (holidayPolicy === "LEGAL_AUTO") {
            holidayWorkPay = legalHolidayPay;
          }

          if (holidayPolicy === "FIXED_DAILY_WAGE") {
            holidayWorkPay = dpSettings.fixed_holiday_daily_wage ?? 0;
          }

          // 법정 최소 보정
          let finalHolidayWorkPay = holidayWorkPay;

          if ((dpSettings.holiday_minimum_enforce ?? true) && holidayWorkPay < legalHolidayPay) {
            finalHolidayWorkPay = legalHolidayPay;
          }

          if (holidayPay > 0) {
            const holidayInput: DailyPayrollInput = {
              employeeId: emp.id,
              workDate: att.date,
              attendanceRecordId: att.id,
              recognizedMinutes: 0,
              stayMinutes: 0,
              breakMinutes: 0,
              policyDeductionMinutes: 0,
              overtimeMinutes: 0,
              nightMinutes: 0,
              baseSalary: holidayPay,
              dailyRate: holidayPay,
              hourlyRate: null,
              payType: "daily",
              settlementType,
            };
            const holidayResult = calculateDailyPayroll(holidayInput, dpSettings, orgSettings);

            if (emp.name === "기간테스트") {
              console.log("HOLIDAY_GENERATE_DEBUG", {
                workDate: att.date,
                holidayPay,
                mainResult: result,
                holidayResult,
                finalTotalWage: result.totalWage + holidayResult.totalWage,
                finalIncomeTax: result.incomeTax + holidayResult.incomeTax,
                finalNetPay: result.netPay + holidayResult.netPay,
              });
            }

            finalResult = {
              ...result,
              baseDailyWage: result.baseDailyWage + holidayResult.baseDailyWage,
              overtimePay: result.overtimePay + holidayResult.overtimePay,
              nightPay: result.nightPay + holidayResult.nightPay,
              totalWage: result.totalWage + holidayResult.totalWage,
              incomeTax: result.incomeTax + holidayResult.incomeTax,
              localIncomeTax: result.localIncomeTax + holidayResult.localIncomeTax,
              employmentInsurance: result.employmentInsurance + holidayResult.employmentInsurance,
              nationalPension: result.nationalPension + holidayResult.nationalPension,
              healthInsurance: result.healthInsurance + holidayResult.healthInsurance,
              longTermCareInsurance: result.longTermCareInsurance + holidayResult.longTermCareInsurance,
              industrialAccident: result.industrialAccident + holidayResult.industrialAccident,
              totalDeductions: result.totalDeductions + holidayResult.totalDeductions,
              netPay: result.netPay + holidayResult.netPay,
            };
          }
          console.log("HOLIDAY_TYPE_CHECK", {
            date: att.date,
            holidayType,
            finalHolidayWorkPay,
          });
          // 유급휴일만 실제 반영
          if ((holidayType === "weekly_holiday" || holidayType === "holiday") && finalHolidayWorkPay > 0) {
            const holidayWorkInput: DailyPayrollInput = {
              employeeId: emp.id,
              workDate: att.date,
              attendanceRecordId: att.id,
              recognizedMinutes: 0,
              stayMinutes: 0,
              breakMinutes: 0,
              policyDeductionMinutes: 0,
              overtimeMinutes: 0,
              nightMinutes: 0,
              baseSalary: finalHolidayWorkPay,
              dailyRate: finalHolidayWorkPay,
              hourlyRate: null,
              payType: "daily",
              settlementType,
            };

            const holidayWorkResult = calculateDailyPayroll(holidayWorkInput, dpSettings, orgSettings);
            console.log("HOLIDAY_RESULT", holidayWorkResult);
            console.log("FINAL_BEFORE", finalResult);

            finalResult = {
              ...finalResult,
              baseDailyWage: finalResult.baseDailyWage + holidayWorkResult.baseDailyWage,
              overtimePay: finalResult.overtimePay + holidayWorkResult.overtimePay,
              nightPay: finalResult.nightPay + holidayWorkResult.nightPay,
              totalWage: finalResult.totalWage + holidayWorkResult.totalWage,
              incomeTax: finalResult.incomeTax + holidayWorkResult.incomeTax,
              localIncomeTax: finalResult.localIncomeTax + holidayWorkResult.localIncomeTax,
              employmentInsurance: finalResult.employmentInsurance + holidayWorkResult.employmentInsurance,
              nationalPension: finalResult.nationalPension + holidayWorkResult.nationalPension,
              healthInsurance: finalResult.healthInsurance + holidayWorkResult.healthInsurance,
              longTermCareInsurance: finalResult.longTermCareInsurance + holidayWorkResult.longTermCareInsurance,
              industrialAccident: finalResult.industrialAccident + holidayWorkResult.industrialAccident,
              totalDeductions: finalResult.totalDeductions + holidayWorkResult.totalDeductions,
              netPay: finalResult.netPay + holidayWorkResult.netPay,
            };
            console.log("FINAL_AFTER", finalResult);
          }
          return {
            organization_id: currentOrganization.id,
            employee_id: emp.id,
            attendance_record_id: att.id,
            work_date: att.date,
            work_minutes: finalResult.workMinutes,
            stay_minutes: finalResult.stayMinutes,
            break_minutes: finalResult.breakMinutes,
            policy_deduction_minutes: finalResult.policyDeductionMinutes,
            overtime_minutes: finalResult.overtimeMinutes,
            night_minutes: finalResult.nightMinutes,
            base_daily_wage: finalResult.baseDailyWage,
            overtime_pay: finalResult.overtimePay,
            night_pay: finalResult.nightPay,
            total_wage: finalResult.totalWage,
            settlement_type: finalResult.settlementType,
            income_tax: finalResult.incomeTax,
            local_income_tax: finalResult.localIncomeTax,
            employment_insurance: finalResult.employmentInsurance,
            national_pension: finalResult.nationalPension,
            health_insurance: finalResult.healthInsurance,
            total_deductions: finalResult.totalDeductions,
            net_pay: finalResult.netPay,
            status: "auto_generated",
          };
        })
        .filter(Boolean) as any[];

      await upsertRecords.mutateAsync(newRecords);
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  }, [currentOrganization, dailyWorkers, attendanceData, dbEmployees, orgSettings, dpSettings, upsertRecords]);

  const handleConfirm = async () => {
    if (selectedIds.length === 0) {
      toast.error("확정할 항목을 선택해주세요.");
      return;
    }
    await updateStatus.mutateAsync({ ids: selectedIds, status: "confirmed" });
    toast.success(`${selectedIds.length}건이 확정되었습니다.`);
    setSelectedIds([]);
  };

  const handleUnconfirm = async () => {
    if (selectedIds.length === 0) {
      toast.error("해제할 항목을 선택해주세요.");
      return;
    }
    await updateStatus.mutateAsync({ ids: selectedIds, status: "auto_generated" });
    toast.success(`${selectedIds.length}건의 확정이 해제되었습니다.`);
    setSelectedIds([]);
  };

  const handleDelete = async () => {
    const deletable = selectedIds.filter((id) => {
      const r = records.find((rec) => rec.id === id);
      return r && r.status !== "confirmed";
    });
    if (deletable.length === 0) {
      toast.error("확정된 급여는 삭제할 수 없습니다. 먼저 확정을 해제해주세요.");
      return;
    }
    await deleteRecords.mutateAsync(deletable);
    setSelectedIds([]);
  };

  const allSelected = records.length > 0 && selectedIds.length === records.length;

  // 통계
  const stats = useMemo(
    () => ({
      totalRecords: records.length,
      totalWage: records.reduce((s, r) => s + r.total_wage, 0),
      totalDeductions: records.reduce((s, r) => s + r.total_deductions, 0),
      totalNetPay: records.reduce((s, r) => s + r.net_pay, 0),
      confirmed: records.filter((r) => r.status === "confirmed").length,
    }),
    [records],
  );

  // 급여명세서 일괄 출력
  const handleBatchPrint = useCallback(
    (ids: string[] | null) => {
      // ids가 null이면 확정분 전체
      const targetRecords = ids
        ? records.filter((r) => ids.includes(r.id))
        : records.filter((r) => r.status === "confirmed");

      if (targetRecords.length === 0) {
        toast.error(ids ? "선택된 항목이 없습니다." : "확정된 급여 기록이 없습니다.");
        return;
      }

      const companyName = currentOrganization?.name || "회사명";
      const formatCurrencyLocal = (amount: number) =>
        new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(amount);
      const formatTimeLocal = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}시간 ${m}분`;
      };

      const slips = targetRecords
        .map((record) => {
          const emp = dbEmployees.find((e) => e.id === record.employee_id);
          if (!emp) return "";
          const s = DOMPurify.sanitize;

          const paymentRows = [
            { name: emp.pay_type === "hourly" ? "시급 기준" : "일당", amount: record.base_daily_wage },
            ...(record.overtime_pay > 0 ? [{ name: "연장근로수당", amount: record.overtime_pay }] : []),
            ...(record.night_pay > 0 ? [{ name: "야간근로수당", amount: record.night_pay }] : []),
          ];
          const deductionRows = [
            ...(record.income_tax > 0 ? [{ name: "소득세", amount: record.income_tax }] : []),
            ...(record.local_income_tax > 0 ? [{ name: "지방소득세", amount: record.local_income_tax }] : []),
            ...(record.employment_insurance > 0 ? [{ name: "고용보험", amount: record.employment_insurance }] : []),
            ...(record.national_pension > 0 ? [{ name: "국민연금", amount: record.national_pension }] : []),
            ...(record.health_insurance > 0 ? [{ name: "건강보험", amount: record.health_insurance }] : []),
          ];

          const payHtml = paymentRows
            .map((r) => `<tr><td>${s(r.name)}</td><td>${formatCurrencyLocal(r.amount)}</td></tr>`)
            .join("");
          const dedHtml = deductionRows
            .map((r) => `<tr><td>${s(r.name)}</td><td class="text-red">-${formatCurrencyLocal(r.amount)}</td></tr>`)
            .join("");

          return `<div class="payslip-page">
        <div class="header">
          <div class="company-name">${s(companyName)}</div>
          <div class="title">일용직 급여명세서</div>
          <div class="subtitle">${s(record.work_date)}</div>
        </div>
        <div class="content-wrapper">
          <div class="section"><div class="section-header">📋 직원 정보</div><table>
            <tr><td>성명</td><td>${s(emp.name)}</td></tr>
            <tr><td>사원번호</td><td>${s(emp.employee_number)}</td></tr>
            <tr><td>부서</td><td>${s(emp.department || "-")}</td></tr>
            <tr><td>직급</td><td>${s(emp.position || "-")}</td></tr>
            <tr><td>급여계좌</td><td>${s(emp.bank_name ? `${emp.bank_name} ${emp.account_number || ""}` : "-")}</td></tr>
            <tr><td>정산방식</td><td>${record.settlement_type === "business_income_3_3" ? "사업소득(3.3%)" : "근로소득(일용직)"}</td></tr>
          </table></div>
          <div class="section"><div class="section-header">⏰ 근무 현황</div><table>
            <tr><td>체류시간</td><td>${formatTimeLocal(record.stay_minutes)}</td></tr>
            <tr><td>휴게시간</td><td>${record.break_minutes}분</td></tr>
            <tr><td>인정근무</td><td>${formatTimeLocal(record.work_minutes)}</td></tr>
            ${record.overtime_minutes > 0 ? `<tr><td>초과근무</td><td>${formatTimeLocal(record.overtime_minutes)}</td></tr>` : ""}
            ${record.night_minutes > 0 ? `<tr><td>야간근무</td><td>${formatTimeLocal(record.night_minutes)}</td></tr>` : ""}
          </table></div>
          <div class="section"><div class="section-header payment">💰 지급 내역</div><table>
            ${payHtml}
            <tr class="total-row"><td>지급액 합계</td><td>${formatCurrencyLocal(record.total_wage)}</td></tr>
          </table></div>
          <div class="section"><div class="section-header deduction">📉 공제 내역</div><table>
            ${dedHtml.length > 0 ? dedHtml : "<tr><td>공제 없음</td><td>₩0</td></tr>"}
            <tr class="total-row"><td>공제액 합계</td><td class="text-red">-${formatCurrencyLocal(record.total_deductions)}</td></tr>
          </table></div>
        </div>
        <div class="net-salary">
          <div class="net-salary-label">실지급액</div>
          <div class="net-salary-amount">${formatCurrencyLocal(record.net_pay)}</div>
        </div>
        <div class="footer">
          <p>본 명세서는 ${s(record.work_date)} 근무분 급여입니다.</p>
          <p style="margin-top:4px;">${s(companyName)} | 발급일: ${new Date().toLocaleDateString("ko-KR")}</p>
        </div>
      </div>`;
        })
        .filter(Boolean)
        .join("");

      const printWindow = window.open("", "_blank");
      if (!printWindow) return;

      printWindow.document.write(`<!DOCTYPE html><html><head><title>일용직 급여명세서</title><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      @page { size:A4; margin:10mm; }
      body { font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif; background:#fff; color:#333; line-height:1.3; font-size:11px; }
      .payslip-page { padding:15px; page-break-after:always; }
      .payslip-page:last-child { page-break-after:auto; }
      .header { text-align:center; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid #2563eb; }
      .company-name { font-size:11px; color:#666; margin-bottom:4px; }
      .title { font-size:18px; font-weight:bold; color:#1e40af; margin-bottom:4px; }
      .subtitle { font-size:12px; color:#666; background:#f1f5f9; display:inline-block; padding:2px 12px; border-radius:10px; }
      .content-wrapper { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .section { margin-bottom:10px; border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; }
      .section-header { background:linear-gradient(135deg,#3b82f6,#1d4ed8); color:white; padding:6px 10px; font-weight:bold; font-size:11px; }
      .section-header.payment { background:linear-gradient(135deg,#10b981,#059669); }
      .section-header.deduction { background:linear-gradient(135deg,#ef4444,#dc2626); }
      table { width:100%; border-collapse:collapse; }
      td { padding:4px 8px; border-bottom:1px solid #f1f5f9; font-size:10px; }
      td:first-child { color:#64748b; width:50%; }
      td:last-child { text-align:right; font-weight:600; color:#1e293b; }
      tr:last-child td { border-bottom:none; }
      .text-red { color:#dc2626; }
      .total-row { background:#f8fafc; font-weight:bold; } .total-row td:first-child { color:#1e293b; }
      .net-salary { background:linear-gradient(135deg,#1e40af,#3b82f6); color:white; border-radius:6px; padding:12px; text-align:center; margin-bottom:10px; }
      .net-salary-label { font-size:11px; opacity:0.9; margin-bottom:4px; }
      .net-salary-amount { font-size:20px; font-weight:bold; }
      .footer { text-align:center; color:#94a3b8; font-size:9px; padding-top:8px; border-top:1px solid #e2e8f0; }
      @media print { body { padding:0; print-color-adjust:exact; -webkit-print-color-adjust:exact; } .section { break-inside:avoid; } }
    </style></head><body>${slips}</body></html>`);
      printWindow.document.close();
      printWindow.print();
      toast.success(`${targetRecords.length}건의 급여명세서가 출력됩니다.`);
    },
    [records, dbEmployees, currentOrganization],
  );

  // SMS 발송
  const handleBatchSms = useCallback(
    async (ids: string[] | null) => {
      if (!currentOrganization || !user) return;

      const targetRecords = ids
        ? records.filter((r) => ids.includes(r.id))
        : records.filter((r) => r.status === "confirmed");

      const recordsWithPhone = targetRecords.filter((r) => {
        const emp = dbEmployees.find((e) => e.id === r.employee_id);
        return emp?.phone?.trim();
      });

      if (recordsWithPhone.length === 0) {
        toast.error(
          ids
            ? "선택된 직원 중 전화번호가 등록된 직원이 없습니다."
            : "확정된 급여 중 전화번호가 등록된 직원이 없습니다.",
        );
        return;
      }

      setIsSendingSms(true);
      setSmsProgress({ current: 0, total: recordsWithPhone.length });
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < recordsWithPhone.length; i++) {
        const record = recordsWithPhone[i];
        const emp = dbEmployees.find((e) => e.id === record.employee_id);
        if (!emp?.phone) continue;

        try {
          const { error } = await supabase.functions.invoke("send-payslip-sms", {
            body: {
              organizationId: currentOrganization.id,
              employeeName: emp.name,
              employeePhone: emp.phone,
              employeeId: emp.id,
              payrollRecordId: record.id,
              month: `${record.work_date} (일용)`,
              baseSalary: record.base_daily_wage,
              totalPayments: record.total_wage,
              deductions: record.total_deductions,
              netSalary: record.net_pay,
              companyName: currentOrganization.name,
              siteUrl: window.location.origin,
            },
          });

          // SMS 로그 기록
          await supabase.from("sms_send_logs").insert({
            organization_id: currentOrganization.id,
            employee_id: emp.id,
            sent_by: user.id,
            phone_number: emp.phone,
            message_type: "daily_payslip",
            content: `[${currentOrganization.name}] ${record.work_date} 일용직 급여명세서 - 실지급액: ${formatCurrency(record.net_pay)}`,
            status: error ? "failed" : "sent",
            error_message: error?.message || null,
          });

          if (error) {
            failCount++;
          } else {
            successCount++;
          }
        } catch (err: any) {
          failCount++;
          // 실패 로그
          await supabase.from("sms_send_logs").insert({
            organization_id: currentOrganization.id,
            employee_id: emp.id,
            sent_by: user.id,
            phone_number: emp.phone,
            message_type: "daily_payslip",
            content: `[${currentOrganization.name}] ${record.work_date} 일용직 급여명세서`,
            status: "failed",
            error_message: err?.message || "Unknown error",
          });
        }
        setSmsProgress({ current: i + 1, total: recordsWithPhone.length });
      }

      setIsSendingSms(false);
      setSmsProgress({ current: 0, total: 0 });

      if (failCount === 0) toast.success(`${successCount}건의 SMS가 발송되었습니다.`);
      else if (successCount === 0) toast.error("모든 SMS 발송에 실패했습니다.");
      else toast.warning(`${successCount}건 발송 성공, ${failCount}건 발송 실패`);
    },
    [currentOrganization, user, records, dbEmployees],
  );

  return (
    <div className="space-y-4">
      {/* 기간 선택 */}
      <div className="flex flex-wrap items-center gap-2">
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

        <Button onClick={handleGenerate} disabled={generating}>
          {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calculator className="w-4 h-4 mr-2" />}
          일용직 급여 생성
        </Button>

        {selectedIds.length > 0 && (
          <>
            <Button variant="default" size="sm" onClick={handleConfirm}>
              <Lock className="w-3.5 h-3.5 mr-1" />
              급여 확정 ({selectedIds.length})
            </Button>
            <Button variant="outline" size="sm" onClick={handleUnconfirm}>
              <Unlock className="w-3.5 h-3.5 mr-1" />
              확정 해제
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              삭제
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* 발송/출력 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={records.length === 0 || isSendingSms}>
                {isSendingSms ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    SMS 발송 중 ({smsProgress.current}/{smsProgress.total})
                  </>
                ) : (
                  <>
                    <Printer className="w-3.5 h-3.5 mr-1" />
                    발송/출력 <ChevronDown className="w-3 h-3 ml-1" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleBatchPrint(selectedIds.length > 0 ? selectedIds : null)}>
                <Printer className="w-4 h-4 mr-2" />
                {selectedIds.length > 0 ? `선택 출력 (${selectedIds.length}건)` : "전체 출력 (확정분)"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleBatchSms(selectedIds.length > 0 ? selectedIds : null)}>
                <MessageSquare className="w-4 h-4 mr-2" />
                {selectedIds.length > 0 ? `선택 SMS 발송 (${selectedIds.length}건)` : "SMS 일괄 발송 (확정분)"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={() => setLedgerOpen(true)}>
            <ClipboardList className="w-3.5 h-3.5 mr-1" />
            급여대장
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />
                엑셀 <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() => {
                  const companyName = currentOrganization?.name || "";
                  exportDailyPayrollLedger(records, selectedMonth, companyName).then((ok) => {
                    if (!ok) toast.error("확정된 급여 기록이 없습니다.");
                    else toast.success("급여대장 엑셀이 다운로드되었습니다.");
                  });
                }}
              >
                급여대장 엑셀 (확정분)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const companyName = currentOrganization?.name || "";
                  exportDailyPayslips(records, selectedMonth, companyName).then((ok) => {
                    if (!ok) toast.error("확정된 급여 기록이 없습니다.");
                    else toast.success("급여명세서 엑셀이 다운로드되었습니다.");
                  });
                }}
              >
                급여명세서 엑셀 (확정분)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  exportDailyPayrollList(filteredRecords, selectedMonth).then((ok) => {
                    if (!ok) toast.error("내보낼 데이터가 없습니다.");
                    else toast.success("목록 엑셀이 다운로드되었습니다.");
                  });
                }}
              >
                현재 목록 엑셀
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 직원 검색 */}
      <div className="flex items-center gap-2">
        <div className="w-72">
          <EmployeeCombobox
            employees={dailyWorkers.map((e) => ({
              id: e.id,
              name: e.name,
              employee_number: e.employee_number,
              department: e.department || undefined,
              position: e.position || undefined,
            }))}
            value={searchedEmployeeId || ""}
            onValueChange={(id) => {
              setSearchedEmployeeId(id || null);
              if (id) {
                setTimeout(() => {
                  const firstRecord = filteredRecords.find((r) => r.employee_id === id);
                  if (firstRecord && rowRefs.current[firstRecord.id]) {
                    rowRefs.current[firstRecord.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }
                }, 100);
                setTimeout(() => setSearchedEmployeeId(null), 5000);
              }
            }}
            placeholder="직원 검색 (이름, 사번, 부서)"
          />
        </div>
        {searchedEmployeeId && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSearchedEmployeeId(null)}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">총 건수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{stats.totalRecords}건</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">총 지급액</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(stats.totalWage)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">총 공제액</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(stats.totalDeductions)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">실 지급 합계</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-primary">{formatCurrency(stats.totalNetPay)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">확정</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {stats.confirmed} / {stats.totalRecords}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 월 근무일수 경고 */}
      {Object.entries(workdayCountByEmployee)
        .filter(([, count]) => count >= dpSettings.monthly_workday_warning)
        .map(([empId, count]) => {
          const emp = dbEmployees.find((e) => e.id === empId);
          return emp ? (
            <Alert key={empId} variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>{emp.name}</strong>님은 이번 달에 <strong>{count}일</strong> 이상 근무했습니다. 국민연금과
                건강보험 적용 대상일 수 있습니다.
              </AlertDescription>
            </Alert>
          ) : null;
        })}

      {/* 메인 컨텐츠 */}
      <div className="flex gap-4">
        {/* FilterSidebar */}
        <FilterSidebar
          employees={records.map((r) => {
            const emp = dbEmployees.find((e) => e.id === r.employee_id);
            return {
              id: r.employee_id,
              department: r.employee?.department,
              employment_type: emp?.employment_type,
            };
          })}
          selectedDepartment={selectedDepartment}
          onDepartmentChange={setSelectedDepartment}
          selectedEmploymentType={null}
          onEmploymentTypeChange={() => {}}
          showEmploymentTypeFilter={false}
        />

        {/* 테이블 */}
        <div className="flex-1 rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filteredRecords.length > 0 && selectedIds.length === filteredRecords.length}
                    onCheckedChange={(c) => setSelectedIds(c ? filteredRecords.map((r) => r.id) : [])}
                  />
                </TableHead>
                <TableHead>날짜</TableHead>
                <TableHead>직원</TableHead>
                <TableHead className="text-center">근무시간</TableHead>
                <TableHead className="text-right">일당</TableHead>
                <TableHead className="text-right">초과수당</TableHead>
                <TableHead className="text-right">야간수당</TableHead>
                <TableHead className="text-right">총 지급</TableHead>
                <TableHead className="text-center">정산</TableHead>
                <TableHead className="text-right">세금</TableHead>
                <TableHead className="text-right">보험</TableHead>
                <TableHead className="text-right">실 지급액</TableHead>
                <TableHead className="text-center">상태</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                    {records.length === 0
                      ? '일용직 급여 기록이 없습니다. "일용직 급여 생성" 버튼을 눌러주세요.'
                      : "해당 조건에 맞는 급여 기록이 없습니다."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map((r) => {
                  const isConfirmed = r.status === "confirmed";
                  const empWarning = (workdayCountByEmployee[r.employee_id] || 0) >= dpSettings.monthly_workday_warning;
                  return (
                    <TableRow
                      key={r.id}
                      ref={(el) => {
                        rowRefs.current[r.id] = el;
                      }}
                      data-highlighted={searchedEmployeeId === r.employee_id ? "true" : undefined}
                      className={cn(
                        isConfirmed && "bg-green-50/50 dark:bg-green-950/20",
                        searchedEmployeeId === r.employee_id && "ring-2 ring-primary ring-inset bg-primary/5",
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(r.id)}
                          onCheckedChange={(c) =>
                            setSelectedIds(c ? [...selectedIds, r.id] : selectedIds.filter((id) => id !== r.id))
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium text-sm">{r.work_date}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-sm">{r.employee?.name || "-"}</span>
                          {empWarning && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-sm">{formatTime(r.work_minutes)}</span>
                          <HoverCard openDelay={200} closeDelay={100}>
                            <HoverCardTrigger asChild>
                              <button className="text-muted-foreground hover:text-foreground">
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-56 text-sm" side="left">
                              <div className="space-y-1.5">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">체류시간</span>
                                  <span>{formatTime(r.stay_minutes)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">휴게시간</span>
                                  <span>-{r.break_minutes}분</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">정책차감</span>
                                  <span>-{r.policy_deduction_minutes}분</span>
                                </div>
                                {r.overtime_minutes > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">초과근무</span>
                                    <span>{formatTime(r.overtime_minutes)}</span>
                                  </div>
                                )}
                                {r.night_minutes > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">야간근무</span>
                                    <span>{formatTime(r.night_minutes)}</span>
                                  </div>
                                )}
                                <div className="border-t pt-1 flex justify-between font-semibold">
                                  <span>인정근무</span>
                                  <span className="text-primary">{formatTime(r.work_minutes)}</span>
                                </div>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(r.base_daily_wage)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {r.overtime_pay > 0 ? formatCurrency(r.overtime_pay) : "-"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {r.night_pay > 0 ? formatCurrency(r.night_pay) : "-"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(r.total_wage)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs">
                          {r.settlement_type === "business_income_3_3" ? "3.3%" : "근로소득"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <HoverCard openDelay={200} closeDelay={100}>
                          <HoverCardTrigger asChild>
                            <button className="text-sm hover:underline">
                              {formatCurrency(r.income_tax + r.local_income_tax)}
                            </button>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-48 text-sm" side="left">
                            <div className="space-y-1">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">소득세</span>
                                <span>{formatCurrency(r.income_tax)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">지방소득세</span>
                                <span>{formatCurrency(r.local_income_tax)}</span>
                              </div>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCurrency(r.employment_insurance + r.national_pension + r.health_insurance)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-bold text-primary">
                        {formatCurrency(r.net_pay)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={cn("text-xs", statusLabels[r.status]?.class || "")}>
                          {r.status === "confirmed" && <Lock className="w-3 h-3 mr-1" />}
                          {statusLabels[r.status]?.label || r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            const emp = dbEmployees.find((e) => e.id === r.employee_id);
                            setPaySlipRecord({
                              ...r,
                              employee: emp
                                ? {
                                    name: emp.name,
                                    employee_number: emp.employee_number,
                                    department: emp.department,
                                    position: emp.position,
                                    bank_name: emp.bank_name,
                                    account_number: emp.account_number,
                                    pay_type: emp.pay_type,
                                    daily_rate: emp.daily_rate,
                                    hourly_rate: emp.hourly_rate,
                                  }
                                : r.employee,
                            });
                          }}
                          title="명세서 보기"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 일용직 급여명세서 다이얼로그 */}
      <DailyPaySlip
        open={!!paySlipRecord}
        onOpenChange={(open) => {
          if (!open) setPaySlipRecord(null);
        }}
        record={paySlipRecord}
      />

      {/* 일용직 급여대장 다이얼로그 */}
      <DailyPayrollLedger
        open={ledgerOpen}
        onOpenChange={setLedgerOpen}
        records={records.map((r) => {
          const emp = dbEmployees.find((e) => e.id === r.employee_id);
          return {
            ...r,
            employee: emp
              ? {
                  name: emp.name,
                  employee_number: emp.employee_number,
                  department: emp.department,
                }
              : r.employee
                ? {
                    name: r.employee.name || "",
                    employee_number: "",
                    department: r.employee.department,
                  }
                : undefined,
          };
        })}
        month={selectedMonth}
      />
    </div>
  );
}

/**
 * 주간조 근무자가 야간수당적용시작시간 이후에 근무한 분을 계산
 * 예: night_shift_start_time = "23:00", 퇴근 = 01:00 → 야간 120분
 */
function calculateDayWorkerNightMinutes(checkIn: Date, checkOut: Date, nightShiftStartTime: string): number {
  const [nsH, nsM] = nightShiftStartTime.split(":").map(Number);
  const nightStartMin = nsH * 60 + nsM; // e.g. 23:00 = 1380

  const ciMin = getKSTMinutes(checkIn);
  const coMin = getKSTMinutes(checkOut);

  // 근무 시간을 분 배열로 구성 (자정 넘김 처리)
  let nightMinutes = 0;
  if (ciMin <= coMin) {
    // 같은 날 (e.g. 09:00~18:00)
    for (let m = ciMin; m < coMin; m++) {
      const wrapped = m % 1440;
      if (wrapped >= nightStartMin || wrapped < 360) {
        // 360 = 06:00
        nightMinutes++;
      }
    }
  } else {
    // 자정 넘김 (e.g. 14:50~00:05)
    // ciMin ~ 1440
    for (let m = ciMin; m < 1440; m++) {
      if (m >= nightStartMin) nightMinutes++;
    }
    // 0 ~ coMin (새벽 시간은 모두 야간)
    for (let m = 0; m < coMin; m++) {
      if (m < 360 || m >= nightStartMin) nightMinutes++; // 06:00 이전은 야간
    }
  }

  return nightMinutes;
}
