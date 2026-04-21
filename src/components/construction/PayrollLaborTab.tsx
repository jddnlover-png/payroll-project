/**
 * 급여 관리 / 노무대장 출력 (Tab 3)
 * - 현장별 급여 집계
 * - 법정양식 노무대장 PDF 출력
 * - 직원별 필터링
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConstructionSites } from "@/hooks/useConstructionSites";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import type { DailyAttendanceRecord } from "@/hooks/useDailyAttendance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Printer, FileText, AlertTriangle, DollarSign, ChevronLeft, ChevronRight } from "lucide-react";
import { calculateAgeFromSsn } from "@/utils/ssnAgeCalculation";
import { useDailyPayrollSettings } from "@/hooks/useDailyPayrollSettings";
import { WorkerPayslip } from "./WorkerPayslip";
import { LaborReportPrint } from "./LaborReportPrint";
import { toast } from "sonner";
import { useWorkerInsuranceSettings } from "@/hooks/useWorkerInsuranceSettings";

async function recalculateWorkerTax(
  organizationId: string,
  workerKey: string,
  yearMonth: string,
  insuranceSetting: {
    apply_national_pension: boolean;
    apply_health_insurance: boolean;
    apply_employment_insurance: boolean;
  },
  dpSettings: any,
) {
  const [year, month] = yearMonth.split("-").map(Number);
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // 해당 직원 이번달 근태 전체 조회
  const { data: attendanceRecords } = await supabase
    .from("daily_attendance")
    .select("*")
    .eq("organization_id", organizationId)
    .gte("work_date", startDate)
    .lte("work_date", endDate);

  if (!attendanceRecords) return;

  // workerKey에 해당하는 행만 필터
  const workerRecords = attendanceRecords.filter((r: any) => {
    const key = r.ssn_masked
      ? `SSN:${r.ssn_masked}`
      : r.phone
        ? `PHONE:${String(r.phone).replace(/[^0-9]/g, "")}`
        : `NAME:${String(r.worker_name || "").trim()}`;
    return key === workerKey;
  });

  // 병합된 설정값
  const mergedSettings = {
    ...dpSettings,
    apply_national_pension: insuranceSetting.apply_national_pension,
    apply_health_insurance: insuranceSetting.apply_health_insurance,
    apply_employment_insurance: insuranceSetting.apply_employment_insurance,
  };

  // 각 행 재계산 후 업데이트
  for (const record of workerRecords) {
    const mealAmt = Number(record.meal_allowance_amount ?? 0);
    const vehicleAmt = Number(record.vehicle_allowance_amount ?? 0);
    const extraAmt = Number(record.extra_non_taxable_allowance_amount ?? 0);
    const totalPay = Number(record.calculated_pay) + mealAmt + vehicleAmt + extraAmt;

    const { calculateDailyTax } = await import("@/utils/dailyTaxCalculation");
    const taxResult = calculateDailyTax(totalPay, mergedSettings, "employment_income", {
      totalWage: totalPay,
      overtimePay: Number(record.overtime_pay ?? 0),
      nightPay: Number(record.night_pay ?? 0),
      holidayPay: Number(record.holiday_pay ?? 0),
      mealAllowance: mealAmt,
      vehicleAllowance: vehicleAmt,
      extraNonTaxableAllowance: extraAmt,
      isProductionWorkerTaxExempt: dpSettings.production_worker_tax_exempt ?? false,
    });

    await supabase
      .from("daily_attendance")
      .update({
        income_tax: taxResult.incomeTax,
        local_income_tax: taxResult.localIncomeTax,
        employment_insurance: taxResult.employmentInsurance,
        national_pension: taxResult.nationalPension,
        health_insurance: taxResult.healthInsurance,
        long_term_care_insurance: taxResult.longTermCareInsurance,
        industrial_accident: taxResult.industrialAccident,
        total_deductions: taxResult.totalDeductions,
        net_pay: taxResult.netPay,
      })
      .eq("id", record.id);
  }
}

/* ── helpers ── */

/**
 * 유급휴일 가산분 참고 계산 (표시 전용, 총액/공제 미반영)
 * - 기본급(1.0)과 야간가산(0.5)은 이미 별도 컬럼에 있으므로
 *   여기서는 휴일 가산분만 계산:
 *   8h 이내: 시급 × 시간 × 0.5
 *   8h 초과: 시급 × 8h × 0.5 + 시급 × 초과시간 × 1.0
 */

/** Safe HH:MM → minutes (24h only, null → 0) */
function safeToMinutes(t: string | null | undefined): number {
  if (!t) return 0;
  const cleaned = String(t).trim();
  let h = 0,
    m = 0;
  if (cleaned.includes(":")) {
    const parts = cleaned.split(":");
    if (parts.length !== 2) return 0;
    h = Number(parts[0]);
    m = Number(parts[1]);
  } else if (cleaned.length === 4) {
    h = Number(cleaned.slice(0, 2));
    m = Number(cleaned.slice(2));
  } else {
    return 0;
  }
  if (isNaN(h) || isNaN(m)) return 0;
  if (h === 24 && m === 0) return 1440;
  if (h < 0 || h > 23) return 0;
  if (m < 0 || m >= 60) return 0;
  return h * 60 + m;
}

/** Format work_minutes → display string like "9h" or "9.2h" */
function formatWorkHours(minutes: number | null | undefined): string {
  if (minutes == null || minutes === 0) return "-";
  const h = Math.round((minutes / 60) * 10) / 10;
  return Number.isInteger(h) ? `${h}h` : `${h}h`;
}

/** Format currency: 0 → "-", null → "-", else comma-formatted */
function displayCurrency(n: number | null | undefined): string {
  if (n == null || n === 0) return "-";
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

/** Format date YYYY-MM-DD → YYYY.MM.DD */
function formatDateDot(d: string): string {
  return d.replace(/-/g, ".");
}

/* ── Normalization & Key functions ── */

const normalizeName = (name: string | null | undefined): string => {
  if (name == null) return "";
  return String(name).normalize("NFC").replace(/\s+/g, " ").trim();
};

const normalizeSSN = (val: string | null | undefined): string | null => {
  if (val == null) return null;
  const v = String(val).trim();
  return v === "" || v.toLowerCase() === "null" ? null : v;
};

interface WorkerIdentity {
  worker_name: string;
  ssn_last4?: string | null;
  organization_id?: string;
  site_id?: string;
}

const workerKey = (w: WorkerIdentity | null | undefined): string => {
  if (!w) return "ALL";
  return `name:${normalizeName(w.worker_name)}|ssn:${normalizeSSN(w.ssn_last4) ?? "none"}`;
};

/** Legacy grouping key for print (includes org+site) */
function workerGroupKey(r: {
  worker_name: string;
  ssn_last4?: string | null;
  organization_id: string;
  site_id: string;
}): string {
  return `${r.organization_id}|${r.site_id}|${r.worker_name}|${r.ssn_last4 || ""}`;
}
function getWeekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Extract pay breakdown from a record */
function extractPayBreakdown(r: DailyAttendanceRecord): {
  regularPay: number | null;
  overtimePay: number | null;
  nightPay: number | null;
  holidayPay: number;
} {
  // 1) top-level holiday_pay
  const topHolidayPay = Math.round(Number((r as any).holiday_pay ?? 0));

  const snap = r.calculation_snapshot as any;
  if (snap && snap.pay_breakdown) {
    return {
      regularPay: Math.round(Number(snap.pay_breakdown.regular_pay ?? 0)),
      overtimePay: Math.round(Number(snap.pay_breakdown.overtime_pay ?? 0)),
      nightPay: Math.round(Number(snap.pay_breakdown.night_pay ?? 0)),
      holidayPay: topHolidayPay || Math.round(Number(snap.pay_breakdown.holiday_pay ?? 0)),
    };
  }
  return {
    regularPay: r.calculated_pay != null ? Math.round(Number(r.calculated_pay)) : null,
    overtimePay: null,
    nightPay: null,
    holidayPay: topHolidayPay,
  };
}

/** Recalculate taxes for a row when holiday pay is added */

interface WorkerOption {
  worker_name: string;
  ssn_masked: string | null;
  phone: string | null;
}

export function PayrollLaborTab() {
  const { currentOrganization } = useOrganization();
  const { sites } = useConstructionSites();
  const { settings: dpSettings } = useDailyPayrollSettings();

  const today = new Date();
  const [yearMonth, setYearMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [selectedWorker, setSelectedWorker] = useState<WorkerOption | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [preset, setPreset] = useState<"simple" | "detail" | "summary">("detail");

  const [detailCols, setDetailCols] = useState({
    overtimePay: true,
    nightPay: true,
    weeklyHolidayPay: true,
    holidayPay: true,
    mealAllowance: true,
    vehicleAllowance: true,
    extraNonTaxable: true,
    industrialAccident: false,
  });

  const toggleDetailCol = (key: keyof typeof detailCols) => {
    setDetailCols((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const [showPayslip, setShowPayslip] = useState(false);
  const [showLaborReport, setShowLaborReport] = useState(false); // ← 추가
  const orgId = currentOrganization?.id;
  const {
    upsert: upsertInsurance,
    getSetting,
    isPensionConfirmedForMonth,
    isHealthConfirmedForMonth,
  } = useWorkerInsuranceSettings(orgId);
  const [year, month] = yearMonth.split("-").map(Number);
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const selectedKey = useMemo(() => {
    if (!selectedWorker) return "ALL";
    return selectedWorker.ssn_masked
      ? `SSN:${selectedWorker.ssn_masked}`
      : (selectedWorker as any).phone
        ? `PHONE:${String((selectedWorker as any).phone).replace(/[^0-9]/g, "")}`
        : `NAME:${normalizeName(selectedWorker.worker_name)}`;
  }, [selectedWorker]);

  // Reset worker when site or month changes
  useEffect(() => {
    setSelectedWorker(null);
  }, [selectedSiteId, yearMonth]);

  // ── Worker list query ──
  const { data: workerList = [], refetch: refetchWorkerList } = useQuery({
    queryKey: ["payroll_labor_workers", orgId, selectedSiteId, yearMonth],
    queryFn: async () => {
      if (!orgId) return [];
      let query = supabase
        .from("daily_attendance")
        .select("worker_name, ssn_masked, phone")
        .eq("organization_id", orgId)
        .gte("work_date", startDate)
        .lte("work_date", endDate);

      if (selectedSiteId !== "all") {
        query = query.eq("site_id", selectedSiteId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Deduplicate by normalized name + ssn_last4
      const seen = new Set<string>();
      const unique: WorkerOption[] = [];
      (data || []).forEach((r: any) => {
        const name = normalizeName(r.worker_name);
        if (name === "") return;
        const ssn = normalizeSSN(r.ssn_last4);
        const key = `${name}|${ssn ?? "none"}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push({ worker_name: r.worker_name, ssn_masked: r.ssn_masked || null, phone: r.phone || null });
        }
      });

      unique.sort((a, b) => normalizeName(a.worker_name).localeCompare(normalizeName(b.worker_name)));

      return unique;
    },
    enabled: !!orgId,
  });

  // Validate selectedWorker still exists in workerList
  useEffect(() => {
    if (selectedKey === "ALL") return;
    const exists = workerList.some((w) => {
      const key = w.ssn_masked
        ? `SSN:${w.ssn_masked}`
        : w.phone
          ? `PHONE:${String(w.phone).replace(/[^0-9]/g, "")}`
          : `NAME:${normalizeName(w.worker_name)}`;
      return key === selectedKey;
    });
    if (!exists) {
      setSelectedWorker(null);
    }
  }, [workerList, selectedKey]);

  // ── Data query ──
  const { data: rawRecords = [], refetch: refetchRecords } = useQuery({
    queryKey: ["payroll_labor_attendance", orgId, selectedSiteId, yearMonth],
    queryFn: async () => {
      if (!orgId) return [];
      let query = supabase
        .from("daily_attendance")
        .select("*")
        .eq("organization_id", orgId)
        .gte("work_date", startDate)
        .lte("work_date", endDate)
        .order("work_date")
        .order("worker_name");

      if (selectedSiteId !== "all") {
        query = query.eq("site_id", selectedSiteId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as DailyAttendanceRecord[];
    },
    enabled: !!orgId,
  });
  // 직원별 전체 기간 최초 근무일 조회 (GROUP BY로 성능 최적화)
  const { data: firstWorkDateRows = [] } = useQuery({
    queryKey: ["worker_first_work_dates", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("daily_attendance")
        .select("ssn_masked, phone, worker_name, work_date")
        .eq("organization_id", orgId)
        .order("work_date", { ascending: true });
      if (error) throw error;
      // 직원별 최초 근무일만 추출 (클라이언트 GROUP BY)
      const map = new Map<string, string>();
      (data || []).forEach((r: any) => {
        const key = r.ssn_masked
          ? `SSN:${r.ssn_masked}`
          : r.phone
            ? `PHONE:${String(r.phone).replace(/[^0-9]/g, "")}`
            : `NAME:${normalizeName(r.worker_name)}`;
        if (!map.has(key) || r.work_date < map.get(key)!) {
          map.set(key, r.work_date);
        }
      });
      return Array.from(map.entries()).map(([key, date]) => ({ key, first_work_date: date }));
    },
    staleTime: 1000 * 60 * 30, // 30분 캐시 유지
    enabled: !!orgId,
  });

  // Map으로 변환 (빠른 조회용)
  const firstWorkDateMap = useMemo(() => {
    const map = new Map<string, string>();
    firstWorkDateRows.forEach(({ key, first_work_date }) => {
      map.set(key, first_work_date);
    });
    return map;
  }, [firstWorkDateRows]);
  // 전체 현장 데이터 조회 (현장합산용)
  const { data: allSitesRecords = [] } = useQuery({
    queryKey: ["payroll_all_sites", orgId, yearMonth],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("daily_attendance")
        .select("worker_name, ssn_masked, phone, work_date, site_id")
        .eq("organization_id", orgId)
        .gte("work_date", startDate)
        .lte("work_date", endDate);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const weeklyFetchStart = useMemo(() => {
    const d = new Date(startDate + "T00:00:00");
    d.setDate(d.getDate() - 6);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }, [startDate]);

  const { data: weeklyHolidayRows = [] } = useQuery({
    queryKey: ["payroll_labor_weekly_holiday", orgId, selectedSiteId, yearMonth],
    queryFn: async () => {
      if (!orgId) return [];

      const { data, error } = await (supabase as any)
        .from("weekly_holiday_pay_records")
        .select("*")
        .eq("organization_id", orgId)
        .lte("week_start", endDate)
        .gte("week_end", weeklyFetchStart);

      if (error) throw error;

      const rows: any[] = Array.isArray(data) ? data : [];

      if (selectedSiteId === "all") return rows;

      return rows.filter((row) => Array.isArray(row.worked_site_ids) && row.worked_site_ids.includes(selectedSiteId));
    },
    enabled: !!orgId,
  });
  // 지난달 근무 데이터 조회
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevStartDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
  const prevEndDate = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(prevLastDay).padStart(2, "0")}`;

  const { data: prevMonthRecords = [] } = useQuery({
    queryKey: ["payroll_prev_month", orgId, yearMonth],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("daily_attendance")
        .select("worker_name, ssn_masked, phone, work_date")
        .eq("organization_id", orgId)
        .gte("work_date", prevStartDate)
        .lte("work_date", prevEndDate);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const prevMonthWorkerKeySet = useMemo(() => {
    const set = new Set<string>();
    prevMonthRecords.forEach((r: any) => {
      const key = r.ssn_masked
        ? `SSN:${r.ssn_masked}`
        : r.phone
          ? `PHONE:${String(r.phone).replace(/[^0-9]/g, "")}`
          : `NAME:${normalizeName(r.worker_name)}`;
      set.add(key);
    });
    return set;
  }, [prevMonthRecords]);
  // 지난달 8일 이상 근무한 직원 키셋 (보험 가입 자격 있는 직원만)
  const prevMonthOver8KeySet = useMemo(() => {
    const dayCounts = new Map<string, Set<string>>();
    prevMonthRecords.forEach((r: any) => {
      const key = r.ssn_masked
        ? `SSN:${r.ssn_masked}`
        : r.phone
          ? `PHONE:${String(r.phone).replace(/[^0-9]/g, "")}`
          : `NAME:${normalizeName(r.worker_name)}`;
      if (!dayCounts.has(key)) dayCounts.set(key, new Set());
      dayCounts.get(key)!.add(r.work_date);
    });
    const set = new Set<string>();
    dayCounts.forEach((dates, key) => {
      if (dates.size >= 8) set.add(key);
    });
    return set;
  }, [prevMonthRecords]);
  // 다음달 근무 데이터 조회
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextStartDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const nextLastDay = new Date(nextYear, nextMonth, 0).getDate();
  const nextEndDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextLastDay).padStart(2, "0")}`;

  const { data: nextMonthRecords = [] } = useQuery({
    queryKey: ["payroll_next_month", orgId, yearMonth],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("daily_attendance")
        .select("worker_name, ssn_masked, phone")
        .eq("organization_id", orgId)
        .gte("work_date", nextStartDate)
        .lte("work_date", nextEndDate);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  const nextMonthWorkerKeySet = useMemo(() => {
    const set = new Set<string>();
    nextMonthRecords.forEach((r: any) => {
      const key = r.ssn_masked
        ? `SSN:${r.ssn_masked}`
        : r.phone
          ? `PHONE:${String(r.phone).replace(/[^0-9]/g, "")}`
          : `NAME:${normalizeName(r.worker_name)}`;
      set.add(key);
    });
    return set;
  }, [nextMonthRecords]);

  // [0] Pre-filter: exclude null work_date or empty worker_name
  const preFiltered = useMemo(
    () => rawRecords.filter((r) => r.work_date != null && r.worker_name != null && normalizeName(r.worker_name) !== ""),
    [rawRecords],
  );

  // [3] enrichedRows
  const enrichedRows = useMemo(
    () =>
      preFiltered.map((r) => ({
        ...r,
        _workerKey: r.ssn_masked
          ? `SSN:${r.ssn_masked}`
          : (r as any).phone
            ? `PHONE:${String((r as any).phone).replace(/[^0-9]/g, "")}`
            : `NAME:${normalizeName(r.worker_name)}`,
        _normalizedName: normalizeName(r.worker_name),
      })),
    [preFiltered],
  );

  // [4] filteredRows by selectedKey
  const records = useMemo(() => {
    if (selectedKey === "ALL") return enrichedRows;
    return enrichedRows.filter((row) => row._workerKey === selectedKey);
  }, [enrichedRows, selectedKey]);

  const weeklyHolidayMap = useMemo(() => {
    const map = new Map<string, number>();

    (weeklyHolidayRows || []).forEach((row: any) => {
      const key = `${row.worker_key}|${row.week_start}`;
      map.set(key, Number(row.weekly_holiday_pay ?? 0));
    });

    return map;
  }, [weeklyHolidayRows]);

  const formatCurrency = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

  // Worker summary for on-screen table
  const workerSummary = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        ssnMasked: string;
        days: Set<string>;
        firstWorkDate: string;
        jobTypes: Set<string>;
        totalFinalPay: number;
        totalCalculatedPay: number;
        totalMealAllowance: number;
        totalVehicleAllowance: number;
        totalExtraNonTaxable: number;
        totalIncomeTax: number;
        totalLocalTax: number;
        totalEmploymentInsurance: number;
        totalNationalPension: number;
        totalHealthInsurance: number;
        totalLongTermCare: number;
        totalIndustrialAccident: number;
        totalDeductions: number;
        totalNetPay: number;
        totalWeeklyHolidayPay: number;
        hasAdjustment: boolean;
        records: typeof records;
      }
    > = {};

    records.forEach((r) => {
      const key = r._workerKey;
      if (!map[key]) {
        map[key] = {
          name: r.worker_name,
          ssnMasked: r.ssn_masked || "-",
          days: new Set(),
          firstWorkDate: r.work_date,
          jobTypes: new Set<string>([r.job_type || "보통인부"]),
          totalFinalPay: 0,
          totalCalculatedPay: 0,
          totalMealAllowance: 0,
          totalVehicleAllowance: 0,
          totalExtraNonTaxable: 0,
          totalIncomeTax: 0,
          totalLocalTax: 0,
          totalEmploymentInsurance: 0,
          totalNationalPension: 0,
          totalHealthInsurance: 0,
          totalLongTermCare: 0,
          totalIndustrialAccident: 0,
          totalDeductions: 0,
          totalNetPay: 0,
          totalWeeklyHolidayPay: 0,
          hasAdjustment: false,
          records: [],
        };
      }
      map[key].days.add(r.work_date);
      if (!map[key].firstWorkDate || r.work_date < map[key].firstWorkDate) {
        map[key].firstWorkDate = r.work_date;
      }
      map[key].jobTypes.add(r.job_type || "보통인부");
      map[key].totalFinalPay += r.final_pay;
      map[key].totalCalculatedPay += r.calculated_pay;
      map[key].totalMealAllowance += Number((r as any).meal_allowance_amount ?? 0);
      map[key].totalVehicleAllowance += Number((r as any).vehicle_allowance_amount ?? 0);
      map[key].totalExtraNonTaxable += Number((r as any).extra_non_taxable_allowance_amount ?? 0);
      map[key].totalIncomeTax += (r as any).income_tax ?? 0;
      map[key].totalLocalTax += (r as any).local_income_tax ?? 0;
      map[key].totalEmploymentInsurance += (r as any).employment_insurance ?? 0;
      map[key].totalNationalPension += (r as any).national_pension ?? 0;
      map[key].totalHealthInsurance += (r as any).health_insurance ?? 0;
      map[key].totalLongTermCare += (r as any).long_term_care_insurance ?? 0;
      map[key].totalIndustrialAccident += (r as any).industrial_accident ?? 0;
      map[key].totalDeductions += (r as any).total_deductions ?? 0;
      map[key].totalNetPay += (r as any).net_pay ?? 0;
      if (r.calculated_pay !== r.final_pay) map[key].hasAdjustment = true;
      map[key].records.push(r);

      const rowWeekStart = getWeekStart(r.work_date);
      const rowWeeklyKey = `${r._workerKey}|${rowWeekStart}`;

      const firstRowInWeek = records.find(
        (x) => x._workerKey === r._workerKey && getWeekStart(x.work_date) === rowWeekStart,
      );

      if (firstRowInWeek && firstRowInWeek.id === r.id) {
        map[key].totalWeeklyHolidayPay += Number(weeklyHolidayMap.get(rowWeeklyKey) ?? 0);
      }
    });

    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [records, weeklyHolidayMap]);

  const over8Workers = workerSummary.filter((w) => w.days.size >= 8);
  const absentWorkers = useMemo(() => {
    // 전체 현장 기준 이번달 근무자 키셋
    const thisMonthAllSitesKeys = new Set(
      allSitesRecords.map((r: any) =>
        r.ssn_masked
          ? `SSN:${r.ssn_masked}`
          : r.phone
            ? `PHONE:${String(r.phone).replace(/[^0-9]/g, "")}`
            : `NAME:${normalizeName(r.worker_name)}`,
      ),
    );
    const seen = new Set<string>();
    const result: { name: string; wKey: string }[] = [];
    prevMonthRecords.forEach((r: any) => {
      const key = r.ssn_masked
        ? `SSN:${r.ssn_masked}`
        : r.phone
          ? `PHONE:${String(r.phone).replace(/[^0-9]/g, "")}`
          : `NAME:${normalizeName(r.worker_name)}`;
      // 전체 현장 이번달 근무 없음 + 지난달 8일 이상 근무한 직원만 표시
      if (!thisMonthAllSitesKeys.has(key) && !seen.has(key) && prevMonthOver8KeySet.has(key)) {
        seen.add(key);
        result.push({ name: r.worker_name, wKey: key });
      }
    });
    return result;
  }, [prevMonthRecords, workerSummary, allSitesRecords, prevMonthOver8KeySet]);
  // 직원별 전체 현장 합산 근무일수 및 현장별 일수
  const allSitesWorkerDays = useMemo(() => {
    const map = new Map<string, { totalDays: Set<string>; siteBreakdown: Map<string, Set<string>> }>();
    allSitesRecords.forEach((r: any) => {
      const key = r.ssn_masked
        ? `SSN:${r.ssn_masked}`
        : r.phone
          ? `PHONE:${String(r.phone).replace(/[^0-9]/g, "")}`
          : `NAME:${normalizeName(r.worker_name)}`;
      if (!map.has(key)) {
        map.set(key, { totalDays: new Set(), siteBreakdown: new Map() });
      }
      const entry = map.get(key)!;
      entry.totalDays.add(r.work_date);
      if (!entry.siteBreakdown.has(r.site_id)) {
        entry.siteBreakdown.set(r.site_id, new Set());
      }
      entry.siteBreakdown.get(r.site_id)!.add(r.work_date);
    });
    return map;
  }, [allSitesRecords]);
  // 지급총액 = 시스템계산액(final_pay) + 비과세 항목 합계
  const grandWeeklyHolidayPay = workerSummary.reduce((s, w) => s + w.totalWeeklyHolidayPay, 0);

  const grandTotal = workerSummary.reduce(
    (s, w) =>
      s +
      w.totalCalculatedPay +
      w.totalWeeklyHolidayPay +
      w.totalMealAllowance +
      w.totalVehicleAllowance +
      w.totalExtraNonTaxable,
    0,
  );
  const grandNonTaxableAllowance = workerSummary.reduce(
    (s, w) => s + w.totalMealAllowance + w.totalVehicleAllowance + w.totalExtraNonTaxable,
    0,
  );
  const grandDeductions = workerSummary.reduce((s, w) => s + w.totalDeductions, 0);
  const grandNetPay = grandTotal - grandDeductions;
  const grandIndustrialAccident = workerSummary.reduce((s, w) => s + w.totalIndustrialAccident, 0);

  // ── Filter label ──
  const selectedSiteName = useMemo(() => {
    if (selectedSiteId === "all") return "전체 현장";
    return sites.find((s) => s.site_id === selectedSiteId)?.site_name || "";
  }, [selectedSiteId, sites]);

  const filterLabel = useMemo(() => {
    const site = selectedSiteName;
    const worker =
      selectedKey !== "ALL" && selectedWorker
        ? selectedWorker.ssn_masked != null
          ? `${normalizeName(selectedWorker.worker_name)} (${selectedWorker.ssn_masked})`
          : normalizeName(selectedWorker.worker_name)
        : null;
    if (worker) return `${year}년 ${month}월 | ${site} | ${worker}`;
    return `${year}년 ${month}월 | ${site}`;
  }, [selectedSiteId, selectedSiteName, selectedKey, selectedWorker, year, month]);

  // Worker dropdown display
  const workerDisplayLabel = (w: WorkerOption): string => {
    return w.ssn_masked ? `${w.worker_name} (${w.ssn_masked})` : w.worker_name;
  };

  // ── Print labor report (법정양식) ──
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const d = new Date(year, month - 2, 1);
                  setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-base font-semibold w-[120px] text-center">
                {year}년 {month}월
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const d = new Date(year, month, 1);
                  setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="min-w-[200px]">
              <Label className="text-xs">현장</Label>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                <SelectTrigger>
                  <SelectValue placeholder="현장 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 현장</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.site_id} value={s.site_id}>
                      {s.site_name} {s.status !== "active" && `(${s.status === "completed" ? "종료" : "숨김"})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[200px]">
              <Label className="text-xs">직원</Label>
              <Select
                value={selectedKey}
                onValueChange={(val) => {
                  if (val === "ALL") {
                    setSelectedWorker(null);
                  } else {
                    const found = workerList.find((w) => {
                      const key = w.ssn_masked
                        ? `SSN:${w.ssn_masked}`
                        : w.phone
                          ? `PHONE:${String(w.phone).replace(/[^0-9]/g, "")}`
                          : `NAME:${normalizeName(w.worker_name)}`;
                      return key === val;
                    });
                    setSelectedWorker(found || null);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="전체 직원" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">전체 직원</SelectItem>
                  {workerList.map((w) => {
                    const key = w.ssn_masked
                      ? `SSN:${w.ssn_masked}`
                      : w.phone
                        ? `PHONE:${String(w.phone).replace(/[^0-9]/g, "")}`
                        : `NAME:${normalizeName(w.worker_name)}`;
                    return (
                      <SelectItem key={key} value={key}>
                        {workerDisplayLabel(w)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            {/* ✅ 프리셋 버튼 추가 */}
            <div className="flex items-center gap-1 border rounded-md p-0.5">
              {(
                [
                  { type: "simple", label: "간편형" },
                  { type: "detail", label: "상세형" },
                  { type: "summary", label: "요약형" },
                ] as const
              ).map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => setPreset(type)}
                  className={[
                    "px-3 py-1 rounded text-sm transition-colors",
                    preset === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            <Button variant="outline" onClick={() => setShowLaborReport(true)}>
              <Printer className="w-4 h-4 mr-1" /> 노무대장 출력
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!selectedWorker) {
                  toast.error("직원을 먼저 선택해주세요");
                  return;
                }
                setShowPayslip(true);
              }}
            >
              <FileText className="w-4 h-4 mr-1" /> 노무임금명세서 출력
            </Button>
          </div>

          {/* ✅ 상세형 뷰설정 체크박스 — 하단 별도 영역 */}
          {preset === "detail" && (
            <div className="flex flex-wrap items-center gap-3 border-t pt-3 mt-3 text-sm">
              <span className="text-xs text-muted-foreground font-medium">표시 항목:</span>
              {[
                { key: "overtimePay", label: "연장수당" },
                { key: "nightPay", label: "야간수당" },
                { key: "weeklyHolidayPay", label: "주휴수당" },
                { key: "holidayPay", label: "휴일수당" },
                { key: "industrialAccident", label: "산재(참고)" },
                ...(dpSettings.enable_meal_allowance ? [{ key: "mealAllowance", label: "식대" }] : []),
                ...(dpSettings.enable_vehicle_allowance ? [{ key: "vehicleAllowance", label: "차량운전보조금" }] : []),
                ...(dpSettings.enable_extra_non_taxable
                  ? [{ key: "extraNonTaxable", label: dpSettings.extra_non_taxable_name || "기타수당" }]
                  : []),
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={detailCols[key as keyof typeof detailCols]}
                    onChange={() => toggleDetailCol(key as keyof typeof detailCols)}
                    className="w-3.5 h-3.5"
                  />
                  <span className="text-xs">{label}</span>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 8일 초과 경고 */}
      {(() => {
        const today = new Date();
        const isMonthClosed =
          today.getFullYear() > year || (today.getFullYear() === year && today.getMonth() + 1 > month);

        const workerAlerts = workerSummary
          .map((w) => {
            const wKey = w.records[0]?._workerKey ?? `NAME:${w.name}`;
            // 취득일 계산 (첫 근무일 기준)
            const firstWorkDate = w.firstWorkDate; // "YYYY-MM-DD"
            const firstWorkDay = firstWorkDate ? parseInt(firstWorkDate.split("-")[2]) : null;
            const firstWorkMonth = firstWorkDate ? parseInt(firstWorkDate.split("-")[1]) : null;
            const firstWorkYear = firstWorkDate ? parseInt(firstWorkDate.split("-")[0]) : null;

            // 보험료 시작월 계산
            const isFirstDayEntry = firstWorkDay === 1;
            let insuranceStartText = "";
            if (firstWorkDate && firstWorkMonth && firstWorkYear) {
              if (isFirstDayEntry) {
                insuranceStartText = `${firstWorkMonth}월부터 보험료`;
              } else {
                // 취득일 2일↑ → 다음달부터
                const insMonth = firstWorkMonth === 12 ? 1 : firstWorkMonth + 1;
                insuranceStartText = `${insMonth}월부터 보험료`;
              }
            }

            // 취득일 표시 텍스트
            const acquisitionText = firstWorkDate ? `취득일 ${firstWorkMonth}.${firstWorkDay}` : "";

            // 다음달 출근 여부
            const hasNextMonth = nextMonthWorkerKeySet.has(wKey);
            // 지난달 출근 여부
            const hasPrevMonth = prevMonthOver8KeySet.has(wKey);

            const current = getSetting(wKey) ?? {
              worker_key: wKey,
              worker_name: w.name,
              apply_employment_insurance: true,
              apply_national_pension: false,
              apply_health_insurance: false,
              pension_confirmed: false,
              health_confirmed: false,
              pension_confirmed_months: [],
              health_confirmed_months: [],
            };

            const days = w.days.size;

            // 전체 현장 합산 일수 계산 (특정 현장 선택 시에만 적용)
            const allSitesEntry = allSitesWorkerDays.get(wKey);
            const effectiveDays = selectedSiteId !== "all" && allSitesEntry ? allSitesEntry.totalDays.size : days;

            // 현장별 일수 텍스트 (2개 이상 현장 근무 시에만 표시)
            let siteBreakdownStr = "";
            if (selectedSiteId !== "all" && allSitesEntry && allSitesEntry.siteBreakdown.size > 1) {
              const parts: string[] = [];
              allSitesEntry.siteBreakdown.forEach((dates, siteId) => {
                const siteName = sites.find((s) => s.site_id === siteId)?.site_name || siteId;
                parts.push(`${siteName} ${dates.size}일`);
              });
              siteBreakdownStr = parts.join(" + ");
            }
            const breakdownSuffix = siteBreakdownStr ? ` / ${siteBreakdownStr}` : "";

            const totalIncome =
              w.totalCalculatedPay +
              w.totalWeeklyHolidayPay +
              w.totalMealAllowance +
              w.totalVehicleAllowance +
              w.totalExtraNonTaxable;
            const isOver220 = totalIncome >= 2200000;

            // 국민연금 상태 계산
            const isPensionAlwaysShow = effectiveDays === 0 && hasPrevMonth;

            let pensionMsg: string | null = null;
            if (!isPensionConfirmedForMonth(wKey, yearMonth) || isPensionAlwaysShow) {
              const ssnRaw = w.records[0]?.ssn_masked;
              const ageResult = ssnRaw ? calculateAgeFromSsn(ssnRaw) : null;
              if (ageResult?.isOver60) {
                pensionMsg = `⚠ 60세 이상 / 국민연금 신규가입 불가`;
              } else if (effectiveDays >= 8) {
                if (hasNextMonth) {
                  pensionMsg = hasPrevMonth
                    ? `✅ 가입대상 확정 / ${acquisitionText} / ${insuranceStartText}${breakdownSuffix}`
                    : `✅ 가입대상 / ${acquisitionText} / ${insuranceStartText}${breakdownSuffix}`;
                } else {
                  pensionMsg = hasPrevMonth
                    ? `⏳ 계속근로 중 (합산 ${effectiveDays}일)${breakdownSuffix} / ${acquisitionText} / ${insuranceStartText} / 다음달 출근 확인 필요`
                    : `⏳ 첫 근무월 (합산 ${effectiveDays}일)${breakdownSuffix} / ${acquisitionText} / ${insuranceStartText} / 다음달 계속근로 확인 필요`;
                }
              } else if (isOver220) {
                pensionMsg = `⏳ 소득 220만↑ (국민연금만) / 다음달 계속근로 확인 필요`;
              } else if (effectiveDays === 0 && hasPrevMonth) {
                pensionMsg = `⚠ 미출근 단절 / 상실신고 검토 필요`;
              } else if (effectiveDays < 8 && hasPrevMonth && isMonthClosed) {
                pensionMsg = `⚠ 상실신고 검토 필요 / 상실일은 실무자 확인`;
              } else if (effectiveDays < 8 && hasPrevMonth && !isMonthClosed) {
                pensionMsg = `⏳ 계속근로 중 / 현재 8일 미달 / 월말 확인 필요`;
              } else if (effectiveDays < 8 && !hasPrevMonth && isMonthClosed) {
                pensionMsg = `❌ 가입 조건 미충족`;
              } else if (effectiveDays < 8 && !hasPrevMonth && !isMonthClosed) {
                pensionMsg = `⏳ 현재 8일 미달 / 월말 확인 필요`;
              } else {
                pensionMsg = null;
              }
            }

            // 건강보험 상태 계산
            let healthMsg: string | null = null;

            const isHealthAlwaysShow = effectiveDays === 0 && hasPrevMonth;

            if (!isHealthConfirmedForMonth(wKey, yearMonth) || isHealthAlwaysShow) {
              if (effectiveDays >= 8) {
                if (hasNextMonth) {
                  healthMsg = hasPrevMonth
                    ? `✅ 가입대상 확정 / ${acquisitionText} / ${insuranceStartText}${breakdownSuffix}`
                    : `✅ 가입대상 / ${acquisitionText} / ${insuranceStartText}${breakdownSuffix}`;
                } else {
                  healthMsg = hasPrevMonth
                    ? `⏳ 계속근로 중 (합산 ${effectiveDays}일)${breakdownSuffix} / ${acquisitionText} / ${insuranceStartText} / 다음달 출근 확인 필요`
                    : `⏳ 첫 근무월 (합산 ${effectiveDays}일)${breakdownSuffix} / ${acquisitionText} / ${insuranceStartText} / 다음달 계속근로 확인 필요`;
                }
              } else if (isOver220 && effectiveDays < 8) {
                healthMsg = `❌ 미해당 / 건강보험 소득 기준 없음 / 8일 필수`;
              } else if (effectiveDays === 0 && hasPrevMonth) {
                healthMsg = `⚠ 미출근 단절 / 상실신고 검토 필요`;
              } else if (effectiveDays < 8 && hasPrevMonth && isMonthClosed) {
                healthMsg = `⚠ 상실신고 검토 필요 / 상실일은 실무자 확인`;
              } else if (effectiveDays < 8 && hasPrevMonth && !isMonthClosed) {
                healthMsg = `⏳ 계속근로 중 / 현재 8일 미달 / 월말 확인 필요`;
              } else if (effectiveDays < 8 && !hasPrevMonth && isMonthClosed) {
                healthMsg = `❌ 가입 조건 미충족`;
              } else if (effectiveDays < 8 && !hasPrevMonth && !isMonthClosed) {
                healthMsg = `⏳ 현재 8일 미달 / 월말 확인 필요`;
              } else {
                healthMsg = null;
              }
            }

            // 상용직 전환 알림 계산
            let conversionMsg: string | null = null;
            const workerFirstWorkDate =
              firstWorkDateMap.get(wKey) ?? firstWorkDateMap.get(`NAME:${normalizeName(w.name)}`);

            if (workerFirstWorkDate) {
              const first = new Date(workerFirstWorkDate + "T00:00:00");
              const now = new Date();
              // 역법 기준 개월 수 계산
              const diffMonths = (now.getFullYear() - first.getFullYear()) * 12 + (now.getMonth() - first.getMonth());

              // 1년(12개월) 경과 → 🚨 전환 필요 (1순위)
              if (diffMonths >= 12) {
                const oneYearDate = new Date(first);
                oneYearDate.setFullYear(oneYearDate.getFullYear() + 1);
                const y = oneYearDate.getFullYear();
                const m = String(oneYearDate.getMonth() + 1).padStart(2, "0");
                const d = String(oneYearDate.getDate()).padStart(2, "0");
                conversionMsg = `🚨 상용직 전환 필요 — 최초 근무일(${workerFirstWorkDate}) 기준 1년 경과. 이번 달부터 간이세액표 원천징수 적용 및 퇴직금 발생 가능. 실무자 확인 필요 (소득세법 시행령 §20①1호가)`;
              }
              // 11개월 이상 ~ 12개월 미만 → 🔴 경고 (2순위)
              else if (diffMonths >= 11) {
                const oneYearDate = new Date(first);
                oneYearDate.setFullYear(oneYearDate.getFullYear() + 1);
                const y = oneYearDate.getFullYear();
                const m = String(oneYearDate.getMonth() + 1).padStart(2, "0");
                const d = String(oneYearDate.getDate()).padStart(2, "0");
                conversionMsg = `🔴 상용직 전환 검토 — 최초 근무일(${workerFirstWorkDate}) 기준 1개월 후(${y}.${m}.${d}) 소득세법상 상용직 전환 대상. 원천징수 방식 변경 및 퇴직금 발생 가능 여부 확인 필요`;
              }
            }

            if (!pensionMsg && !healthMsg && !conversionMsg) return null;

            return {
              name: w.name,
              wKey,
              current,
              pensionMsg,
              healthMsg,
              conversionMsg,
              isPensionAlwaysShow,
              isHealthAlwaysShow,
            };
          })
          .filter(Boolean);

        // 우선순위 분류 함수
        const getPriority = (msg: string | null): number => {
          if (!msg) return 3;
          if (msg.includes("미출근 / 상실신고") || msg.includes("미출근 단절") || msg.includes("상실신고 검토 필요"))
            return 1;
          if (msg.includes("현재 8일 미달") || msg.includes("가입 조건 미충족")) return 3;
          return 2;
        };

        const getAlertPriority = (alert: any): number => {
          // absentWorkers는 미출근 케이스이므로 항상 1순위
          if (alert.isAbsent) return 1;
          // 상용직 전환 필요(12개월)는 1순위
          if (alert.conversionMsg?.includes("전환 필요")) return 1;
          const p1 = getPriority(alert.pensionMsg);
          const p2 = getPriority(alert.healthMsg);
          return Math.min(p1, p2);
        };

        // absentWorkers를 workerAlerts 형식으로 변환 후 합산 정렬
        const absentAlerts = absentWorkers
          .map((w) => {
            const current = getSetting(w.wKey) ?? {
              worker_key: w.wKey,
              worker_name: w.name,
              apply_employment_insurance: true,
              apply_national_pension: false,
              apply_health_insurance: false,
              pension_confirmed: false,
              health_confirmed: false,
              pension_confirmed_months: [],
              health_confirmed_months: [],
            };
            if (isPensionConfirmedForMonth(w.wKey, yearMonth) && isHealthConfirmedForMonth(w.wKey, yearMonth))
              return null;
            return { ...w, current, isAbsent: true };
          })
          .filter(Boolean);

        // 전체 합산 후 우선순위 정렬
        const allAlerts = [
          ...workerAlerts.map((a) => (a ? { ...a, isAbsent: false } : null)).filter(Boolean),
          ...absentAlerts,
        ].sort((a: any, b: any) => getAlertPriority(a) - getAlertPriority(b));

        if (allAlerts.length === 0) return null;

        return (
          <Alert variant="destructive" className="border-amber-300 bg-amber-50 text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <AlertDescription>
              <div className="font-semibold mb-2 text-amber-800">보험 검토 필요 직원</div>
              <div className="space-y-3">
                {allAlerts.map((alert: any) => {
                  if (!alert) return null;

                  if (alert.isAbsent) {
                    return (
                      <div key={alert.wKey} className="space-y-1">
                        <div className="font-medium text-amber-900">{alert.name}</div>
                        {alert.conversionMsg && (
                          <div className="pl-3 text-sm">
                            <span
                              className={
                                alert.conversionMsg.includes("전환 필요")
                                  ? "text-red-700 font-medium"
                                  : "text-orange-700"
                              }
                            >
                              상용직: {alert.conversionMsg}
                            </span>
                          </div>
                        )}
                        {alert.pensionMsg && (
                          <div className="flex items-center justify-between gap-2 pl-3 text-sm">
                            <span>국민연금: ⚠ 미출근 / 상실신고 또는 계속근로 여부 확인 필요</span>
                            <button
                              onClick={async () => {
                                const prevMonths = alert.current.pension_confirmed_months ?? [];
                                const newMonths = prevMonths.includes(yearMonth)
                                  ? prevMonths
                                  : [...prevMonths, yearMonth];
                                const newSetting = {
                                  ...alert.current,
                                  pension_confirmed: true,
                                  pension_confirmed_months: newMonths,
                                };
                                await upsertInsurance(newSetting);
                                refetchRecords();
                              }}
                              className="shrink-0 text-xs px-2 py-0.5 rounded border border-amber-400 hover:bg-amber-100"
                            >
                              확인 ✓
                            </button>
                          </div>
                        )}
                        {!isHealthConfirmedForMonth(alert.wKey, yearMonth) && (
                          <div className="flex items-center justify-between gap-2 pl-3 text-sm">
                            <span>건강보험: ⚠ 미출근 / 상실신고 또는 계속근로 여부 확인 필요</span>
                            <button
                              onClick={async () => {
                                const prevMonths = alert.current.health_confirmed_months ?? [];
                                const newMonths = prevMonths.includes(yearMonth)
                                  ? prevMonths
                                  : [...prevMonths, yearMonth];
                                const newSetting = {
                                  ...alert.current,
                                  health_confirmed: true,
                                  health_confirmed_months: newMonths,
                                };
                                await upsertInsurance(newSetting);
                                refetchRecords();
                              }}
                              className="shrink-0 text-xs px-2 py-0.5 rounded border border-amber-400 hover:bg-amber-100"
                            >
                              확인 ✓
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={alert.wKey} className="space-y-1">
                      <div className="font-medium text-amber-900">{alert.name}</div>
                      {alert.conversionMsg && (
                        <div className="pl-3 text-sm">
                          <span
                            className={
                              alert.conversionMsg.includes("전환 필요") ? "text-red-700 font-medium" : "text-orange-700"
                            }
                          >
                            상용직: {alert.conversionMsg}
                          </span>
                        </div>
                      )}
                      {alert.pensionMsg && (
                        <div className="flex items-center justify-between gap-2 pl-3 text-sm">
                          <span>국민연금: {alert.pensionMsg}</span>
                          {!alert.isPensionAlwaysShow && (
                            <button
                              onClick={async () => {
                                const prevMonths = alert.current.pension_confirmed_months ?? [];
                                const newMonths = prevMonths.includes(yearMonth)
                                  ? prevMonths
                                  : [...prevMonths, yearMonth];
                                const newSetting = {
                                  ...alert.current,
                                  pension_confirmed: true,
                                  pension_confirmed_months: newMonths,
                                };
                                await upsertInsurance(newSetting);
                                refetchRecords();
                              }}
                              className="shrink-0 text-xs px-2 py-0.5 rounded border border-amber-400 hover:bg-amber-100"
                            >
                              확인 ✓
                            </button>
                          )}
                        </div>
                      )}
                      {alert.healthMsg && (
                        <div className="flex items-center justify-between gap-2 pl-3 text-sm">
                          <span>건강보험: {alert.healthMsg}</span>
                          {!alert.isHealthAlwaysShow && (
                            <button
                              onClick={async () => {
                                const prevMonths = alert.current.health_confirmed_months ?? [];
                                const newMonths = prevMonths.includes(yearMonth)
                                  ? prevMonths
                                  : [...prevMonths, yearMonth];
                                const newSetting = {
                                  ...alert.current,
                                  health_confirmed: true,
                                  health_confirmed_months: newMonths,
                                };
                                await upsertInsurance(newSetting);
                                refetchRecords();
                              }}
                              className="shrink-0 text-xs px-2 py-0.5 rounded border border-amber-400 hover:bg-amber-100"
                            >
                              확인 ✓
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </AlertDescription>
          </Alert>
        );
      })()}

      {/* Worker summary table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="w-4 h-4" />
            {filterLabel} 급여 집계
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workerSummary.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">해당 조건의 데이터가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>성명</TableHead>
                    <TableHead>주민번호</TableHead>
                    <TableHead>연락처</TableHead>
                    <TableHead>직종</TableHead>
                    <TableHead>고용일</TableHead>
                    <TableHead>지급기간</TableHead>
                    <TableHead>지급일</TableHead>
                    <TableHead className="text-right">총근무일수</TableHead>
                    <TableHead className="text-right">총공수</TableHead>
                    <TableHead className="text-center">고용보험</TableHead>
                    <TableHead className="text-center">국민연금</TableHead>
                    <TableHead className="text-center">건강보험</TableHead>
                    <TableHead className="text-right">지급총액</TableHead>
                    <TableHead className="text-right">공제합계</TableHead>
                    <TableHead className="text-right">실지급액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workerSummary.map((w) => (
                    <TableRow key={w.name}>
                      <TableCell className="font-medium">{w.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{w.ssnMasked}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {w.records[0] && (w.records[0] as any).phone
                          ? String((w.records[0] as any).phone).replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-sm">{Array.from(w.jobTypes).join(", ") || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {w.firstWorkDate ? formatDateDot(w.firstWorkDate) : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {`${year}.${String(month).padStart(2, "0")}.01 ~ ${year}.${String(month).padStart(2, "0")}.${String(lastDay).padStart(2, "0")}`}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {`${year}.${String(month).padStart(2, "0")}.${String(dpSettings.payment_day ?? 25).padStart(2, "0")}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {w.days.size}일
                        {w.days.size >= 8 && (
                          <Badge variant="destructive" className="ml-1 text-[10px]">
                            8일 이상
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {Math.round(
                          (w.records.reduce((s, r) => {
                            const wh =
                              (r as any).work_hours != null
                                ? Number((r as any).work_hours)
                                : Number(r.work_minutes ?? 0) / 60;
                            return s + wh;
                          }, 0) /
                            8) *
                            100,
                        ) / 100}
                        공수
                      </TableCell>
                      {(() => {
                        const workerKey = w.records[0]?._workerKey ?? `NAME:${w.name}`;
                        const current = getSetting(workerKey) ?? {
                          worker_key: workerKey,
                          worker_name: w.name,
                          apply_employment_insurance: true,
                          apply_national_pension: false,
                          apply_health_insurance: false,
                          pension_confirmed: false,
                          health_confirmed: false,
                          pension_confirmed_months: [],
                          health_confirmed_months: [],
                        };
                        const isOver8 = w.days.size >= 8;
                        return (
                          <>
                            {/* 고용보험 */}
                            <TableCell className="text-center">
                              {(() => {
                                // 주민번호에서 연령 경고 계산
                                const ssnRaw = w.records[0]?.ssn_masked;
                                const ageResult = ssnRaw ? calculateAgeFromSsn(ssnRaw) : null;
                                const showAgeWarning = ageResult?.isAgeWarning ?? false;

                                return (
                                  <>
                                    <div className="flex flex-col-reverse items-center justify-center gap-0.5">
                                      <input
                                        type="checkbox"
                                        checked={current.apply_employment_insurance}
                                        onChange={async (e) => {
                                          const newSetting = {
                                            ...current,
                                            apply_employment_insurance: e.target.checked,
                                          };
                                          await upsertInsurance(newSetting);
                                          await recalculateWorkerTax(
                                            orgId!,
                                            workerKey,
                                            yearMonth,
                                            newSetting,
                                            dpSettings,
                                          );
                                          refetchRecords();
                                        }}
                                        className="w-4 h-4 cursor-pointer"
                                      />
                                      {showAgeWarning && (
                                        <span className="text-[11px] text-red-500 font-medium leading-none">
                                          {ageResult?.isOver65 ? "65세↑" : "18세↓"}
                                        </span>
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                            </TableCell>
                            {/* 국민연금 */}
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                checked={current.apply_national_pension}
                                onChange={async (e) => {
                                  const newSetting = { ...current, apply_national_pension: e.target.checked };
                                  await upsertInsurance(newSetting);
                                  await recalculateWorkerTax(orgId!, workerKey, yearMonth, newSetting, dpSettings);
                                  refetchRecords();
                                }}
                                className="w-4 h-4 cursor-pointer"
                              />
                            </TableCell>
                            {/* 건강보험 */}
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                checked={current.apply_health_insurance}
                                onChange={async (e) => {
                                  const newSetting = { ...current, apply_health_insurance: e.target.checked };
                                  await upsertInsurance(newSetting);
                                  await recalculateWorkerTax(orgId!, workerKey, yearMonth, newSetting, dpSettings);
                                  refetchRecords();
                                }}
                                className="w-4 h-4 cursor-pointer"
                              />
                            </TableCell>
                          </>
                        );
                      })()}
                      <TableCell className="text-right">
                        {formatCurrency(
                          w.totalFinalPay +
                            w.totalWeeklyHolidayPay +
                            w.totalMealAllowance +
                            w.totalVehicleAllowance +
                            w.totalExtraNonTaxable,
                        )}
                      </TableCell>
                      <TableCell className="text-right">{displayCurrency(w.totalDeductions)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {displayCurrency(
                          w.totalFinalPay +
                            w.totalWeeklyHolidayPay +
                            w.totalMealAllowance +
                            w.totalVehicleAllowance +
                            w.totalExtraNonTaxable -
                            w.totalDeductions,
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold bg-muted">
                    <TableCell colSpan={8}>합계</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {Math.round(
                        (workerSummary.reduce(
                          (s, w) =>
                            s +
                            w.records.reduce((rs, r) => {
                              const wh =
                                (r as any).work_hours != null
                                  ? Number((r as any).work_hours)
                                  : Number(r.work_minutes ?? 0) / 60;
                              return rs + wh;
                            }, 0),
                          0,
                        ) /
                          8) *
                          100,
                      ) / 100}
                      공수
                    </TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell />
                    <TableCell className="text-right">{formatCurrency(grandTotal)}</TableCell>
                    <TableCell className="text-right">{displayCurrency(grandDeductions)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(grandNetPay)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {preset !== "summary" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4" />
              상세 기록
            </CardTitle>
          </CardHeader>
          <CardContent>
            {records.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">해당 조건의 데이터가 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>날짜</TableHead>
                      <TableHead>현장</TableHead>
                      <TableHead>성명</TableHead>
                      {/* ✅ 간편형/요약형에서 숨김 */}
                      {preset !== "simple" && <TableHead>직종</TableHead>}
                      {/* ✅ 상세형에서만 표시 */}
                      {preset === "detail" && <TableHead>근무시간</TableHead>}
                      {preset === "detail" && <TableHead className="text-right">휴게(분)</TableHead>}
                      {preset === "detail" && <TableHead className="text-right">실근무</TableHead>}
                      {preset === "detail" && <TableHead className="text-right">공수</TableHead>}
                      {/* ✅ 요약형에서 숨김 */}
                      <TableHead className="text-right">기본급</TableHead>
                      {preset === "detail" && detailCols.overtimePay && (
                        <TableHead className="text-right">연장수당</TableHead>
                      )}
                      {preset === "detail" && detailCols.nightPay && (
                        <TableHead className="text-right">야간수당</TableHead>
                      )}
                      {dpSettings.enable_meal_allowance && (preset !== "detail" || detailCols.mealAllowance) && (
                        <TableHead className="text-right text-emerald-600">식대</TableHead>
                      )}
                      {dpSettings.enable_vehicle_allowance && (preset !== "detail" || detailCols.vehicleAllowance) && (
                        <TableHead className="text-right text-emerald-600">차량운전보조금</TableHead>
                      )}
                      {dpSettings.enable_extra_non_taxable && (preset !== "detail" || detailCols.extraNonTaxable) && (
                        <TableHead className="text-right text-emerald-600">
                          {dpSettings.extra_non_taxable_name || "기타수당"}
                        </TableHead>
                      )}
                      {preset === "detail" && detailCols.weeklyHolidayPay && (
                        <TableHead className="text-right text-blue-600">주휴수당</TableHead>
                      )}
                      {preset === "detail" && detailCols.holidayPay && (
                        <TableHead className="text-right text-amber-600">휴일수당</TableHead>
                      )}
                      <TableHead className="text-right">지급총액</TableHead>
                      {preset === "detail" && <TableHead className="text-right">소득세</TableHead>}
                      {preset === "detail" && <TableHead className="text-right">지방세</TableHead>}
                      {preset === "detail" && <TableHead className="text-right">고용보험</TableHead>}
                      {preset === "detail" && <TableHead className="text-right">국민연금</TableHead>}
                      {preset === "detail" && <TableHead className="text-right">건강보험</TableHead>}
                      {preset === "detail" && <TableHead className="text-right">장기요양</TableHead>}
                      {preset === "detail" && detailCols.industrialAccident && (
                        <TableHead className="text-right text-muted-foreground">산재(참고)</TableHead>
                      )}
                      <TableHead className="text-right">공제합계</TableHead>
                      <TableHead className="text-right">실수령액</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((r) => {
                      const site = sites.find((s) => s.site_id === r.site_id);
                      const timeStr = r.start_time && r.end_time ? `${r.start_time}~${r.end_time}` : "-";
                      const breakMin = Number(r.break_minutes ?? 0);
                      const workMin = Number(r.work_minutes ?? 0);
                      const pb = extractPayBreakdown(r);
                      const calcPay = r.calculated_pay != null ? Math.round(Number(r.calculated_pay)) : null;
                      const mealAmt = Number((r as any).meal_allowance_amount ?? 0);
                      const vehicleAmt = Number((r as any).vehicle_allowance_amount ?? 0);
                      const extraAmt = Number((r as any).extra_non_taxable_allowance_amount ?? 0);

                      const rowWeekStart = getWeekStart(r.work_date);
                      const rowWeeklyKey = `${r._workerKey}|${rowWeekStart}`;

                      const DAY_MAP_LOCAL: Record<string, number> = {
                        MON: 1,
                        TUE: 2,
                        WED: 3,
                        THU: 4,
                        FRI: 5,
                        SAT: 6,
                        SUN: 0,
                      };
                      const scheduledDayNumbers = (dpSettings?.weekly_work_day_list || [])
                        .map((d: string) => DAY_MAP_LOCAL[String(d).toUpperCase()])
                        .filter((n: number | undefined): n is number => n !== undefined);

                      // 소정근로일 중 마지막 요일 번호
                      const lastScheduledDayNum =
                        scheduledDayNumbers.length > 0 ? scheduledDayNumbers[scheduledDayNumbers.length - 1] : -1;

                      // 이 주의 이 직원 행들
                      const weekRows = records.filter(
                        (x) => x._workerKey === r._workerKey && getWeekStart(x.work_date) === rowWeekStart,
                      );

                      // 소정근로일 마지막 날에 해당하는 행
                      const lastScheduledRow = weekRows
                        .filter((x) => new Date(x.work_date + "T00:00:00").getDay() === lastScheduledDayNum)
                        .sort((a, b) => a.work_date.localeCompare(b.work_date))[0];

                      // 없으면 이 주 가장 마지막 행으로 fallback
                      const displayRow =
                        lastScheduledRow ?? weekRows.sort((a, b) => b.work_date.localeCompare(a.work_date))[0];

                      const weeklyHolidayPay =
                        displayRow && displayRow.id === r.id ? Number(weeklyHolidayMap.get(rowWeeklyKey) ?? 0) : 0;

                      const totalGross = (calcPay ?? 0) + weeklyHolidayPay + mealAmt + vehicleAmt + extraAmt;

                      const adjTax = {
                        totalDeductions: Number((r as any).total_deductions ?? 0),
                      };
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{formatDateDot(r.work_date)}</TableCell>
                          <TableCell>{site?.site_name || "-"}</TableCell>
                          <TableCell>{r.worker_name}</TableCell>
                          {preset !== "simple" && (
                            <TableCell className="text-sm text-muted-foreground">{r.job_type || "보통인부"}</TableCell>
                          )}
                          {preset === "detail" && <TableCell>{timeStr}</TableCell>}
                          {preset === "detail" && <TableCell className="text-right">{breakMin}분</TableCell>}
                          {preset === "detail" && (
                            <TableCell className="text-right">{formatWorkHours(workMin)}</TableCell>
                          )}
                          {preset === "detail" && (
                            <TableCell className="text-right text-muted-foreground">
                              {(() => {
                                const wh =
                                  r.work_hours != null ? Number(r.work_hours) : Number(r.work_minutes ?? 0) / 60;
                                return wh > 0 ? `${Math.round((wh / 8) * 100) / 100}공수` : "-";
                              })()}
                            </TableCell>
                          )}

                          <TableCell className="text-right">{displayCurrency(pb.regularPay)}</TableCell>

                          {preset === "detail" && detailCols.overtimePay && (
                            <TableCell className="text-right">{displayCurrency(pb.overtimePay)}</TableCell>
                          )}
                          {preset === "detail" && detailCols.nightPay && (
                            <TableCell className="text-right">{displayCurrency(pb.nightPay)}</TableCell>
                          )}
                          {dpSettings.enable_meal_allowance && (preset !== "detail" || detailCols.mealAllowance) && (
                            <TableCell className="text-right text-emerald-600">
                              {mealAmt > 0 ? displayCurrency(mealAmt) : "-"}
                            </TableCell>
                          )}
                          {dpSettings.enable_vehicle_allowance &&
                            (preset !== "detail" || detailCols.vehicleAllowance) && (
                              <TableCell className="text-right text-emerald-600">
                                {vehicleAmt > 0 ? displayCurrency(vehicleAmt) : "-"}
                              </TableCell>
                            )}
                          {dpSettings.enable_extra_non_taxable &&
                            (preset !== "detail" || detailCols.extraNonTaxable) && (
                              <TableCell className="text-right text-emerald-600">
                                {extraAmt > 0 ? displayCurrency(extraAmt) : "-"}
                              </TableCell>
                            )}
                          {preset === "detail" && detailCols.weeklyHolidayPay && (
                            <TableCell className="text-right text-blue-600">
                              {weeklyHolidayPay > 0 ? displayCurrency(weeklyHolidayPay) : "-"}
                            </TableCell>
                          )}
                          {preset === "detail" && detailCols.holidayPay && (
                            <TableCell className="text-right text-amber-600">
                              {pb.holidayPay > 0 ? displayCurrency(pb.holidayPay) : "-"}
                            </TableCell>
                          )}
                          <TableCell className="text-right font-medium">{displayCurrency(totalGross)}</TableCell>
                          {preset === "detail" && (
                            <TableCell className="text-right">{displayCurrency((r as any).income_tax)}</TableCell>
                          )}
                          {preset === "detail" && (
                            <TableCell className="text-right">{displayCurrency((r as any).local_income_tax)}</TableCell>
                          )}
                          {preset === "detail" && (
                            <TableCell className="text-right">
                              {displayCurrency((r as any).employment_insurance)}
                            </TableCell>
                          )}
                          {preset === "detail" && (
                            <TableCell className="text-right">{displayCurrency((r as any).national_pension)}</TableCell>
                          )}
                          {preset === "detail" && (
                            <TableCell className="text-right">{displayCurrency((r as any).health_insurance)}</TableCell>
                          )}
                          {preset === "detail" && (
                            <TableCell className="text-right">
                              {displayCurrency((r as any).long_term_care_insurance)}
                            </TableCell>
                          )}
                          {preset === "detail" && detailCols.industrialAccident && (
                            <TableCell className="text-right text-muted-foreground">
                              {displayCurrency((r as any).industrial_accident)}
                            </TableCell>
                          )}
                          <TableCell className="text-right">{displayCurrency(adjTax.totalDeductions)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {displayCurrency(totalGross - adjTax.totalDeductions)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="font-bold bg-muted">
                      <TableCell colSpan={3}>합계</TableCell>
                      {/* 직종 */}
                      {preset !== "simple" && <TableCell />}
                      {/* 근무시간/휴게/실근무 */}
                      {preset === "detail" && <TableCell />}
                      {preset === "detail" && <TableCell />}
                      {preset === "detail" && <TableCell />}
                      {preset === "detail" && (
                        <TableCell className="text-right text-muted-foreground text-sm">
                          {Math.round(
                            (records.reduce((s, r) => {
                              const wh =
                                (r as any).work_hours != null
                                  ? Number((r as any).work_hours)
                                  : Number(r.work_minutes ?? 0) / 60;
                              return s + wh;
                            }, 0) /
                              8) *
                              100,
                          ) / 100}
                          공수
                        </TableCell>
                      )}
                      {/* 기본급 */}
                      <TableCell className="text-right">
                        {displayCurrency(
                          records.reduce((s, r) => s + Math.round(Number((r as any).calculated_pay ?? 0)), 0),
                        )}
                      </TableCell>
                      {/* 연장수당 */}
                      {preset === "detail" && detailCols.overtimePay && (
                        <TableCell className="text-right">
                          {displayCurrency(records.reduce((s, r) => s + Number((r as any).overtime_pay ?? 0), 0))}
                        </TableCell>
                      )}
                      {/* 야간수당 */}
                      {preset === "detail" && detailCols.nightPay && (
                        <TableCell className="text-right">
                          {displayCurrency(records.reduce((s, r) => s + Number((r as any).night_pay ?? 0), 0))}
                        </TableCell>
                      )}
                      {/* 식대 */}
                      {dpSettings.enable_meal_allowance && (preset !== "detail" || detailCols.mealAllowance) && (
                        <TableCell className="text-right text-emerald-600">
                          {displayCurrency(
                            records.reduce((s, r) => s + Number((r as any).meal_allowance_amount ?? 0), 0),
                          )}
                        </TableCell>
                      )}
                      {/* 차량운전보조금 */}
                      {dpSettings.enable_vehicle_allowance && (preset !== "detail" || detailCols.vehicleAllowance) && (
                        <TableCell className="text-right text-emerald-600">
                          {displayCurrency(
                            records.reduce((s, r) => s + Number((r as any).vehicle_allowance_amount ?? 0), 0),
                          )}
                        </TableCell>
                      )}
                      {/* 기타수당 */}
                      {dpSettings.enable_extra_non_taxable && (preset !== "detail" || detailCols.extraNonTaxable) && (
                        <TableCell className="text-right text-emerald-600">
                          {displayCurrency(
                            records.reduce((s, r) => s + Number((r as any).extra_non_taxable_allowance_amount ?? 0), 0),
                          )}
                        </TableCell>
                      )}
                      {/* 주휴수당 */}
                      {preset === "detail" && detailCols.weeklyHolidayPay && (
                        <TableCell className="text-right text-blue-600">
                          {displayCurrency(
                            Array.from(
                              new Set(records.map((r) => `${r._workerKey}|${getWeekStart(r.work_date)}`)),
                            ).reduce((s, key) => s + Number(weeklyHolidayMap.get(key) ?? 0), 0),
                          )}
                        </TableCell>
                      )}
                      {/* 휴일수당 */}
                      {preset === "detail" && detailCols.holidayPay && (
                        <TableCell className="text-right text-amber-600">
                          {displayCurrency(records.reduce((s, r) => s + Number((r as any).holiday_pay ?? 0), 0))}
                        </TableCell>
                      )}
                      {/* 지급총액 */}
                      <TableCell className="text-right font-medium">
                        {formatCurrency(
                          records.reduce((s, r) => {
                            const calcPay = r.calculated_pay != null ? Math.round(Number(r.calculated_pay)) : 0;
                            const mealAmt = Number((r as any).meal_allowance_amount ?? 0);
                            const vehicleAmt = Number((r as any).vehicle_allowance_amount ?? 0);
                            const extraAmt = Number((r as any).extra_non_taxable_allowance_amount ?? 0);
                            const rowWeekStart = getWeekStart(r.work_date);
                            const rowWeeklyKey = `${r._workerKey}|${rowWeekStart}`;
                            const DAY_MAP_LOCAL: Record<string, number> = {
                              MON: 1,
                              TUE: 2,
                              WED: 3,
                              THU: 4,
                              FRI: 5,
                              SAT: 6,
                              SUN: 0,
                            };
                            const scheduledDayNumbers = (dpSettings?.weekly_work_day_list || [])
                              .map((d: string) => DAY_MAP_LOCAL[String(d).toUpperCase()])
                              .filter((n: number | undefined): n is number => n !== undefined);
                            const lastScheduledDayNum =
                              scheduledDayNumbers.length > 0 ? scheduledDayNumbers[scheduledDayNumbers.length - 1] : -1;
                            const weekRows = records.filter(
                              (x) => x._workerKey === r._workerKey && getWeekStart(x.work_date) === rowWeekStart,
                            );
                            const lastScheduledRow = weekRows
                              .filter((x) => new Date(x.work_date + "T00:00:00").getDay() === lastScheduledDayNum)
                              .sort((a, b) => a.work_date.localeCompare(b.work_date))[0];
                            const displayRow =
                              lastScheduledRow ?? weekRows.sort((a, b) => b.work_date.localeCompare(a.work_date))[0];
                            const weeklyHolidayPay =
                              displayRow && displayRow.id === r.id
                                ? Number(weeklyHolidayMap.get(rowWeeklyKey) ?? 0)
                                : 0;
                            return s + calcPay + weeklyHolidayPay + mealAmt + vehicleAmt + extraAmt;
                          }, 0),
                        )}
                      </TableCell>
                      {/* 소득세~산재 */}
                      {preset === "detail" && (
                        <TableCell className="text-right">
                          {displayCurrency(records.reduce((s, r) => s + Number((r as any).income_tax ?? 0), 0))}
                        </TableCell>
                      )}
                      {preset === "detail" && (
                        <TableCell className="text-right">
                          {displayCurrency(records.reduce((s, r) => s + Number((r as any).local_income_tax ?? 0), 0))}
                        </TableCell>
                      )}
                      {preset === "detail" && (
                        <TableCell className="text-right">
                          {displayCurrency(
                            records.reduce((s, r) => s + Number((r as any).employment_insurance ?? 0), 0),
                          )}
                        </TableCell>
                      )}
                      {preset === "detail" && (
                        <TableCell className="text-right">
                          {displayCurrency(records.reduce((s, r) => s + Number((r as any).national_pension ?? 0), 0))}
                        </TableCell>
                      )}
                      {preset === "detail" && (
                        <TableCell className="text-right">
                          {displayCurrency(records.reduce((s, r) => s + Number((r as any).health_insurance ?? 0), 0))}
                        </TableCell>
                      )}
                      {preset === "detail" && (
                        <TableCell className="text-right">
                          {displayCurrency(
                            records.reduce((s, r) => s + Number((r as any).long_term_care_insurance ?? 0), 0),
                          )}
                        </TableCell>
                      )}
                      {preset === "detail" && detailCols.industrialAccident && (
                        <TableCell className="text-right text-muted-foreground">
                          {displayCurrency(
                            records.reduce((s, r) => s + Number((r as any).industrial_accident ?? 0), 0),
                          )}
                        </TableCell>
                      )}
                      {/* 공제합계 */}
                      <TableCell className="text-right">
                        {displayCurrency(records.reduce((s, r) => s + Number((r as any).total_deductions ?? 0), 0))}
                      </TableCell>
                      {/* 실수령액 */}
                      <TableCell className="text-right font-medium">
                        {formatCurrency(
                          records.reduce((s, r) => {
                            const calcPay = r.calculated_pay != null ? Math.round(Number(r.calculated_pay)) : 0;
                            const mealAmt = Number((r as any).meal_allowance_amount ?? 0);
                            const vehicleAmt = Number((r as any).vehicle_allowance_amount ?? 0);
                            const extraAmt = Number((r as any).extra_non_taxable_allowance_amount ?? 0);
                            const rowWeekStart = getWeekStart(r.work_date);
                            const rowWeeklyKey = `${r._workerKey}|${rowWeekStart}`;
                            const DAY_MAP_LOCAL: Record<string, number> = {
                              MON: 1,
                              TUE: 2,
                              WED: 3,
                              THU: 4,
                              FRI: 5,
                              SAT: 6,
                              SUN: 0,
                            };
                            const scheduledDayNumbers = (dpSettings?.weekly_work_day_list || [])
                              .map((d: string) => DAY_MAP_LOCAL[String(d).toUpperCase()])
                              .filter((n: number | undefined): n is number => n !== undefined);
                            const lastScheduledDayNum =
                              scheduledDayNumbers.length > 0 ? scheduledDayNumbers[scheduledDayNumbers.length - 1] : -1;
                            const weekRows = records.filter(
                              (x) => x._workerKey === r._workerKey && getWeekStart(x.work_date) === rowWeekStart,
                            );
                            const lastScheduledRow = weekRows
                              .filter((x) => new Date(x.work_date + "T00:00:00").getDay() === lastScheduledDayNum)
                              .sort((a, b) => a.work_date.localeCompare(b.work_date))[0];
                            const displayRow =
                              lastScheduledRow ?? weekRows.sort((a, b) => b.work_date.localeCompare(a.work_date))[0];
                            const weeklyHolidayPay =
                              displayRow && displayRow.id === r.id
                                ? Number(weeklyHolidayMap.get(rowWeeklyKey) ?? 0)
                                : 0;
                            return (
                              s +
                              calcPay +
                              weeklyHolidayPay +
                              mealAmt +
                              vehicleAmt +
                              extraAmt -
                              Number((r as any).total_deductions ?? 0)
                            );
                          }, 0),
                        )}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {showLaborReport && (
        <LaborReportPrint
          year={year}
          month={month}
          lastDay={lastDay}
          paymentDay={dpSettings.payment_day ?? 25}
          selectedSiteName={filterLabel}
          workerSummary={workerSummary}
          records={records as any}
          sites={sites}
          weeklyHolidayMap={weeklyHolidayMap}
          dpSettings={dpSettings}
          grandTotal={grandTotal}
          grandDeductions={grandDeductions}
          grandNetPay={grandNetPay}
          onClose={() => setShowLaborReport(false)}
        />
      )}
      {showPayslip && selectedWorker && (
        <WorkerPayslip
          workerName={
            selectedWorker.ssn_masked
              ? (workerSummary.find((w) => w.ssnMasked === selectedWorker.ssn_masked)?.name ??
                selectedWorker.worker_name)
              : selectedWorker.worker_name
          }
          ssnMasked={selectedWorker.ssn_masked ?? "-"}
          phone={(selectedWorker as any).phone ?? null}
          jobType={
            Array.from(workerSummary.find((w) => w.name === selectedWorker.worker_name)?.jobTypes ?? []).join(", ") ||
            "-"
          }
          firstWorkDate={workerSummary.find((w) => w.name === selectedWorker.worker_name)?.firstWorkDate ?? ""}
          year={year}
          month={month}
          lastDay={lastDay}
          paymentDay={dpSettings.payment_day ?? 25}
          records={records as any}
          sites={sites}
          weeklyHolidayMap={weeklyHolidayMap}
          dpSettings={dpSettings}
          onClose={() => setShowPayslip(false)}
        />
      )}
    </div>
  );
}
