/**
 * 기간 일괄 등록 다이얼로그
 * - 시작일~종료일 범위의 근태를 한 번에 등록
 * - 주말/공휴일 자동 제외
 * - dailyWorkerCalculation.ts STEP 1~8 적용
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConstructionSites } from "@/hooks/useConstructionSites";
import { useJobTypes } from "@/hooks/useJobTypes";
import { useDailyAttendance } from "@/hooks/useDailyAttendance";
import { useDailyPayrollSettings } from "@/hooks/useDailyPayrollSettings";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { calculateWeeklyHolidayEligibility, resolveWorkerKey } from "@/utils/weeklyHolidayEligibility";
import { upsertWeeklyHolidayPayRecord } from "@/utils/upsertWeeklyHolidayPayRecord";
import {
  calculateWorkMinutes,
  calculateNightMinutes,
  toMinutes,
  adjustEndTime,
  validateEntry,
  calculateDailyWorkerPay,
  calculateDailyAttendancePayroll,
  classifyDayType,
  generateFingerprint,
  createSnapshot,
  type DailyWorkerEntry,
} from "@/utils/dailyWorkerCalculation";
import { calculateDailyTax } from "@/utils/dailyTaxCalculation";
import { toast } from "sonner";
import { CalendarRange, Loader2 } from "lucide-react";

const DAY_NAMES_SHORT = ["일", "월", "화", "수", "목", "금", "토"];

// 한국 공휴일 (양력 고정 + 주요 공휴일)
function getKoreanHolidays(year: number): Set<string> {
  const holidays = new Set<string>();
  const pad = (n: number) => String(n).padStart(2, "0");
  const add = (m: number, d: number) => holidays.add(`${year}-${pad(m)}-${pad(d)}`);

  // 양력 고정 공휴일
  add(1, 1); // 신정
  add(3, 1); // 삼일절
  add(5, 5); // 어린이날
  add(6, 6); // 현충일
  add(8, 15); // 광복절
  add(10, 3); // 개천절
  add(10, 9); // 한글날
  add(12, 25); // 크리스마스

  // 2025~2027 설/추석 (음력 기반, 하드코딩)
  if (year === 2025) {
    add(1, 28);
    add(1, 29);
    add(1, 30); // 설
    add(5, 5); // 석가탄신일 (5/5 겹침)
    add(10, 5);
    add(10, 6);
    add(10, 7); // 추석
  } else if (year === 2026) {
    add(2, 16);
    add(2, 17);
    add(2, 18); // 설
    add(5, 24); // 석가탄신일
    add(9, 24);
    add(9, 25);
    add(9, 26); // 추석
  } else if (year === 2027) {
    add(2, 6);
    add(2, 7);
    add(2, 8); // 설
    add(5, 13); // 석가탄신일
    add(10, 14);
    add(10, 15);
    add(10, 16); // 추석
  }

  return holidays;
}

function normalizeTo24h(timeStr: string): string {
  if (!timeStr) return timeStr;
  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1]);
    const m = parseInt(match24[2]);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return timeStr;
}
function normalizeSsnDigits(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, 13);
}

function formatSsnEditable(value: string): string {
  const clean = normalizeSsnDigits(value);
  if (clean.length <= 6) return clean;
  return `${clean.slice(0, 6)}-${clean.slice(6)}`;
}

function formatSsnMasked(value: string): string {
  const clean = normalizeSsnDigits(value);
  if (clean.length <= 6) return clean;
  return `${clean.slice(0, 6)}-*******`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "form" | "preview";

export function BatchRegistrationDialog({ open, onOpenChange }: Props) {
  const { currentOrganization } = useOrganization();
  const { activeSites } = useConstructionSites();
  const { jobTypes } = useJobTypes();
  const { settings: dailyPayrollSettings, refetch: refetchSettings } = useDailyPayrollSettings();
  const workdayWarningThreshold = dailyPayrollSettings.monthly_workday_warning || 8;

  const [step, setStep] = useState<Step>("form");
  const [saving, setSaving] = useState(false);
  const [dateSelectMode, setDateSelectMode] = useState<"range" | "pick">("range");
  const [pickedDates, setPickedDates] = useState<Set<string>>(new Set());

  // 다이얼로그 열릴 때 설정 최신화
  useEffect(() => {
    if (open) refetchSettings();
  }, [open, refetchSettings]);

  // dateSelectMode 변경 시 체크박스 기본값 연동
  useEffect(() => {
    if (dateSelectMode === "pick") {
      setExcludeWeekends(false);
      setExcludeHolidays(false);
    } else {
      setExcludeWeekends(true);
      setExcludeHolidays(true);
    }
  }, [dateSelectMode]);

  // Form state
  const [siteId, setSiteId] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [jobType, setJobType] = useState("보통인부");
  const [ssnInput, setSsnInput] = useState("");
  const [ssnFocused, setSsnFocused] = useState(false);
  const [phone, setPhone] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [excludeWeekends, setExcludeWeekends] = useState(true);
  const [excludeHolidays, setExcludeHolidays] = useState(true);
  const [inputMode, setInputMode] = useState<"time" | "hours" | "manday">("manday");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  const [workHours, setWorkHours] = useState("8");
  const [breakMinutes, setBreakMinutes] = useState("60");
  const [workType, setWorkType] = useState<"fixed" | "hourly">("fixed");
  const [dailyWage, setDailyWage] = useState("");
  const [manDay, setManDay] = useState(1.0);
  const [mealAllowance, setMealAllowance] = useState("");
  const [vehicleAllowance, setVehicleAllowance] = useState("");
  const [extraNonTaxableAllowance, setExtraNonTaxableAllowance] = useState("");
  // 날짜 직접 선택 모드용
  const [pickMonth, setPickMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  });

  const pickCalendarDays = useMemo(() => {
    const [y, m] = pickMonth.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const firstDay = new Date(y, m - 1, 1).getDay();
    return { y, m, daysInMonth, firstDay };
  }, [pickMonth]);

  // Get yearMonth from startDate for querying existing records
  const yearMonth = useMemo(() => {
    if (dateSelectMode === "pick") {
      const today = new Date();
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    }
    if (!startDate) return "";
    const [y, m] = startDate.split("-");
    return `${y}-${m}`;
  }, [startDate, dateSelectMode]);

  const { records: existingRecords, insertRecord } = useDailyAttendance(siteId || null, yearMonth);

  // Generate date array
  const targetDates = useMemo(() => {
    if (!startDate || !endDate || startDate > endDate) return [];
    const dates: { dateStr: string; dayOfWeek: number; dayName: string; excluded: boolean; reason?: string }[] = [];
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const year = start.getFullYear();
    const holidays = getKoreanHolidays(year);
    // Also get next year holidays if range spans years
    const holidays2 = end.getFullYear() !== year ? getKoreanHolidays(end.getFullYear()) : holidays;

    const current = new Date(start);
    while (current <= end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, "0");
      const d = String(current.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      const dayOfWeek = current.getDay();
      const dayName = DAY_NAMES_SHORT[dayOfWeek];

      let excluded = false;
      let reason: string | undefined;

      if (excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        excluded = true;
        reason = "주말";
      }
      const hSet = y === year ? holidays : holidays2;
      if (excludeHolidays && hSet.has(dateStr)) {
        excluded = true;
        reason = reason ? `${reason}/공휴일` : "공휴일";
      }

      dates.push({ dateStr, dayOfWeek, dayName, excluded, reason });
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [startDate, endDate, excludeWeekends, excludeHolidays]);

  const activeDates = useMemo(() => targetDates.filter((d) => !d.excluded), [targetDates]);
  // 날짜 직접 선택 모드의 활성 날짜
  const finalActiveDates = useMemo(() => {
    if (dateSelectMode === "pick") {
      return Array.from(pickedDates)
        .sort()
        .map((dateStr) => {
          const date = new Date(dateStr + "T00:00:00");
          return {
            dateStr,
            dayOfWeek: date.getDay(),
            dayName: DAY_NAMES_SHORT[date.getDay()],
            excluded: false,
          };
        });
    }
    return activeDates;
  }, [dateSelectMode, pickedDates, activeDates]);

  // Check duplicates against existing records
  const existingFingerprints = useMemo(() => {
    return new Set(existingRecords.map((r) => `${r.worker_name}|${r.work_date}`));
  }, [existingRecords]);

  const duplicateDates = useMemo(() => {
    return finalActiveDates.filter((d) => existingFingerprints.has(`${workerName.trim()}|${d.dateStr}`));
  }, [finalActiveDates, existingFingerprints, workerName]);

  const newDates = useMemo(() => {
    return finalActiveDates.filter((d) => !existingFingerprints.has(`${workerName.trim()}|${d.dateStr}`));
  }, [finalActiveDates, existingFingerprints, workerName]);

  // Calculate pay for preview
  const previewCalc = useMemo(() => {
    const wage = parseInt(dailyWage) || 0;
    if (wage <= 0) return null;
    const breakMin = parseInt(breakMinutes) || 0;
    const st = inputMode === "time" ? normalizeTo24h(startTime) : null;
    const et = inputMode === "time" ? normalizeTo24h(endTime) : null;
    const wh = inputMode === "hours" || inputMode === "manday" ? parseFloat(workHours) || null : null;

    const workMin =
      inputMode === "manday" ? Math.round(manDay * 8 * 60) : calculateWorkMinutes(st, et, wh, breakMin).workMin;
    if (workMin <= 0) return null;

    let nightMin = 0;
    if (st && et) {
      const sMin = toMinutes(st);
      const eMin = adjustEndTime(sMin, toMinutes(et));
      nightMin = calculateNightMinutes(sMin, eMin);
      if (nightMin > workMin) nightMin = workMin;
    }

    const sMinPrev = st ? toMinutes(st) : undefined;
    const eMinPrev = st && et ? adjustEndTime(sMinPrev!, toMinutes(et)) : undefined;
    const result = calculateDailyWorkerPay({
      workType,
      dailyWage: wage,
      workMinutes: workMin,
      nightMinutes: workType === "fixed" ? 0 : nightMin,
      startMin: sMinPrev,
      endMin: eMinPrev,
      breakMinutes: breakMin,
    });

    // 고정일당: calculateDailyAttendancePayroll 사용 (공수 연장수당 반영)
    if (workType === "fixed") {
      const dayType = "workday" as const;
      return calculateDailyAttendancePayroll({
        workType: "fixed",
        dailyWage: wage,
        workMinutes: workMin,
        nightMinutes: 0,
        dayType,
      });
    }
    return result;
  }, [dailyWage, breakMinutes, inputMode, startTime, endTime, workHours, workType]);

  const totalPay = previewCalc ? previewCalc.calculatedPay * newDates.length : 0;

  const formatCurrency = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

  const formatShortDate = (dateStr: string) => {
    const [, m, d] = dateStr.split("-");
    const date = new Date(dateStr + "T00:00:00");
    const dayName = DAY_NAMES_SHORT[date.getDay()];
    return `${parseInt(m)}/${parseInt(d)}(${dayName})`;
  };

  const validateForm = (): string | null => {
    if (!siteId) return "현장을 선택해주세요.";
    if (!workerName.trim()) return "이름을 입력해주세요.";
    if (dateSelectMode === "range") {
      if (!startDate || !endDate) return "시작일과 종료일을 입력해주세요.";
      if (startDate > endDate) return "시작일이 종료일보다 이후입니다.";
    }
    const wage = parseInt(dailyWage) || 0;
    if (wage <= 0) return "단가를 입력해주세요.";
    if (dateSelectMode === "pick" && pickedDates.size === 0) return "날짜를 선택해주세요.";
    if (finalActiveDates.length === 0) return "등록할 날짜가 없습니다.";
    return null;
  };

  const handleNext = () => {
    const error = validateForm();
    if (error) {
      toast.error(error);
      return;
    }

    // 월 근무일수 경고 체크
    const existingWorkerDays = new Set(
      existingRecords.filter((r) => r.worker_name === workerName.trim()).map((r) => r.work_date),
    ).size;
    const totalDaysAfter = existingWorkerDays + newDates.length;
    if (totalDaysAfter >= workdayWarningThreshold) {
      const confirmed = confirm(
        `${workerName.trim()}님은 이번 달 ${totalDaysAfter}번째 근무입니다.\n` +
          `${workdayWarningThreshold}일 이상 근무 시 국민연금/건강보험 적용 대상이 됩니다.\n` +
          `계속하시겠습니까?`,
      );
      if (!confirmed) return;
    }

    setStep("preview");
  };

  const handleSave = useCallback(async () => {
    if (!currentOrganization || !siteId || !previewCalc) return;
    setSaving(true);

    try {
      const wage = parseInt(dailyWage) || 0;
      const breakMin = parseInt(breakMinutes) || 0;
      const st = inputMode === "time" ? normalizeTo24h(startTime) : null;
      const et = inputMode === "time" ? normalizeTo24h(endTime) : null;
      const wh = inputMode === "hours" || inputMode === "manday" ? parseFloat(workHours) || null : null;
      const workMin =
        inputMode === "manday" ? Math.round(manDay * 8 * 60) : calculateWorkMinutes(st, et, wh, breakMin).workMin;

      let nightMin = 0;
      if (st && et) {
        const sMin = toMinutes(st);
        const eMin = adjustEndTime(sMin, toMinutes(et));
        nightMin = calculateNightMinutes(sMin, eMin);
        if (nightMin > workMin) nightMin = workMin;
      }

      const sMinSave = st ? toMinutes(st) : undefined;
      const eMinSave = st && et ? adjustEndTime(sMinSave!, toMinutes(et)) : undefined;

      let ssnMasked: string | null = null;
      let ssnLast4: string | null = null;
      const ssnClean = ssnInput.replace(/[^0-9]/g, "");
      if (ssnClean.length >= 7) {
        ssnMasked = `${ssnClean.substring(0, 6)}-${ssnClean.charAt(6)}******`;
        ssnLast4 = ssnClean.slice(-4);
      }

      let successCount = 0;
      let skipCount = 0;
      const skippedDates: string[] = [];
      const savedRecordsForWeeklyCalc: any[] = [];

      const datesToSave = finalActiveDates.filter(
        (d) => !existingFingerprints.has(`${workerName.trim()}|${d.dateStr}`),
      );
      for (const dateItem of datesToSave) {
        const entry: DailyWorkerEntry = {
          siteId,
          workerName: workerName.trim(),
          workDate: dateItem.dateStr,
          workType,
          startTime: st,
          endTime: et,
          workHours: wh,
          breakMinutes: breakMin,
          dailyWage: wage,
        };

        const validation = validateEntry(entry);
        if (!validation.valid) {
          skippedDates.push(formatShortDate(dateItem.dateStr));
          skipCount++;
          continue;
        }

        const dayType = classifyDayType(
          dateItem.dateStr,
          dailyPayrollSettings.weekly_work_day_list || [],
          dailyPayrollSettings.weekly_holiday || "sun",
          dailyPayrollSettings.non_work_day_default_type || "REST_DAY",
        );

        const payResult = calculateDailyAttendancePayroll({
          workType,
          dailyWage: wage,
          workMinutes: workMin,
          nightMinutes: workType === "fixed" ? 0 : nightMin,
          dayType,
        });

        const snapshot = createSnapshot({
          workType,
          dailyWage: wage,
          calculatedPay: payResult.calculatedPay,
          hourlyRate: workType === "hourly" ? wage : undefined,
          regularHours: payResult.regularHours,
          overtimeHours: payResult.overtimeHours,
          nightHours: payResult.nightHours,
          holidayHours: payResult.holidayHours,
          breakMinutes: breakMin,
          overtimePay: payResult.overtimePay,
          nightPay: payResult.nightPay,
          regularPay: payResult.regularPay,
          holidayPay: payResult.holidayPay,
          dayType: payResult.dayType,
        });

        const fingerprint = await generateFingerprint(
          siteId,
          workerName.trim(),
          dateItem.dateStr,
          st,
          et,
          wh,
          payResult.calculatedPay,
        );

        const mealAmt = parseInt(mealAllowance) || 0;
        const vehicleAmt = parseInt(vehicleAllowance) || 0;
        const extraAmt = parseInt(extraNonTaxableAllowance) || 0;
        const totalPayWithAllowances = payResult.calculatedPay + mealAmt + vehicleAmt + extraAmt;
        const rowWorkerKey = ssnMasked ? `SSN:${ssnMasked}` : `NAME:${workerName.trim()}`;

        const { data: insuranceData } = await supabase
          .from("worker_insurance_settings")
          .select("apply_national_pension, apply_health_insurance, apply_employment_insurance")
          .eq("organization_id", currentOrganization.id)
          .eq("worker_key", rowWorkerKey)
          .maybeSingle();

        const mergedSettings = {
          ...dailyPayrollSettings,
          apply_national_pension: insuranceData?.apply_national_pension ?? false,
          apply_health_insurance: insuranceData?.apply_health_insurance ?? false,
          apply_employment_insurance: insuranceData?.apply_employment_insurance ?? true,
        };
        const taxResult = calculateDailyTax(totalPayWithAllowances, mergedSettings, "employment_income", {
          totalWage: totalPayWithAllowances,
          overtimePay: payResult.overtimePay ?? 0,
          nightPay: payResult.nightPay ?? 0,
          holidayPay: payResult.holidayPay ?? 0,
          mealAllowance: mealAmt,
          vehicleAllowance: vehicleAmt,
          extraNonTaxableAllowance: extraAmt,
          isProductionWorkerTaxExempt: dailyPayrollSettings.production_worker_tax_exempt ?? true,
        });

        const record = {
          organization_id: currentOrganization.id,
          site_id: siteId,
          worker_name: workerName.trim(),
          job_type: jobType || "보통인부",
          ssn_encrypted: null,
          ssn_masked: ssnMasked,
          ssn_last4: ssnLast4,
          phone: phone.trim() || null,
          work_date: dateItem.dateStr,
          work_type: workType,
          start_time: st,
          end_time: et,
          work_hours: wh,
          work_minutes: workMin,
          break_minutes: breakMin,
          daily_wage: wage,
          calculated_pay: payResult.calculatedPay,
          final_pay: payResult.calculatedPay,
          adjustment_memo: "",
          regular_hours: payResult.regularHours,
          overtime_hours: payResult.overtimeHours,
          night_hours: payResult.nightHours,
          overtime_pay: payResult.overtimePay,
          night_pay: payResult.nightPay,
          holiday_hours: payResult.holidayHours,
          holiday_pay: payResult.holidayPay,
          fingerprint,
          calculation_snapshot: snapshot,
          memo: "",
          income_tax: taxResult.incomeTax,
          local_income_tax: taxResult.localIncomeTax,
          employment_insurance: taxResult.employmentInsurance,
          national_pension: taxResult.nationalPension,
          health_insurance: taxResult.healthInsurance,
          long_term_care_insurance: taxResult.longTermCareInsurance,
          industrial_accident: taxResult.industrialAccident,
          total_deductions: taxResult.totalDeductions,
          net_pay: taxResult.netPay,
          meal_allowance_amount: mealAmt,
          vehicle_allowance_amount: vehicleAmt,
          extra_non_taxable_allowance_amount: extraAmt,
          extra_non_taxable_allowance_name: extraAmt > 0 ? dailyPayrollSettings.extra_non_taxable_name || null : null,
        };

        try {
          await insertRecord.mutateAsync(record as any);
          successCount++;
          savedRecordsForWeeklyCalc.push(record);
        } catch {
          skippedDates.push(formatShortDate(dateItem.dateStr));
          skipCount++;
        }
      }

      if (skipCount > 0) {
        toast.warning(`${successCount}건 저장, ${skipCount}건 건너뜀 (${skippedDates.join(", ")})`);
      } else {
        toast.success(`${successCount}건 일괄 저장 완료`);
      }

      // UI 먼저 종료
      resetAndClose();

      // 주휴수당 재계산은 백그라운드 실행
      void (async () => {
        try {
          if (workType !== "hourly" || savedRecordsForWeeklyCalc.length === 0) return;

          const workerKey = resolveWorkerKey({
            worker_name: workerName.trim(),
            ssn_masked: ssnMasked,
            phone: null,
          });

          const { data: allOrgRecords } = await supabase
            .from("daily_attendance")
            .select("*")
            .eq("organization_id", currentOrganization.id)
            .eq("work_type", "hourly");

          const mergedRecordsForCalc = [...(allOrgRecords || []), ...savedRecordsForWeeklyCalc];
          const weeklyDone = new Set<string>();

          for (const savedRecord of savedRecordsForWeeklyCalc) {
            const weeklyResult = calculateWeeklyHolidayEligibility({
              organizationId: currentOrganization.id,
              workerKey,
              workerName: workerName.trim(),
              targetDate: savedRecord.work_date,
              records: mergedRecordsForCalc as any,
              weeklyWorkDayList: dailyPayrollSettings.weekly_work_day_list || [],
              weeklyHoliday: dailyPayrollSettings.weekly_holiday || "sun",
              weeklyWorkHours: dailyPayrollSettings.weekly_work_hours || 40,
            });

            const key = `${weeklyResult.organization_id}|${weeklyResult.worker_key}|${weeklyResult.week_start}`;
            if (weeklyDone.has(key)) continue;
            weeklyDone.add(key);

            await upsertWeeklyHolidayPayRecord(weeklyResult);
          }
        } catch (e) {
          console.error("batch weekly holiday recalc error:", e);
        }
      })();
    } finally {
      setSaving(false);
    }
  }, [
    currentOrganization,
    siteId,
    workerName,
    ssnInput,
    newDates,
    dailyWage,
    breakMinutes,
    inputMode,
    startTime,
    endTime,
    workHours,
    workType,
    previewCalc,
    insertRecord,
    mealAllowance,
    vehicleAllowance,
    extraNonTaxableAllowance,
    dailyPayrollSettings,
    existingRecords,
  ]);

  const resetAndClose = () => {
    setStep("form");
    setWorkerName("");
    setJobType("보통인부");
    setSsnInput("");
    setPhone("");
    setStartDate("");
    setEndDate("");
    setExcludeWeekends(true);
    setExcludeHolidays(true);
    setInputMode("manday");
    setStartTime("08:00");
    setEndTime("17:00");
    setWorkHours("8");
    setBreakMinutes("60");
    setWorkType("fixed");
    setDailyWage("");
    setManDay(1.0);
    setMealAllowance("");
    setVehicleAllowance("");
    setExtraNonTaxableAllowance("");
    setDateSelectMode("range");
    setPickedDates(new Set());
    setPickMonth(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetAndClose();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="w-5 h-5" />
            기간 일괄 등록
          </DialogTitle>
          <DialogDescription>
            {step === "form" ? "기간을 설정하고 근무 조건을 입력하세요." : "아래 내용을 확인 후 저장하세요."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="space-y-4">
            {/* 현장 선택 */}
            <div>
              <Label className="text-xs">현장 선택 *</Label>
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger>
                  <SelectValue placeholder="현장 선택" />
                </SelectTrigger>
                <SelectContent>
                  {activeSites.map((s) => (
                    <SelectItem key={s.site_id} value={s.site_id}>
                      {s.site_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 이름 / 주민번호 / 핸드폰번호 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">이름 *</Label>
                <Input value={workerName} onChange={(e) => setWorkerName(e.target.value)} placeholder="홍길동" />
              </div>
              <div>
                <Label className="text-xs">주민번호 (선택)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={ssnFocused ? formatSsnEditable(ssnInput) : formatSsnMasked(ssnInput)}
                  onFocus={() => setSsnFocused(true)}
                  onBlur={() => setSsnFocused(false)}
                  onChange={(e) => setSsnInput(normalizeSsnDigits(e.target.value))}
                  placeholder="000000-0000000"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">핸드폰번호 (선택)</Label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9-]/g, ""))}
                placeholder="010-0000-0000"
              />
            </div>

            {/* 직종 선택 */}
            <div>
              <Label className="text-xs">직종</Label>
              <Select value={jobType} onValueChange={setJobType}>
                <SelectTrigger>
                  <SelectValue placeholder="직종 선택" />
                </SelectTrigger>
                <SelectContent>
                  {jobTypes.map((jt) => (
                    <SelectItem key={jt.id} value={jt.name}>
                      {jt.name}
                    </SelectItem>
                  ))}
                  {jobTypes.length === 0 && <SelectItem value="보통인부">보통인부</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            {/* 날짜 선택 방식 */}
            <div>
              <Label className="text-xs">근무일 선택 방식</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  variant={dateSelectMode === "range" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateSelectMode("range")}
                >
                  기간 입력
                </Button>
                <Button
                  type="button"
                  variant={dateSelectMode === "pick" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateSelectMode("pick")}
                >
                  날짜 직접 선택
                </Button>
              </div>
            </div>

            {dateSelectMode === "range" ? (
              <>
                {/* 기간 입력 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">시작일 *</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">종료일 *</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={excludeWeekends} onCheckedChange={(v) => setExcludeWeekends(!!v)} />
                    주말 자동 제외
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={excludeHolidays} onCheckedChange={(v) => setExcludeHolidays(!!v)} />
                    공휴일 제외
                  </label>
                </div>
              </>
            ) : (
              <>
                {/* 날짜 직접 선택 달력 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const [y, m] = pickMonth.split("-").map(Number);
                        const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
                        setPickMonth(prev);
                      }}
                    >
                      ◀
                    </Button>
                    <span className="text-sm font-medium">
                      {pickMonth.split("-")[0]}년 {parseInt(pickMonth.split("-")[1])}월
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const [y, m] = pickMonth.split("-").map(Number);
                        const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
                        setPickMonth(next);
                      }}
                    >
                      ▶
                    </Button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1">
                    {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
                      <div key={d} className={i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : ""}>
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: pickCalendarDays.firstDay }, (_, i) => (
                      <div key={`empty-${i}`} />
                    ))}
                    {Array.from({ length: pickCalendarDays.daysInMonth }, (_, i) => {
                      const day = i + 1;
                      const dateStr = `${pickCalendarDays.y}-${String(pickCalendarDays.m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const dayOfWeek = new Date(dateStr + "T00:00:00").getDay();
                      const isPicked = pickedDates.has(dateStr);
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          onClick={() => {
                            const next = new Set(pickedDates);
                            if (next.has(dateStr)) next.delete(dateStr);
                            else next.add(dateStr);
                            setPickedDates(next);
                          }}
                          className={[
                            "rounded text-xs py-1 border transition-colors",
                            isPicked
                              ? "bg-primary text-primary-foreground border-primary"
                              : "hover:bg-accent border-transparent",
                            dayOfWeek === 0 ? "text-red-500" : dayOfWeek === 6 ? "text-blue-500" : "",
                            isPicked ? "!text-white" : "",
                          ].join(" ")}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setPickedDates(new Set())}>
                      전체 해제
                    </Button>
                    <span className="text-xs text-muted-foreground self-center">선택된 날짜: {pickedDates.size}일</span>
                  </div>
                </div>
              </>
            )}

            {/* 급여유형 / 단가 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">급여유형</Label>
                <Select
                  value={workType}
                  onValueChange={(v: "fixed" | "hourly") => {
                    setWorkType(v);
                    if (v === "fixed") setInputMode("hours");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">고정일당</SelectItem>
                    <SelectItem value="hourly">시급제</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{workType === "fixed" ? "일당 (원)" : "시급 (원)"}</Label>
                <Input
                  type="number"
                  value={dailyWage}
                  onChange={(e) => setDailyWage(e.target.value)}
                  placeholder={workType === "fixed" ? "150000" : "12000"}
                />
              </div>
            </div>

            {/* 시간 입력 모드 */}
            <div>
              {workType === "fixed" ? (
                <>
                  {/* 고정일당: 공수 버튼 */}
                  <div>
                    <Label className="text-xs">공수</Label>
                    <div className="flex gap-2 mt-1">
                      {[0.5, 1.0, 1.5, 2.0].map((md) => (
                        <Button
                          key={md}
                          type="button"
                          variant={inputMode === "manday" && manDay === md ? "default" : "outline"}
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setManDay(md);
                            setWorkHours(String(md * 8));
                            setInputMode("manday" as any);
                          }}
                        >
                          {md}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        variant={inputMode === "hours" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setInputMode("hours")}
                      >
                        직접입력
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <Label className="text-xs">근무시간 (h)</Label>
                      {inputMode === "manday" ? (
                        <Input
                          type="number"
                          value={workHours}
                          readOnly
                          className="bg-muted text-muted-foreground cursor-not-allowed"
                        />
                      ) : (
                        <Input
                          type="number"
                          step="0.5"
                          value={workHours}
                          onChange={(e) => {
                            setWorkHours(e.target.value);
                            setManDay(Math.round((parseFloat(e.target.value) / 8) * 100) / 100);
                          }}
                          placeholder="8"
                        />
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">휴게(분)</Label>
                      <Input type="number" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-2">
                    <Label className="text-xs">근무시간 입력</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={inputMode === "time" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setInputMode("time")}
                      >
                        출퇴근 시간
                      </Button>
                      <Button
                        type="button"
                        variant={inputMode === "hours" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setInputMode("hours")}
                      >
                        시간수 직접입력
                      </Button>
                    </div>
                  </div>
                  {inputMode === "time" ? (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">출근</Label>
                        <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">퇴근</Label>
                        <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">휴게(분)</Label>
                        <Input type="number" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">근무시간 (시간)</Label>
                        <Input
                          type="number"
                          step="0.5"
                          value={workHours}
                          onChange={(e) => setWorkHours(e.target.value)}
                          placeholder="8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">휴게(분)</Label>
                        <Input type="number" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 시스템 계산액 미리보기 */}
            {previewCalc && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <div className="flex justify-between text-sm font-medium">
                  <span>시스템 계산액 (근로수당)</span>
                  <span>{formatCurrency(previewCalc.calculatedPay)}원</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {previewCalc.regularHours > 0 && (
                    <div className="flex justify-between">
                      <span>정규 ({previewCalc.regularHours}h)</span>
                      <span>{formatCurrency(Math.round(previewCalc.regularPay || 0))}원</span>
                    </div>
                  )}
                  {previewCalc.overtimeHours > 0 && (
                    <div className="flex justify-between">
                      <span>연장 ({previewCalc.overtimeHours}h × 1.5)</span>
                      <span>{formatCurrency(Math.round(previewCalc.overtimePay || 0))}원</span>
                    </div>
                  )}
                  {previewCalc.nightHours > 0 && (
                    <div className="flex justify-between">
                      <span>야간 ({previewCalc.nightHours}h × 0.5)</span>
                      <span>{formatCurrency(Math.round(previewCalc.nightPay || 0))}원</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 비과세 항목 */}
            {(dailyPayrollSettings.enable_meal_allowance ||
              dailyPayrollSettings.enable_vehicle_allowance ||
              dailyPayrollSettings.enable_extra_non_taxable) && (
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">비과세 항목</Label>
                <div className="grid grid-cols-3 gap-3">
                  {dailyPayrollSettings.enable_meal_allowance && (
                    <div>
                      <Label className="text-xs">식대 (원)</Label>
                      <Input
                        type="number"
                        value={mealAllowance}
                        onChange={(e) => setMealAllowance(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  )}
                  {dailyPayrollSettings.enable_vehicle_allowance && (
                    <div>
                      <Label className="text-xs">차량운전보조금 (원)</Label>
                      <Input
                        type="number"
                        value={vehicleAllowance}
                        onChange={(e) => setVehicleAllowance(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  )}
                  {dailyPayrollSettings.enable_extra_non_taxable && (
                    <div>
                      <Label className="text-xs">
                        {dailyPayrollSettings.extra_non_taxable_name || "기타 비과세"} (원)
                      </Label>
                      <Input
                        type="number"
                        value={extraNonTaxableAllowance}
                        onChange={(e) => setExtraNonTaxableAllowance(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 하단 요약 */}
            {previewCalc && activeDates.length > 0 && (
              <Alert>
                <AlertDescription className="text-xs space-y-1">
                  <div>
                    대상일수: <strong>{activeDates.length}일</strong> (제외: {targetDates.length - activeDates.length}
                    일)
                  </div>
                  <div>
                    일당 계산: <strong>{formatCurrency(previewCalc.calculatedPay)}원</strong>
                  </div>
                  {duplicateDates.length > 0 && (
                    <div className="text-amber-600">⚠ 중복 {duplicateDates.length}건 건너뜀</div>
                  )}
                  <div>
                    예상 등록: <strong>{newDates.length}건</strong> / 예상 총액:{" "}
                    <strong>{formatCurrency(totalPay)}원</strong>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          /* Preview step */
          <div className="space-y-3">
            <div className="text-sm">
              아래 날짜에 <strong>{workerName}</strong> 데이터를 생성합니다.
            </div>
            <div className="max-h-[300px] overflow-y-auto border rounded-md divide-y">
              {newDates.map((d) => (
                <div key={d.dateStr} className="flex justify-between px-3 py-1.5 text-sm">
                  <span>{formatShortDate(d.dateStr)}</span>
                  <span className="font-medium">{formatCurrency(previewCalc?.calculatedPay || 0)}원</span>
                </div>
              ))}
            </div>
            {duplicateDates.length > 0 && (
              <Alert>
                <AlertDescription className="text-xs text-amber-600">
                  ⚠ 건너뛰는 날짜 (이미 등록됨): {duplicateDates.map((d) => formatShortDate(d.dateStr)).join(", ")}
                </AlertDescription>
              </Alert>
            )}
            <div className="text-sm font-semibold text-right">
              총 {newDates.length}건 / {formatCurrency(totalPay)}원
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "form" ? (
            <>
              <Button variant="outline" onClick={resetAndClose}>
                취소
              </Button>
              <Button onClick={handleNext}>다음</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("form")}>
                이전
              </Button>
              <Button onClick={handleSave} disabled={saving || newDates.length === 0}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" /> 저장 중...
                  </>
                ) : (
                  "확인"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
