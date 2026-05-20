/**
 * 일용직 근태 입력 탭 (Tab 2)
 * - 달력형 그리드
 * - STEP 1~8 안전장치 적용
 * - 고정일당 / 시급 지원
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useConstructionSites } from "@/hooks/useConstructionSites";
import { useJobTypes } from "@/hooks/useJobTypes";
import { useDailyAttendance } from "@/hooks/useDailyAttendance";
import { useDailyPayrollSettings } from "@/hooks/useDailyPayrollSettings";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { calculateDailyTax } from "@/utils/dailyTaxCalculation";
import { calculateAgeFromSsn } from "@/utils/ssnAgeCalculation";
import { AttendanceLockButton } from "@/components/attendance/AttendanceLockButton";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateWorkMinutes,
  calculateNightMinutes,
  toMinutes,
  adjustEndTime,
  validateEntry,
  calculateDailyAttendancePayroll,
  classifyDayType,
  generateFingerprint,
  createSnapshot,
  DailyWorkerEntry,
} from "@/utils/dailyWorkerCalculation";
import { calculateWeeklyHolidayEligibility, resolveWorkerKey } from "@/utils/weeklyHolidayEligibility";
import { upsertWeeklyHolidayPayRecord } from "@/utils/upsertWeeklyHolidayPayRecord";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertTriangle,
  Save,
  Clock,
  DollarSign,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { getDaysInMonth, getDay } from "date-fns";

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 시간 입력값을 24시간제 HH:MM 형식으로 정규화
 * - type="time" input은 항상 24h 반환하지만, 안전장치로 추가
 * - AM/PM 포함 문자열도 변환 (예: "5:00 PM" → "17:00")
 */
function normalizeTo24h(timeStr: string): string {
  if (!timeStr) return timeStr;

  const match24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = parseInt(match24[1]);
    const m = parseInt(match24[2]);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const matchAmPm = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm|오전|오후)$/);
  if (matchAmPm) {
    let h = parseInt(matchAmPm[1]);
    const m = parseInt(matchAmPm[2]);
    const period = matchAmPm[3].toLowerCase();

    if (period === "pm" || period === "오후") {
      if (h !== 12) h += 12;
    } else {
      if (h === 12) h = 0;
    }

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

interface EntryForm {
  workerName: string;
  ssnInput: string;
  phone: string;
  workType: "fixed" | "hourly";
  dailyWage: string;
  startTime: string;
  endTime: string;
  workHours: string;
  breakMinutes: string;
  finalPay: string;
  adjustmentMemo: string;
  memo: string;
  inputMode: "time" | "hours" | "manday";
  jobType: string;
  mealAllowance: string;
  vehicleAllowance: string;
  extraNonTaxableAllowance: string;
  manDay: number;
}

const defaultForm: EntryForm = {
  workerName: "",
  ssnInput: "",
  phone: "",
  workType: "fixed",
  dailyWage: "",
  startTime: "08:00",
  endTime: "17:00",
  workHours: "8",
  breakMinutes: "60",
  finalPay: "",
  adjustmentMemo: "",
  memo: "",
  inputMode: "manday",
  jobType: "보통인부",
  mealAllowance: "",
  vehicleAllowance: "",
  extraNonTaxableAllowance: "",
  manDay: 1.0,
};

interface DailyAttendanceTabProps {
  onOpenBatchDialog?: () => void;
  isLocked?: boolean;
  lockAttendance?: () => Promise<boolean>;
  unlockAttendance?: () => Promise<boolean>;
  siteId?: string;
  yearMonth?: string;
  onSiteChange?: (siteId: string) => void;
  onYearMonthChange?: (yearMonth: string) => void;
}

export function DailyAttendanceTab({
  onOpenBatchDialog,
  isLocked: isLockedProp,
  lockAttendance: lockAttendanceProp,
  unlockAttendance: unlockAttendanceProp,
  siteId: siteIdProp,
  yearMonth: yearMonthProp,
  onSiteChange,
  onYearMonthChange,
}: DailyAttendanceTabProps) {
  const { currentOrganization } = useOrganization();
  const { activeSites, createSite } = useConstructionSites();
  const { jobTypes } = useJobTypes();

  const today = new Date();
  const [yearMonth, setYearMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [selectedSiteId, setSelectedSiteId] = useState<string>(() => {
    return localStorage.getItem("last_construction_site") || "";
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [form, setForm] = useState<EntryForm>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [defaultBreak, setDefaultBreak] = useState("60");
  const [newSiteDialogOpen, setNewSiteDialogOpen] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [ssnFocused, setSsnFocused] = useState(false);

  const [useRecalcMode, setUseRecalcMode] = useState(false);
  const [savedCalcValues, setSavedCalcValues] = useState<{
    regularHours: number;
    overtimeHours: number;
    nightHours: number;
    holidayHours: number;
    regularPay: number;
    overtimePay: number;
    nightPay: number;
    holidayPay: number;
    calculatedPay: number;
    dayType: string;
  } | null>(null);

  const { settings: dailyPayrollSettings } = useDailyPayrollSettings();
  const workdayWarningThreshold = dailyPayrollSettings.monthly_workday_warning || 8;
  const { settings: orgSettings } = useOrganizationSettings();

  const resolvedYearMonth = yearMonthProp || yearMonth;
  const resolvedSiteId = siteIdProp || selectedSiteId;
  const isLocked = isLockedProp ?? false;

  const { records, insertRecord, updateRecord, deleteRecord } = useDailyAttendance(
    resolvedSiteId || null,
    resolvedYearMonth,
  );

  useEffect(() => {
    if (selectedSiteId) {
      localStorage.setItem("last_construction_site", selectedSiteId);
      onSiteChange?.(selectedSiteId);
    }
  }, [selectedSiteId, onSiteChange]);

  useEffect(() => {
    if (!selectedSiteId && activeSites.length > 0) {
      setSelectedSiteId(activeSites[0].site_id);
    }
  }, [activeSites, selectedSiteId]);

  useEffect(() => {
    onYearMonthChange?.(yearMonth);
  }, [yearMonth, onYearMonthChange]);

  useEffect(() => {
  if (
    siteIdProp &&
    siteIdProp !== selectedSiteId &&
    selectedSiteId === ""
  ) {
    setSelectedSiteId(siteIdProp);
  }
}, [siteIdProp]);

  useEffect(() => {
    if (yearMonthProp && yearMonthProp !== yearMonth) {
      setYearMonth(yearMonthProp);
    }
  }, [yearMonthProp, yearMonth]);

  const [year, month] = resolvedYearMonth.split("-").map(Number);
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const calendarDays = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const date = new Date(year, month - 1, day);
      const dayOfWeek = getDay(date);
      return { day, dateStr, dayOfWeek, dayName: DAY_NAMES[dayOfWeek] };
    });
  }, [year, month, daysInMonth]);

  const recordsByDate = useMemo(() => {
    const map: Record<string, typeof records> = {};
    records.forEach((r) => {
      if (!map[r.work_date]) map[r.work_date] = [];
      map[r.work_date].push(r);
    });
    return map;
  }, [records]);

  const workerDayCounts = useMemo(() => {
    const counts: Record<string, Set<string>> = {};
    records.forEach((r) => {
      if (!counts[r.worker_name]) counts[r.worker_name] = new Set();
      counts[r.worker_name].add(r.work_date);
    });
    return Object.entries(counts)
      .filter(([_, dates]) => dates.size >= workdayWarningThreshold)
      .map(([name, dates]) => ({ name, days: dates.size }));
  }, [records, workdayWarningThreshold]);

  const prevMonth = () => {
    const d = new Date(year, month - 2, 1);
    setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const nextMonth = () => {
    const d = new Date(year, month, 1);
    setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const openEntryDialog = (dateStr: string) => {
    setSelectedDate(dateStr);
    setEditingId(null);
    setForm({ ...defaultForm, breakMinutes: defaultBreak });
    setUseRecalcMode(true);
    setSavedCalcValues(null);
    setDialogOpen(true);
  };

  const openEditDialog = (record: (typeof records)[0]) => {
    setSelectedDate(record.work_date);
    setEditingId(record.id);

    const snap = record.calculation_snapshot as any;
    setSavedCalcValues({
      regularHours: record.regular_hours ?? 0,
      overtimeHours: record.overtime_hours ?? 0,
      nightHours: record.night_hours ?? 0,
      holidayHours: record.holiday_hours ?? 0,
      regularPay: snap?.pay_breakdown?.regular_pay ?? 0,
      overtimePay: record.overtime_pay ?? 0,
      nightPay: record.night_pay ?? 0,
      holidayPay: record.holiday_pay ?? 0,
      calculatedPay: record.calculated_pay ?? 0,
      dayType: snap?.day_type ?? "workday",
    });

    setUseRecalcMode(false);
    const savedWorkHours = record.work_hours != null ? record.work_hours : 8;
    const savedManDay = record.work_type === "fixed" ? Math.round((savedWorkHours / 8) * 100) / 100 : 1.0;
    const isCustomManDay = record.work_type === "fixed" && ![0.5, 1.0, 1.5, 2.0].includes(savedManDay);

    setForm({
      workerName: record.worker_name,
      ssnInput: record.ssn_masked || "",
      phone: record.phone || "",
      workType: record.work_type as "fixed" | "hourly",
      dailyWage: String(record.daily_wage),
      startTime: record.start_time || "08:00",
      endTime: record.end_time || "17:00",
      workHours: String(savedWorkHours),
      breakMinutes: String(record.break_minutes),
      finalPay: String(record.final_pay),
      adjustmentMemo: record.adjustment_memo || "",
      memo: record.memo || "",
      inputMode:
        record.work_type === "fixed" ? (isCustomManDay ? "hours" : "manday") : record.start_time ? "time" : "hours",
      jobType: record.job_type || "보통인부",
      mealAllowance: String((record as any).meal_allowance_amount || ""),
      vehicleAllowance: String((record as any).vehicle_allowance_amount || ""),
      extraNonTaxableAllowance: String((record as any).extra_non_taxable_allowance_amount || ""),
      manDay: savedManDay,
    });
    setDialogOpen(true);
  };

  const handleSave = useCallback(async () => {
    if (!currentOrganization || !resolvedSiteId || !selectedDate) return;
    if (!form.workerName.trim()) {
      toast.error("인부 이름을 입력해주세요.");
      return;
    }

    const wage = parseInt(form.dailyWage) || 0;
    if (wage <= 0) {
      toast.error("단가를 입력해주세요.");
      return;
    }

    const breakMin = parseInt(form.breakMinutes) || 0;
    const startTime = form.inputMode === "time" ? normalizeTo24h(form.startTime) : null;
    const endTime = form.inputMode === "time" ? normalizeTo24h(form.endTime) : null;
    const workHoursInput =
      form.inputMode === "hours" || form.inputMode === "manday" ? parseFloat(form.workHours) || null : null;

    const entry: DailyWorkerEntry = {
      siteId: resolvedSiteId,
      workerName: form.workerName.trim(),
      workDate: selectedDate,
      workType: form.workType,
      startTime,
      endTime,
      workHours: workHoursInput,
      breakMinutes: breakMin,
      dailyWage: wage,
    };

    let ssnMasked: string | null = null;
    let ssnLast4: string | null = null;
    const ssnClean = form.ssnInput.replace(/[^0-9]/g, "");
    if (ssnClean.length >= 7) {
      ssnMasked = `${ssnClean.substring(0, 6)}-${ssnClean.charAt(6)}******`;
      ssnLast4 = ssnClean.slice(-4);
    }
    const phoneClean = form.phone.replace(/[^0-9]/g, "");

    const currentIdentityKey = ssnMasked
      ? `SSN:${ssnMasked}`
      : phoneClean
        ? `PHONE:${phoneClean}`
        : `NAME:${form.workerName.trim()}`;
    const currentWorkerKey = resolveWorkerKey({
      worker_name: form.workerName.trim(),
      ssn_masked: ssnMasked,
      phone: form.phone || null,
    });

    const sameWorkerRecords = (recordsByDate[selectedDate] || []).filter((r) => {
      if (editingId && r.id === editingId) return false;

      const recordPhoneClean = String(r.phone || "").replace(/[^0-9]/g, "");
      const recordIdentityKey = r.ssn_masked
        ? `SSN:${r.ssn_masked}`
        : recordPhoneClean
          ? `PHONE:${recordPhoneClean}`
          : `NAME:${r.worker_name}`;

      return recordIdentityKey === currentIdentityKey;
    });

    const normalizeRecordTime = (value: string | null | undefined) => {
      if (!value) return null;
      return value.slice(0, 5);
    };

    const exactDuplicateExists = sameWorkerRecords.some((r) => {
      const sameStart = normalizeRecordTime(r.start_time) === (startTime || null);
      const sameEnd = normalizeRecordTime(r.end_time) === (endTime || null);
      const sameHours = (r.work_hours ?? null) === (workHoursInput ?? null);
      const sameBreak = r.break_minutes === breakMin;
      const sameType = r.work_type === form.workType;
      return sameStart && sameEnd && sameHours && sameBreak && sameType;
    });

    if (exactDuplicateExists) {
      toast.error("이미 동일 근무기록이 존재합니다.");
      return;
    }

    const existingDayMin = sameWorkerRecords.reduce((sum, r) => sum + r.work_minutes, 0);
    const validation = validateEntry(entry, existingDayMin);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    if (validation.warning) {
      if (!confirm(validation.warning.message)) return;
    }

    const { workMin } = calculateWorkMinutes(startTime, endTime, workHoursInput, breakMin);

    let nightMin = 0;
    if (startTime && endTime) {
      const sMin = toMinutes(startTime);
      const eMin = adjustEndTime(sMin, toMinutes(endTime));
      nightMin = calculateNightMinutes(sMin, eMin);
      if (nightMin > workMin) nightMin = workMin;
    }

    const dayType = classifyDayType(
      selectedDate,
      dailyPayrollSettings.weekly_work_day_list || [],
      dailyPayrollSettings.weekly_holiday || "sun",
      dailyPayrollSettings.non_work_day_default_type || "REST_DAY",
    );

    let payResult;
    if (editingId && !useRecalcMode && savedCalcValues) {
      payResult = {
        regularHours: savedCalcValues.regularHours,
        overtimeHours: savedCalcValues.overtimeHours,
        nightHours: savedCalcValues.nightHours,
        holidayHours: savedCalcValues.holidayHours,
        regularPay: savedCalcValues.regularPay,
        overtimePay: savedCalcValues.overtimePay,
        nightPay: savedCalcValues.nightPay,
        holidayPay: savedCalcValues.holidayPay,
        calculatedPay: savedCalcValues.calculatedPay,
        dayType: savedCalcValues.dayType as any,
      };
    } else {
      payResult = calculateDailyAttendancePayroll({
        workType: form.workType,
        dailyWage: wage,
        workMinutes: workMin,
        nightMinutes: nightMin,
        dayType,
      });
    }

    let finalPay = payResult.calculatedPay;
    const manualFinal = parseInt(form.finalPay);
    if (manualFinal > 0 && manualFinal !== payResult.calculatedPay) {
      if (!form.adjustmentMemo.trim()) {
        toast.error("시스템 계산값과 다른 금액을 입력할 경우 수정 사유를 입력해야 합니다.");
        return;
      }
      finalPay = manualFinal;
    }

    const fingerprint = await generateFingerprint(
      resolvedSiteId,
      currentIdentityKey,
      selectedDate,
      startTime,
      endTime,
      workHoursInput,
      finalPay,
    );

    const snapshot = createSnapshot({
      workType: form.workType,
      dailyWage: wage,
      calculatedPay: payResult.calculatedPay,
      hourlyRate: form.workType === "hourly" ? wage : undefined,
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

    const mealAmt = parseInt(form.mealAllowance) || 0;
    const vehicleAmt = parseInt(form.vehicleAllowance) || 0;
    const extraAmt = parseInt(form.extraNonTaxableAllowance) || 0;
    const yearMonthPrefix = selectedDate.slice(0, 7);

    const sameMonthWorkerRecords = records.filter(
      (r) =>
        r.worker_name === form.workerName.trim() &&
        r.work_date.startsWith(yearMonthPrefix) &&
        (editingId ? r.id !== editingId : true),
    );

    const mealMonthlyAccum = sameMonthWorkerRecords.reduce(
      (sum, r) => sum + (((r as any).meal_allowance_amount as number) || 0),
      0,
    );

    const vehicleMonthlyAccum = sameMonthWorkerRecords.reduce(
      (sum, r) => sum + (((r as any).vehicle_allowance_amount as number) || 0),
      0,
    );

    const { data: workerInsuranceData } = await supabase
      .from("worker_insurance_settings")
      .select("apply_national_pension, apply_health_insurance, apply_employment_insurance")
      .eq("organization_id", currentOrganization.id)
      .eq("worker_key", currentWorkerKey)
      .maybeSingle();

    const mergedSettings = {
      ...dailyPayrollSettings,
      apply_national_pension: workerInsuranceData?.apply_national_pension ?? false,
      apply_health_insurance: workerInsuranceData?.apply_health_insurance ?? false,
      apply_employment_insurance: workerInsuranceData?.apply_employment_insurance ?? true,
    };

    const taxResult = calculateDailyTax(
      payResult.calculatedPay + mealAmt + vehicleAmt + extraAmt,
      mergedSettings,
      "employment_income",
      {
        totalWage: payResult.calculatedPay + mealAmt + vehicleAmt + extraAmt,
        overtimePay: payResult.overtimePay ?? 0,
        nightPay: payResult.nightPay ?? 0,
        holidayPay: payResult.holidayPay ?? 0,
        mealAllowance: mealAmt,
        vehicleAllowance: vehicleAmt,
        extraNonTaxableAllowance: extraAmt,
        isProductionWorkerTaxExempt: dailyPayrollSettings.production_worker_tax_exempt ?? true,
        mealMonthlyAccum,
        vehicleMonthlyAccum,
      },
    );

    const originalRecord = editingId ? records.find((r) => r.id === editingId) : null;

    const record = {
      organization_id: currentOrganization.id,
      site_id: resolvedSiteId,
      worker_name: form.workerName.trim(),
      ssn_encrypted: null,
      ssn_masked: ssnMasked,
      ssn_last4: ssnLast4,
      phone: form.phone || null,
      work_date: selectedDate,
      work_type: form.workType,
      start_time: startTime,
      end_time: endTime,
      work_hours: workHoursInput ?? workMin / 60,
      work_minutes: workMin,
      break_minutes: breakMin,
      daily_wage: wage,
      calculated_pay: payResult.calculatedPay,
      final_pay: finalPay,
      adjustment_memo: form.adjustmentMemo || "",
      regular_hours: payResult.regularHours,
      overtime_hours: payResult.overtimeHours,
      night_hours: payResult.nightHours,
      overtime_pay: payResult.overtimePay,
      night_pay: payResult.nightPay,
      holiday_hours: payResult.holidayHours,
      holiday_pay: payResult.holidayPay,
      income_tax: taxResult.incomeTax,
      local_income_tax: taxResult.localIncomeTax,
      employment_insurance: taxResult.employmentInsurance,
      national_pension: taxResult.nationalPension,
      health_insurance: taxResult.healthInsurance,
      long_term_care_insurance: taxResult.longTermCareInsurance,
      industrial_accident: taxResult.industrialAccident,
      total_deductions: taxResult.totalDeductions,
      net_pay: taxResult.netPay,
      fingerprint,
      calculation_snapshot: snapshot,
      memo: form.memo || "",
      job_type: form.jobType || "보통인부",
      meal_allowance_amount: mealAmt,
      vehicle_allowance_amount: vehicleAmt,
      extra_non_taxable_allowance_amount: extraAmt,
      extra_non_taxable_allowance_name: extraAmt > 0 ? dailyPayrollSettings.extra_non_taxable_name || null : null,
    };

    try {
      if (editingId) {
        const updates =
          editingId && !useRecalcMode
            ? (() => {
                const { calculation_snapshot, ...rest } = record;
                return rest;
              })()
            : record;

        await updateRecord.mutateAsync({ id: editingId, updates });

        const updatedRecordForCalc = {
          ...(originalRecord as any),
          ...updates,
          id: editingId,
        };

        const weeklyResultsMap = new Map<string, any>();

        if (originalRecord && originalRecord.work_type === "hourly") {
          const originalWorkerKey = resolveWorkerKey({
            worker_name: originalRecord.worker_name,
            ssn_masked: originalRecord.ssn_masked,
            phone: originalRecord.phone,
          });

          const { data: allOrgRecordsForOriginal } = await supabase
            .from("daily_attendance")
            .select("*")
            .eq("organization_id", currentOrganization.id)
            .eq("work_type", "hourly");

          const originalWeeklyResult = calculateWeeklyHolidayEligibility({
            organizationId: currentOrganization.id,
            workerKey: originalWorkerKey,
            workerName: originalRecord.worker_name,
            targetDate: originalRecord.work_date,
            records: (allOrgRecordsForOriginal || []) as any,
            weeklyWorkDayList: dailyPayrollSettings.weekly_work_day_list || [],
            weeklyHoliday: dailyPayrollSettings.weekly_holiday || "sun",
            weeklyWorkHours: dailyPayrollSettings.weekly_work_hours || 40,
          });

          weeklyResultsMap.set(
            `${originalWeeklyResult.organization_id}|${originalWeeklyResult.worker_key}|${originalWeeklyResult.week_start}`,
            originalWeeklyResult,
          );
        }

        if (form.workType === "hourly") {
          const { data: allOrgRecordsForCurrent } = await supabase
            .from("daily_attendance")
            .select("*")
            .eq("organization_id", currentOrganization.id)
            .eq("work_type", "hourly");

          const currentWeeklyResult = calculateWeeklyHolidayEligibility({
            organizationId: currentOrganization.id,
            workerKey: currentWorkerKey,
            workerName: form.workerName.trim(),
            targetDate: selectedDate,
            records: (allOrgRecordsForCurrent || []) as any,
            weeklyWorkDayList: dailyPayrollSettings.weekly_work_day_list || [],
            weeklyHoliday: dailyPayrollSettings.weekly_holiday || "sun",
            weeklyWorkHours: dailyPayrollSettings.weekly_work_hours || 40,
          });

          weeklyResultsMap.set(
            `${currentWeeklyResult.organization_id}|${currentWeeklyResult.worker_key}|${currentWeeklyResult.week_start}`,
            currentWeeklyResult,
          );
        }

        for (const weeklyResult of weeklyResultsMap.values()) {
          await upsertWeeklyHolidayPayRecord(weeklyResult);
        }
      } else {
        await insertRecord.mutateAsync(record as any);

        if (form.workType === "hourly") {
          const { data: allOrgRecords } = await supabase
            .from("daily_attendance")
            .select("*")
            .eq("organization_id", currentOrganization.id)
            .eq("work_type", "hourly");

          const recordsForWeeklyCalc = [...(allOrgRecords || []), record as any];

          const weeklyHolidayResult = calculateWeeklyHolidayEligibility({
            organizationId: currentOrganization.id,
            workerKey: currentWorkerKey,
            workerName: form.workerName.trim(),
            targetDate: selectedDate,
            records: recordsForWeeklyCalc as any,
            weeklyWorkDayList: dailyPayrollSettings.weekly_work_day_list || [],
            weeklyHoliday: dailyPayrollSettings.weekly_holiday || "sun",
            weeklyWorkHours: dailyPayrollSettings.weekly_work_hours || 40,
          });

          await upsertWeeklyHolidayPayRecord(weeklyHolidayResult);
        }
      }
    } catch (e: any) {
      console.error("저장 오류:", e);
      const msg = e?.message || e?.error_description || JSON.stringify(e);
      toast.error("저장 오류: " + msg);
      return;
    }

    setDialogOpen(false);
  }, [
    currentOrganization,
    resolvedSiteId,
    selectedDate,
    form,
    editingId,
    useRecalcMode,
    savedCalcValues,
    records,
    recordsByDate,
    insertRecord,
    updateRecord,
    dailyPayrollSettings,
  ]);

  const ssnAgeWarning = useMemo(() => {
    if (!form.ssnInput || form.ssnInput.length < 7) return null;
    return calculateAgeFromSsn(form.ssnInput);
  }, [form.ssnInput]);

  const previewCalc = useMemo(() => {
    const wage = parseInt(form.dailyWage) || 0;
    if (wage <= 0) return null;
    const breakMin = parseInt(form.breakMinutes) || 0;
    const startTime = form.inputMode === "time" ? normalizeTo24h(form.startTime) : null;
    const endTime = form.inputMode === "time" ? normalizeTo24h(form.endTime) : null;
    const workHoursInput =
      form.inputMode === "hours" || form.inputMode === "manday" ? parseFloat(form.workHours) || null : null;

    const { workMin } = calculateWorkMinutes(startTime, endTime, workHoursInput, breakMin);
    if (workMin <= 0) return null;

    let nightMin = 0;
    if (startTime && endTime) {
      const sMin = toMinutes(startTime);
      const eMin = adjustEndTime(sMin, toMinutes(endTime));
      nightMin = calculateNightMinutes(sMin, eMin);
      if (nightMin > workMin) nightMin = workMin;
    }

    const dayType = selectedDate
      ? classifyDayType(
          selectedDate,
          dailyPayrollSettings.weekly_work_day_list || [],
          dailyPayrollSettings.weekly_holiday || "sun",
          dailyPayrollSettings.non_work_day_default_type || "REST_DAY",
        )
      : ("workday" as const);

    return calculateDailyAttendancePayroll({
      workType: form.workType,
      dailyWage: wage,
      workMinutes: workMin,
      nightMinutes: nightMin,
      dayType,
    });
  }, [form, selectedDate, dailyPayrollSettings]);

  const settingsDiffNotice = useMemo(() => {
    if (!editingId || !savedCalcValues || !previewCalc) return null;
    const diffs: { label: string; diff: number }[] = [];
    const totalDiff = previewCalc.calculatedPay - savedCalcValues.calculatedPay;
    const holidayDiff = previewCalc.holidayPay - savedCalcValues.holidayPay;
    const overtimeDiff = previewCalc.overtimePay - savedCalcValues.overtimePay;
    const nightDiff = previewCalc.nightPay - savedCalcValues.nightPay;
    if (Math.abs(holidayDiff) > 0) diffs.push({ label: "휴일수당", diff: holidayDiff });
    if (Math.abs(overtimeDiff) > 0) diffs.push({ label: "연장수당", diff: overtimeDiff });
    if (Math.abs(nightDiff) > 0) diffs.push({ label: "야간수당", diff: nightDiff });
    const dayTypeChanged = previewCalc.dayType !== savedCalcValues.dayType;
    if (diffs.length === 0 && Math.abs(totalDiff) === 0 && !dayTypeChanged) return null;
    const sorted = [...diffs].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const top = sorted.slice(0, 2);
    const messages: string[] = [];
    if (top.length > 0) {
      top.forEach((d) => {
        const sign = d.diff > 0 ? "+" : "";
        const verb = d.diff > 0 ? "추가됩니다" : "제거됩니다";
        messages.push(`${d.label}이 ${verb} (${sign}${new Intl.NumberFormat("ko-KR").format(d.diff)} 예상)`);
      });
    } else if (Math.abs(totalDiff) > 0) {
      const sign = totalDiff > 0 ? "+" : "";
      messages.push(`지급총액이 변경됩니다 (${sign}${new Intl.NumberFormat("ko-KR").format(totalDiff)} 예상)`);
    } else if (dayTypeChanged) {
      messages.push(`날짜 성격이 변경되었습니다 (${savedCalcValues.dayType} → ${previewCalc.dayType})`);
    }
    return messages;
  }, [editingId, savedCalcValues, previewCalc]);

  const displayCalc = useMemo(() => {
    if (!editingId || useRecalcMode) return previewCalc;
    return savedCalcValues;
  }, [editingId, useRecalcMode, previewCalc, savedCalcValues]);

  const handleNewSite = async () => {
    if (!newSiteName.trim()) return;
    try {
      const result = await createSite.mutateAsync({ site_name: newSiteName.trim() });
      if (result) {
        setSelectedSiteId(result.site_id);
      }
      setNewSiteDialogOpen(false);
      setNewSiteName("");
    } catch {}
  };

  const summary = useMemo(() => {
    const totalDays = new Set(records.map((r) => r.work_date)).size;
    const totalFinalPay = records.reduce((s, r) => {
      const meal = Number((r as any).meal_allowance_amount ?? 0);
      const vehicle = Number((r as any).vehicle_allowance_amount ?? 0);
      const extra = Number((r as any).extra_non_taxable_allowance_amount ?? 0);
      return s + r.final_pay + meal + vehicle + extra;
    }, 0);
    return { totalDays, totalFinalPay, totalRecords: records.length };
  }, [records]);

  const formatCurrency = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={prevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-base font-semibold w-[120px] text-center">
                {year}년 {month}월
              </span>
              <Button variant="ghost" size="icon" onClick={nextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="min-w-[200px]">
              <Label className="text-xs">현장 선택</Label>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                <SelectTrigger>
                  <SelectValue placeholder="현장 선택" />
                </SelectTrigger>
                <SelectContent>
                  {activeSites.map((s) => (
                    <SelectItem key={s.site_id} value={s.site_id}>
                      {s.site_name}
                    </SelectItem>
                  ))}
                  <div className="border-t mt-1 pt-1">
                    <button
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-primary hover:bg-accent rounded"
                      onClick={() => setNewSiteDialogOpen(true)}
                    >
                      <Plus className="w-3 h-3" /> 새 현장 추가
                    </button>
                  </div>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">기본 휴게시간(분)</Label>
              <Input
                type="number"
                className="w-[80px]"
                value={defaultBreak}
                onChange={(e) => setDefaultBreak(e.target.value)}
              />
            </div>

            <div className="ml-auto flex items-center gap-4 text-sm">
              <span>
                근무일수: <strong>{summary.totalDays}일</strong>
              </span>
              <span>
                총건수: <strong>{summary.totalRecords}건</strong>
              </span>
              <span>
                지급총액: <strong>{formatCurrency(summary.totalFinalPay)}원</strong>
              </span>
              <AttendanceLockButton
                siteId={resolvedSiteId}
                yearMonth={resolvedYearMonth}
                isLocked={isLocked}
                lockAttendance={lockAttendanceProp}
                unlockAttendance={unlockAttendanceProp}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {workerDayCounts.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            ⚠ {workerDayCounts.map((w) => `${w.name}(${w.days}일)`).join(", ")} — 월 {workdayWarningThreshold}일 이상
            근무로 국민연금/건강보험 가입 대상
          </AlertDescription>
        </Alert>
      )}

      {(() => {
        const ageWarningWorkers = records.reduce<{ name: string; message: string }[]>((acc, r) => {
          const ssnRaw = r.ssn_masked;
          if (!ssnRaw) return acc;
          const ageResult = calculateAgeFromSsn(ssnRaw);
          if (!ageResult) return acc;

          const alreadyAdded = acc.some((w) => w.name === r.worker_name);
          if (alreadyAdded) return acc;

          if (ageResult.isOver65) {
            acc.push({
              name: r.worker_name,
              message: `${r.worker_name} — 만 ${ageResult.age}세 / 국민연금 신규가입 불가 / 고용보험 면제 대상`,
            });
          } else if (ageResult.isOver60) {
            acc.push({
              name: r.worker_name,
              message: `${r.worker_name} — 만 ${ageResult.age}세 / 국민연금 신규가입 불가`,
            });
          }
          return acc;
        }, []);

        if (ageWarningWorkers.length === 0) return null;

        return (
          <Alert variant="destructive" className="border-orange-300 bg-orange-50">
            <AlertTriangle className="w-4 h-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              {ageWarningWorkers.map((w, i) => (
                <div key={`${w.name}-${i}`}>⚠ {w.message}</div>
              ))}
            </AlertDescription>
          </Alert>
        );
      })()}

      {!selectedSiteId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">현장을 선택해주세요.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {DAY_NAMES.map((d, i) => (
            <div
              key={d}
              className={cn(
                "text-center text-xs font-medium py-1",
                i === 0 && "text-destructive",
                i === 6 && "text-blue-500",
              )}
            >
              {d}
            </div>
          ))}

          {Array.from({ length: getDay(new Date(year, month - 1, 1)) }, (_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {calendarDays.map(({ day, dateStr, dayOfWeek }) => {
            const dayRecords = recordsByDate[dateStr] || [];
            const hasRecords = dayRecords.length > 0;
            const dayTotal = dayRecords.reduce((s, r) => {
              const meal = Number((r as any).meal_allowance_amount ?? 0);
              const vehicle = Number((r as any).vehicle_allowance_amount ?? 0);
              const extra = Number((r as any).extra_non_taxable_allowance_amount ?? 0);
              return s + r.final_pay + meal + vehicle + extra;
            }, 0);
            const hasOvertime = dayRecords.some((r) => r.overtime_hours > 0 && r.work_type === "fixed");

            return (
              <div
                key={dateStr}
                className={cn(
                  "border rounded-md p-1 min-h-[80px] text-xs cursor-pointer transition-colors hover:bg-accent/50",
                  hasRecords && "bg-blue-50 dark:bg-blue-950/30",
                  hasOvertime && "ring-1 ring-yellow-400",
                  dayOfWeek === 0 && "text-destructive",
                  dayOfWeek === 6 && "text-blue-500",
                )}
                onClick={() => !isLocked && openEntryDialog(dateStr)}
              >
                <div className="font-medium">{day}</div>
                {dayRecords.map((r) => (
                  <TooltipProvider key={r.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "truncate text-xs leading-snug py-0.5 px-0.5 rounded cursor-pointer hover:bg-accent font-semibold",
                            r.calculated_pay !== r.final_pay && "text-amber-600",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(r);
                          }}
                        >
                          {r.worker_name}
                          {" / "}
                          {formatCurrency(
                            r.final_pay +
                              Number((r as any).meal_allowance_amount ?? 0) +
                              Number((r as any).vehicle_allowance_amount ?? 0) +
                              Number((r as any).extra_non_taxable_allowance_amount ?? 0),
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-0.5">
                          <div>{r.worker_name}</div>
                          {r.start_time && r.end_time && (
                            <div>
                              {r.start_time}~{r.end_time}
                            </div>
                          )}
                          <div>인정: {Math.round((r.work_minutes / 60) * 10) / 10}h</div>
                          <div>지급: {formatCurrency(r.final_pay)}원</div>
                          {r.calculated_pay !== r.final_pay && (
                            <div className="text-amber-500">⚠ 수정됨: {r.adjustment_memo}</div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
                {hasRecords && dayRecords.length > 0 && (
                  <div className="text-[11px] text-muted-foreground mt-0.5 border-t pt-0.5">
                    합계: {formatCurrency(dayTotal)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {selectedDate} 근태 {editingId ? "수정" : "입력"}
            </DialogTitle>
            <DialogDescription>현장 근무 기록을 입력합니다.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>인부 이름 *</Label>
                <Input
                  value={form.workerName}
                  onChange={(e) => setForm((f) => ({ ...f, workerName: e.target.value }))}
                  placeholder="홍길동"
                />
              </div>
              <div>
                <Label>연락처</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="010-0000-0000"
                />
              </div>
            </div>

            <div>
              <Label>직종</Label>
              <Select value={form.jobType} onValueChange={(val) => setForm((f) => ({ ...f, jobType: val }))}>
                <SelectTrigger>
                  <SelectValue placeholder="직종 선택" />
                </SelectTrigger>
                <SelectContent>
                  {jobTypes.map((j) => (
                    <SelectItem key={j.id} value={j.name}>
                      {j.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>주민등록번호</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={ssnFocused ? formatSsnEditable(form.ssnInput) : formatSsnMasked(form.ssnInput)}
                onFocus={() => setSsnFocused(true)}
                onBlur={() => setSsnFocused(false)}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    ssnInput: normalizeSsnDigits(e.target.value),
                  }))
                }
                placeholder="800101-1234567"
              />
              <p className="text-[10px] text-muted-foreground mt-1">마스킹 저장됩니다. (800101-1******)</p>
              {ssnAgeWarning?.isAgeWarning && (
                <div className="flex items-center gap-1.5 mt-1.5 p-2 rounded-md bg-amber-50 border border-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <p className="text-[11px] text-amber-700">{ssnAgeWarning.warningMessage}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>급여 유형</Label>
                <Select
                  value={form.workType}
                  onValueChange={(v: "fixed" | "hourly") =>
                    setForm((f) => ({
                      ...f,
                      workType: v,
                      inputMode: v === "fixed" ? "hours" : f.inputMode,
                    }))
                  }
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
                <Label>{form.workType === "fixed" ? "일당 (원)" : "시급 (원)"} *</Label>
                <Input
                  type="number"
                  value={form.dailyWage}
                  onChange={(e) => setForm((f) => ({ ...f, dailyWage: e.target.value }))}
                  placeholder={form.workType === "fixed" ? "150000" : "10000"}
                />
              </div>
            </div>

            {form.workType === "hourly" ? (
              <>
                <div className="flex gap-2">
                  <Button
                    variant={form.inputMode === "time" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setForm((f) => ({ ...f, inputMode: "time" }))}
                  >
                    <Clock className="w-3 h-3 mr-1" /> 출퇴근시각
                  </Button>
                  <Button
                    variant={form.inputMode === "hours" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setForm((f) => ({ ...f, inputMode: "hours" }))}
                  >
                    <DollarSign className="w-3 h-3 mr-1" /> 시간수 직접입력
                  </Button>
                </div>

                {form.inputMode === "time" ? (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>출근</Label>
                      <Input
                        type="time"
                        value={form.startTime}
                        onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>퇴근</Label>
                      <Input
                        type="time"
                        value={form.endTime}
                        onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>휴게(분)</Label>
                      <Input
                        type="number"
                        value={form.breakMinutes}
                        onChange={(e) => setForm((f) => ({ ...f, breakMinutes: e.target.value }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>근무시간 (h)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={form.workHours}
                        onChange={(e) => setForm((f) => ({ ...f, workHours: e.target.value }))}
                        placeholder="8.0"
                      />
                    </div>
                    <div>
                      <Label>휴게(분)</Label>
                      <Input
                        type="number"
                        value={form.breakMinutes}
                        onChange={(e) => setForm((f) => ({ ...f, breakMinutes: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* 공수 선택 버튼 */}
                <div>
                  <Label>공수</Label>
                  <div className="flex gap-2 mt-1">
                    {[0.5, 1.0, 1.5, 2.0].map((md) => (
                      <Button
                        key={md}
                        type="button"
                        variant={form.inputMode === "manday" && form.manDay === md ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          const hours = md * 8;
                          setForm((f) => ({
                            ...f,
                            manDay: md,
                            workHours: String(hours),
                            inputMode: "manday",
                          }));
                        }}
                      >
                        {md}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant={form.inputMode === "hours" ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setForm((f) => ({ ...f, inputMode: "hours" }))}
                    >
                      직접입력
                    </Button>
                  </div>
                </div>

                {/* 근무시간 표시 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>근무시간 (h)</Label>
                    {form.inputMode === "manday" ? (
                      <Input
                        type="number"
                        value={form.workHours}
                        readOnly
                        className="bg-muted text-muted-foreground cursor-not-allowed"
                      />
                    ) : (
                      <Input
                        type="number"
                        step="0.5"
                        value={form.workHours}
                        onChange={(e) => {
                          const h = parseFloat(e.target.value) || 0;
                          const md = Math.round((h / 8) * 100) / 100;
                          setForm((f) => ({
                            ...f,
                            workHours: e.target.value,
                            manDay: md,
                          }));
                        }}
                        placeholder="8.0"
                      />
                    )}
                  </div>
                  <div>
                    <Label>휴게(분)</Label>
                    <Input
                      type="number"
                      value={form.breakMinutes}
                      onChange={(e) => setForm((f) => ({ ...f, breakMinutes: e.target.value }))}
                    />
                  </div>
                </div>

                {/* 공수 기준 지급액 미리보기 */}
                {form.inputMode === "manday" && parseInt(form.dailyWage) > 0 && (
                  <div className="text-xs text-muted-foreground bg-muted rounded px-3 py-2">
                    {form.manDay}공수 × 일당 {parseInt(form.dailyWage).toLocaleString("ko-KR")}원 기준
                    {form.manDay > 1.0 && (
                      <span className="ml-1 text-amber-600">
                        (연장 {(form.manDay - 1.0) * 8}h 포함, 가산수당 별도 계산)
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            {editingId && !useRecalcMode && settingsDiffNotice && settingsDiffNotice.length > 0 && (
              <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                  {settingsDiffNotice.map((msg, i) => (
                    <div key={i}>※ 현재 설정 기준으로 다시 계산하면 {msg}</div>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            {editingId && useRecalcMode && (
              <Alert className="border-blue-300 bg-blue-50 dark:bg-blue-950/20">
                <AlertDescription className="text-xs text-blue-700 dark:text-blue-400">
                  ※ 현재 설정 기준으로 다시 계산되었습니다. 아직 저장되지 않았습니다.
                </AlertDescription>
              </Alert>
            )}

            {displayCalc && (
              <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                <div className="font-medium flex justify-between">
                  <span className="flex items-center gap-1.5">
                    {editingId && !useRecalcMode ? "저장된 계산액" : "시스템 계산액 (근로수당)"}
                    {form.workType === "hourly" &&
                      (displayCalc.dayType === "weekly_holiday" || displayCalc.dayType === "unpaid_holiday") && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 font-normal">
                          {displayCalc.dayType === "weekly_holiday" ? "주휴일" : "휴일"}
                        </span>
                      )}
                    {form.workType === "hourly" && displayCalc.dayType === "offday" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 font-normal">
                        휴무일
                      </span>
                    )}
                  </span>
                  <span>{formatCurrency(displayCalc.calculatedPay)}원</span>
                </div>

                {form.workType === "hourly" && (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>정규 ({displayCalc.regularHours}h)</span>
                      <span>{formatCurrency(displayCalc.regularPay)}원</span>
                    </div>
                    {displayCalc.overtimePay > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>연장 ({displayCalc.overtimeHours}h × 1.5)</span>
                        <span>{formatCurrency(displayCalc.overtimePay)}원</span>
                      </div>
                    )}
                    {displayCalc.nightPay > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>야간 ({displayCalc.nightHours}h × 0.5)</span>
                        <span>{formatCurrency(displayCalc.nightPay)}원</span>
                      </div>
                    )}
                    {displayCalc.holidayPay > 0 && (
                      <div className="flex justify-between text-orange-600 dark:text-orange-400">
                        <span>휴일 ({displayCalc.holidayHours}h 이내 × 0.5)</span>
                        <span>{formatCurrency(displayCalc.holidayPay)}원</span>
                      </div>
                    )}
                  </>
                )}

                {(() => {
                  const mealAmt = parseInt(form.mealAllowance) || 0;
                  const vehicleAmt = parseInt(form.vehicleAllowance) || 0;
                  const extraAmt = parseInt(form.extraNonTaxableAllowance) || 0;
                  const allowanceTotal = mealAmt + vehicleAmt + extraAmt;
                  const grossTotal = displayCalc.calculatedPay + allowanceTotal;
                  return allowanceTotal > 0 ? (
                    <>
                      <div className="flex justify-between text-emerald-600">
                        <span>비과세 수당</span>
                        <span>+{formatCurrency(allowanceTotal)}원</span>
                      </div>
                      <div className="border-t pt-1 flex justify-between font-bold">
                        <span>총 지급액</span>
                        <span>{formatCurrency(grossTotal)}원</span>
                      </div>
                    </>
                  ) : null;
                })()}
              </div>
            )}

            {editingId && !useRecalcMode && settingsDiffNotice && settingsDiffNotice.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs gap-1.5"
                onClick={() => {
                  if (!previewCalc) return;

                  setUseRecalcMode(true);

                  setForm((prev) => ({
                    ...prev,
                    finalPay: String(previewCalc.calculatedPay),
                    adjustmentMemo: "",
                  }));
                }}
              >
                <AlertTriangle className="w-3 h-3" />
                현재 설정으로 다시 계산
              </Button>
            )}

            <div>
              <Label>
                {form.finalPay && displayCalc && parseInt(form.finalPay) !== displayCalc.calculatedPay
                  ? "수동 조정 지급액 (원)"
                  : "지급액 (원)"}
              </Label>
              <Input
                type="number"
                value={form.finalPay}
                onChange={(e) => setForm((f) => ({ ...f, finalPay: e.target.value }))}
                placeholder={displayCalc ? String(displayCalc.calculatedPay) : ""}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {form.finalPay && displayCalc && parseInt(form.finalPay) !== displayCalc.calculatedPay
                  ? "시스템 계산액과 다르게 입력되었습니다. 저장 시 수정 사유가 필요합니다."
                  : "시스템 계산액과 동일한 지급액입니다. 필요 시만 수정하세요."}
              </p>
            </div>

            {form.finalPay && displayCalc && parseInt(form.finalPay) !== displayCalc.calculatedPay && (
              <div>
                <Label className="text-amber-600">수정 사유 (필수)</Label>
                <Input
                  value={form.adjustmentMemo}
                  onChange={(e) => setForm((f) => ({ ...f, adjustmentMemo: e.target.value }))}
                  placeholder="예: 현장 소장 합의에 따른 추가 지급"
                />
              </div>
            )}

            {(dailyPayrollSettings.enable_meal_allowance ||
              dailyPayrollSettings.enable_vehicle_allowance ||
              dailyPayrollSettings.enable_extra_non_taxable) && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">비과세 항목</Label>
                <div className="grid grid-cols-3 gap-3">
                  {dailyPayrollSettings.enable_meal_allowance && (
                    <div>
                      <Label className="text-xs">식대 (원)</Label>
                      <Input
                        type="number"
                        value={form.mealAllowance}
                        onChange={(e) => setForm((f) => ({ ...f, mealAllowance: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  )}
                  {dailyPayrollSettings.enable_vehicle_allowance && (
                    <div>
                      <Label className="text-xs">차량운전보조금 (원)</Label>
                      <Input
                        type="number"
                        value={form.vehicleAllowance}
                        onChange={(e) => setForm((f) => ({ ...f, vehicleAllowance: e.target.value }))}
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
                        value={form.extraNonTaxableAllowance}
                        onChange={(e) => setForm((f) => ({ ...f, extraNonTaxableAllowance: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <Label>메모</Label>
              <Input
                value={form.memo}
                onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                placeholder="비고"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            {editingId && (
              <Button
                variant="destructive"
                size="sm"
                disabled={isLocked}
                onClick={async () => {
                  if (!editingId) return;
                  if (!confirm("삭제하시겠습니까?")) return;

                  const deletingRecord = records.find((r) => r.id === editingId);
                  if (!deletingRecord) {
                    await deleteRecord.mutateAsync(editingId);
                    setDialogOpen(false);
                    return;
                  }

                  const deletingWorkerKey = resolveWorkerKey({
                    worker_name: deletingRecord.worker_name,
                    ssn_masked: deletingRecord.ssn_masked,
                    phone: deletingRecord.phone,
                  });

                  await deleteRecord.mutateAsync(editingId);

                  if (deletingRecord.work_type === "hourly") {
                    const { data: allOrgRecordsForDelete } = await supabase
                      .from("daily_attendance")
                      .select("*")
                      .eq("organization_id", currentOrganization!.id)
                      .eq("work_type", "hourly");

                    const weeklyHolidayResult = calculateWeeklyHolidayEligibility({
                      organizationId: currentOrganization!.id,
                      workerKey: deletingWorkerKey,
                      workerName: deletingRecord.worker_name,
                      targetDate: deletingRecord.work_date,
                      records: (allOrgRecordsForDelete || []) as any,
                      weeklyWorkDayList: dailyPayrollSettings.weekly_work_day_list || [],
                      weeklyHoliday: dailyPayrollSettings.weekly_holiday || "sun",
                      weeklyWorkHours: dailyPayrollSettings.weekly_work_hours || 40,
                    });

                    await upsertWeeklyHolidayPayRecord(weeklyHolidayResult);
                  }

                  setDialogOpen(false);
                }}
              >
                <Trash2 className="w-4 h-4 mr-1" /> 삭제
              </Button>
            )}

            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              취소
            </Button>

            <Button onClick={handleSave} disabled={isLocked}>
              <Save className="w-4 h-4 mr-1" /> {editingId ? "수정" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newSiteDialogOpen} onOpenChange={setNewSiteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>새 현장 추가</DialogTitle>
            <DialogDescription>새 현장을 빠르게 등록합니다.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>현장명</Label>
            <Input value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} placeholder="예: 강남 B현장" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewSiteDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleNewSite} disabled={!newSiteName.trim()}>
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
