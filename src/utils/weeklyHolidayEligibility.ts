import type { DailyAttendanceRecord } from "@/hooks/useDailyAttendance";

const DAY_MAP: Record<string, number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 0,
};

function cleanPhone(value: string | null | undefined): string {
  return String(value || "").replace(/[^0-9]/g, "");
}

function normalizeName(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveWorkerKey(record: Pick<DailyAttendanceRecord, "worker_name" | "ssn_masked" | "phone">): string {
  if (record.ssn_masked) return `SSN:${record.ssn_masked}`;
  const phone = cleanPhone(record.phone);
  if (phone) return `PHONE:${phone}`;
  return `NAME:${normalizeName(record.worker_name)}`;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getWeekStart(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0=일, 1=월
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function getWeekEnd(weekStart: Date): Date {
  const sunday = new Date(weekStart);
  sunday.setDate(weekStart.getDate() + 6);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

function getPrescribedDates(weekStart: Date, weeklyWorkDayList: string[]): string[] {
  const validDays = new Set(weeklyWorkDayList || []);
  const result: string[] = [];

  for (let i = 0; i < 7; i++) {
    const current = new Date(weekStart);
    current.setDate(weekStart.getDate() + i);
    const dow = current.getDay(); // 0=일, 1=월
    const upper = Object.keys(DAY_MAP).find((key) => DAY_MAP[key] === dow);

    if (upper && validDays.has(upper)) {
      result.push(formatDate(current));
    }
  }

  return result;
}

function sortRecordsForLatestRate(records: DailyAttendanceRecord[]): DailyAttendanceRecord[] {
  return [...records].sort((a, b) => {
    const dateCmp = String(a.work_date).localeCompare(String(b.work_date));
    if (dateCmp !== 0) return dateCmp;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
}

export interface WeeklyHolidayEligibilityInput {
  organizationId: string;
  workerKey: string;
  workerName: string;
  targetDate: string;
  records: DailyAttendanceRecord[];
  weeklyWorkDayList: string[];
  weeklyHoliday: string;
  weeklyWorkHours: number;

  /**
   * 회사 도입 기준월.
   * 예: 2026-03이면 2026년 4월 첫 주 계산 시
   * 3월 마지막 주 소정근로일을 결근으로 보지 않도록 보정한다.
   */
  payrollStartMonth?: string | null;
}

export interface WeeklyHolidayEligibilityResult {
  organization_id: string;
  worker_key: string;
  worker_name: string;

  week_start: string;
  week_end: string;

  worked_site_ids: string[];

  weekly_work_day_list: string[];
  weekly_holiday: string;
  weekly_work_hours: number;

  prescribed_dates: string[];
  worked_dates: string[];
  total_work_minutes: number;

  is_eligible: boolean;
  reason: string;

  applied_hourly_rate: number;
  has_mixed_hourly_rate: boolean;
  rate_source: "latest_in_week" | "none";

  weekly_holiday_pay: number;
  calculated_at: string;
}

export function calculateWeeklyHolidayEligibility(
  input: WeeklyHolidayEligibilityInput,
): WeeklyHolidayEligibilityResult {
  const weekStartDate = getWeekStart(input.targetDate);
  const weekEndDate = getWeekEnd(weekStartDate);
  const week_start = formatDate(weekStartDate);
  const week_end = formatDate(weekEndDate);

  const raw_prescribed_dates = getPrescribedDates(weekStartDate, input.weeklyWorkDayList || []);

const targetMonth = String(input.targetDate).slice(0, 7);
const payrollStartMonth = input.payrollStartMonth || null;

/**
 * 첫 달/도입월 보정:
 * 월 초 첫 주가 이전 달 날짜를 포함하는 경우,
 * payrollStartMonth가 이전 달 이하로 설정되어 있으면
 * 이전 달 날짜는 결근으로 보지 않는다.
 *
 * 예:
 * - 계산월: 2026-04
 * - 첫 주: 2026-03-30 ~ 2026-04-05
 * - payrollStartMonth: 2026-03
 * → 2026-03-30, 2026-03-31은 결근 체크에서 제외
 */
const prescribed_dates =
  payrollStartMonth && payrollStartMonth < targetMonth
    ? raw_prescribed_dates.filter((date) => date.slice(0, 7) === targetMonth)
    : raw_prescribed_dates;

  const workerWeekRecords = input.records.filter((r) => {
    if (r.organization_id !== input.organizationId) return false;
    if (resolveWorkerKey(r) !== input.workerKey) return false;

    const workDate = String(r.work_date).slice(0, 10);
    return workDate >= week_start && workDate <= week_end;
  });

  const hourlyRecords = workerWeekRecords.filter((r) => r.work_type === "hourly");

  const worked_site_ids = Array.from(new Set(hourlyRecords.map((r) => r.site_id))).sort();

  if ((input.weeklyWorkDayList || []).length === 0) {
    return {
      organization_id: input.organizationId,
      worker_key: input.workerKey,
      worker_name: input.workerName,
      week_start,
      week_end,
      worked_site_ids,
      weekly_work_day_list: input.weeklyWorkDayList || [],
      weekly_holiday: input.weeklyHoliday,
      weekly_work_hours: input.weeklyWorkHours,
      prescribed_dates: [],
      worked_dates: [],
      total_work_minutes: 0,
      is_eligible: false,
      reason: "소정근로일 없음",
      applied_hourly_rate: 0,
      has_mixed_hourly_rate: false,
      rate_source: "none",
      weekly_holiday_pay: 0,
      calculated_at: new Date().toISOString(),
    };
  }

  if (hourlyRecords.length === 0) {
    return {
      organization_id: input.organizationId,
      worker_key: input.workerKey,
      worker_name: input.workerName,
      week_start,
      week_end,
      worked_site_ids,
      weekly_work_day_list: input.weeklyWorkDayList || [],
      weekly_holiday: input.weeklyHoliday,
      weekly_work_hours: input.weeklyWorkHours,
      prescribed_dates,
      worked_dates: [],
      total_work_minutes: 0,
      is_eligible: false,
      reason: "시급제 기록 없음",
      applied_hourly_rate: 0,
      has_mixed_hourly_rate: false,
      rate_source: "none",
      weekly_holiday_pay: 0,
      calculated_at: new Date().toISOString(),
    };
  }

  const workMinutesByDate = new Map<string, number>();
  for (const record of hourlyRecords) {
    const date = String(record.work_date).slice(0, 10);
    const prev = workMinutesByDate.get(date) ?? 0;
    workMinutesByDate.set(date, prev + Number(record.work_minutes ?? 0));
  }

  const worked_dates = Array.from(workMinutesByDate.entries())
    .filter(([, minutes]) => minutes > 0)
    .map(([date]) => date)
    .sort();

  const total_work_minutes = Array.from(workMinutesByDate.values()).reduce((sum, v) => sum + v, 0);

  const sortedForLatest = sortRecordsForLatestRate(hourlyRecords);
  const latestHourlyRecord = sortedForLatest[sortedForLatest.length - 1];
  const applied_hourly_rate = Number(latestHourlyRecord?.daily_wage ?? 0);

  const uniqueRates = Array.from(new Set(hourlyRecords.map((r) => Number(r.daily_wage ?? 0)).filter((v) => v > 0)));
  const has_mixed_hourly_rate = uniqueRates.length > 1;

  const missing_dates = prescribed_dates.filter((date) => !worked_dates.includes(date));
  if (missing_dates.length > 0) {
    return {
      organization_id: input.organizationId,
      worker_key: input.workerKey,
      worker_name: input.workerName,
      week_start,
      week_end,
      worked_site_ids,
      weekly_work_day_list: input.weeklyWorkDayList || [],
      weekly_holiday: input.weeklyHoliday,
      weekly_work_hours: input.weeklyWorkHours,
      prescribed_dates,
      worked_dates,
      total_work_minutes,
      is_eligible: false,
      reason: `결근 있음: ${missing_dates.join(", ")}`,
      applied_hourly_rate,
      has_mixed_hourly_rate,
      rate_source: "latest_in_week",
      weekly_holiday_pay: 0,
      calculated_at: new Date().toISOString(),
    };
  }

  if (total_work_minutes < 15 * 60) {
    return {
      organization_id: input.organizationId,
      worker_key: input.workerKey,
      worker_name: input.workerName,
      week_start,
      week_end,
      worked_site_ids,
      weekly_work_day_list: input.weeklyWorkDayList || [],
      weekly_holiday: input.weeklyHoliday,
      weekly_work_hours: input.weeklyWorkHours,
      prescribed_dates,
      worked_dates,
      total_work_minutes,
      is_eligible: false,
      reason: "주 15시간 미만",
      applied_hourly_rate,
      has_mixed_hourly_rate,
      rate_source: "latest_in_week",
      weekly_holiday_pay: 0,
      calculated_at: new Date().toISOString(),
    };
  }

  const prescribedDayCount = prescribed_dates.length;
  const actualWeeklyHours = total_work_minutes / 60;
  const dailyPrescribedHours = prescribedDayCount > 0 ? Math.min(actualWeeklyHours / prescribedDayCount, 8) : 0;
  const weekly_holiday_pay = Math.round(applied_hourly_rate * dailyPrescribedHours);

  return {
    organization_id: input.organizationId,
    worker_key: input.workerKey,
    worker_name: input.workerName,
    week_start,
    week_end,
    worked_site_ids,
    weekly_work_day_list: input.weeklyWorkDayList || [],
    weekly_holiday: input.weeklyHoliday,
    weekly_work_hours: input.weeklyWorkHours,
    prescribed_dates,
    worked_dates,
    total_work_minutes,
    is_eligible: true,
    reason: "주휴수당 발생",
    applied_hourly_rate,
    has_mixed_hourly_rate,
    rate_source: "latest_in_week",
    weekly_holiday_pay,
    calculated_at: new Date().toISOString(),
  };
}
