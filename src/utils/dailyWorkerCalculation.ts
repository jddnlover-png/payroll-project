/**
 * 일용직 현장관리 전용 계산 유틸리티
 * 기존 salaryDetailCalculation.ts / dailyPayrollCalculation.ts 절대 수정 금지
 *
 * STEP 1~8 안전장치 순서대로 실행
 */

// ─── STEP 1: 분 단위 변환 ───
export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

// ─── STEP 2: 익일 퇴근 보정 ───
export function adjustEndTime(startMin: number, endMin: number): number {
  if (endMin <= startMin) {
    return endMin + 1440;
  }
  return endMin;
}

// ─── STEP 2.5: 야간시간 구간 교집합 ───
function overlap(workStart: number, workEnd: number, rangeStart: number, rangeEnd: number): number {
  return Math.max(0, Math.min(workEnd, rangeEnd) - Math.max(workStart, rangeStart));
}

export function calculateNightMinutes(startMin: number, endMin: number): number {
  // endMin은 이미 STEP 2 보정 완료된 값
  if (endMin <= startMin) return 0;

  let nightMin = 0;

  if (endMin <= 1440) {
    // 같은 날 내 근무
    nightMin += overlap(startMin, endMin, 0, 360); // 00:00~06:00
    nightMin += overlap(startMin, endMin, 1320, 1440); // 22:00~24:00
  } else {
    // 익일 퇴근: 두 구간으로 분리
    // 첫째 날: startMin ~ 1440
    nightMin += overlap(startMin, 1440, 0, 360);
    nightMin += overlap(startMin, 1440, 1320, 1440);
    // 둘째 날 (0 ~ endMin-1440)
    const nextDayEnd = endMin - 1440;
    nightMin += overlap(0, nextDayEnd, 0, 360);
    nightMin += overlap(0, nextDayEnd, 1320, 1440);
  }

  return nightMin;
}

// ─── STEP 3: 근무시간 계산 ───
export function calculateWorkMinutes(
  startTime: string | null,
  endTime: string | null,
  workHours: number | null,
  breakMinutes: number,
): { workMin: number; startMin: number; endMin: number } {
  if (workHours != null && workHours > 0 && (!startTime || !endTime)) {
    return { workMin: Math.round(workHours * 60), startMin: 0, endMin: 0 };
  }

  if (!startTime || !endTime) {
    return { workMin: 0, startMin: 0, endMin: 0 };
  }

  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  endMin = adjustEndTime(startMin, endMin);

  const workMin = endMin - startMin - breakMinutes;
  return { workMin, startMin, endMin };
}

// ─── STEP 4: 휴게시간 초과 검사 ───
export function validateBreakTime(
  startTime: string | null,
  endTime: string | null,
  breakMinutes: number,
): { valid: boolean; error?: string; suggestedBreak?: number } {
  if (!startTime || !endTime) return { valid: true };

  const startMin = toMinutes(startTime);
  let endMin = toMinutes(endTime);
  endMin = adjustEndTime(startMin, endMin);
  const totalSpan = endMin - startMin;

  if (breakMinutes >= totalSpan) {
    return {
      valid: false,
      error: "휴게시간이 근무시간 이상입니다.",
      suggestedBreak: totalSpan - 1,
    };
  }
  return { valid: true };
}

// ─── STEP 5: 24시간 초과 검사 ───
export type WorkdayWarning = "block" | "strong_warning" | "warning" | "ok";
export function checkDailyTotal(totalMin: number): { level: WorkdayWarning; message?: string } {
  if (totalMin > 1440) return { level: "block", message: "하루 근무는 24시간을 초과할 수 없습니다." };
  if (totalMin > 1200) return { level: "strong_warning", message: "하루 20시간 이상 근무입니다. 계속하시겠습니까?" };
  if (totalMin > 960) return { level: "warning", message: "하루 16시간 이상 근무입니다. 계속하시겠습니까?" };
  return { level: "ok" };
}

// ─── STEP 5.5: 야간 > 전체 방어 ───
export function validateNightVsWork(nightMin: number, workMin: number): { valid: boolean; error?: string } {
  if (nightMin > workMin) {
    return { valid: false, error: "야간시간이 전체 근무시간을 초과했습니다. 출퇴근시간 또는 휴게시간을 확인해주세요." };
  }
  return { valid: true };
}

// ─── STEP 6: 최종 방어 ───
export function validatePositiveWork(workMin: number): { valid: boolean; error?: string } {
  if (workMin <= 0) {
    return { valid: false, error: "근무시간이 0 이하입니다. 출퇴근시간 또는 휴게시간을 확인해주세요." };
  }
  return { valid: true };
}

// ─── STEP 7: fingerprint 생성 ───
export async function generateFingerprint(
  siteId: string,
  identityKey: string,
  workDate: string,
  startTime: string | null,
  endTime: string | null,
  workHours: number | null,
  finalPay: number,
): Promise<string> {
  const raw = `${siteId}|${identityKey}|${workDate}|${startTime || ""}|${endTime || ""}|${workHours ?? 0}|${finalPay}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── STEP 8: calculation_snapshot 생성 ───
export interface CalculationSnapshot {
  calculated_at: string;
  work_type: "fixed" | "hourly";
  daily_wage?: number;
  calculated_pay: number;
  day_type?: DayType;
  rates?: {
    hourly_rate: number;
    overtime_rate: number;
    night_rate: number;
  };
  hours?: {
    regular_hours: number;
    overtime_hours: number;
    night_hours: number;
    holiday_hours: number;
    break_minutes: number;
  };
  pay_breakdown?: {
    regular_pay: number;
    overtime_pay: number;
    night_pay: number;
    holiday_pay: number;
    calculated_pay: number;
  };
}

export function createSnapshot(params: {
  workType: "fixed" | "hourly";
  dailyWage: number;
  calculatedPay: number;
  hourlyRate?: number;
  regularHours?: number;
  overtimeHours?: number;
  nightHours?: number;
  holidayHours?: number;
  breakMinutes?: number;
  overtimePay?: number;
  nightPay?: number;
  regularPay?: number;
  holidayPay?: number;
  dayType?: DayType;
}): CalculationSnapshot {
  const now = new Date().toISOString();

  if (params.workType === "fixed") {
    return {
      calculated_at: now,
      work_type: "fixed",
      daily_wage: params.dailyWage,
      calculated_pay: params.calculatedPay,
      day_type: params.dayType,
    };
  }

  return {
    calculated_at: now,
    work_type: "hourly",
    calculated_pay: params.calculatedPay,
    day_type: params.dayType,
    rates: {
      hourly_rate: params.hourlyRate || 0,
      overtime_rate: 1.5,
      night_rate: 0.5,
    },
    hours: {
      regular_hours: params.regularHours || 0,
      overtime_hours: params.overtimeHours || 0,
      night_hours: params.nightHours || 0,
      holiday_hours: params.holidayHours || 0,
      break_minutes: params.breakMinutes || 0,
    },
    pay_breakdown: {
      regular_pay: params.regularPay || 0,
      overtime_pay: params.overtimePay || 0,
      night_pay: params.nightPay || 0,
      holiday_pay: params.holidayPay || 0,
      calculated_pay: params.calculatedPay,
    },
  };
}

// ─── 급여 계산 (fixed / hourly) ───
// startMin/endMin/breakMinutes를 전달하면 18:00 기준 구간별 휴게 차감 적용
export function calculateDailyWorkerPay(params: {
  workType: "fixed" | "hourly";
  dailyWage: number; // daily_rate for fixed, hourly_rate for hourly
  workMinutes: number;
  nightMinutes: number;
  standardHours?: number;
  startMin?: number;
  endMin?: number;
  breakMinutes?: number;
}): {
  regularHours: number;
  overtimeHours: number;
  nightHours: number;
  regularPay: number;
  overtimePay: number;
  nightPay: number;
  calculatedPay: number;
} {
  const stdHours = params.standardHours || 8;
  const stdMin = stdHours * 60;
  const nightHours = Math.round((params.nightMinutes / 60) * 100) / 100;

  // ── 시급제: 총 근무시간 8시간 초과 기준 연장 분리 ──
  // ── 고정일당: 기존 로직 유지 ──
  const totalWorkMin = params.workMinutes;
  const regularMin = Math.min(totalWorkMin, stdMin);
  const overtimeMin = Math.max(0, totalWorkMin - stdMin);

  if (params.workType === "fixed") {
    const overtimeHrs = Math.round((overtimeMin / 60) * 100) / 100;
    const impliedHourly = params.dailyWage / stdHours;
    const overtimePay = overtimeMin > 0 ? Math.round(impliedHourly * 1.5 * (overtimeMin / 60)) : 0;
    const nightPay = params.nightMinutes > 0 ? Math.round(impliedHourly * 0.5 * (params.nightMinutes / 60)) : 0;

    // 0.5공수(4h) 등 8h 미만: 일당 비율 지급
    // 1.0공수(8h): 일당 전액
    // 1.5공수 이상: 일당 + 연장수당
    const basePay = totalWorkMin < stdMin ? Math.round(params.dailyWage * (totalWorkMin / stdMin)) : params.dailyWage;

    return {
      regularHours: Math.round((regularMin / 60) * 100) / 100,
      overtimeHours: overtimeHrs,
      nightHours,
      regularPay: basePay,
      overtimePay,
      nightPay,
      calculatedPay: basePay + overtimePay,
    };
  }

  // hourly
  const rate = params.dailyWage;
  const regularHours = Math.round((regularMin / 60) * 100) / 100;
  const overtimeHours = Math.round((overtimeMin / 60) * 100) / 100;

  const regularPay = Math.round(rate * (regularMin / 60));
  const overtimePay = Math.round(rate * 1.5 * (overtimeMin / 60));
  const nightPay = params.nightMinutes > 0 ? Math.round(rate * 0.5 * (params.nightMinutes / 60)) : 0;

  return {
    regularHours,
    overtimeHours,
    nightHours,
    regularPay,
    overtimePay,
    nightPay,
    calculatedPay: regularPay + overtimePay + nightPay,
  };
}

// ─── 날짜 성격 판정 (시급제 전용) ───
export type DayType = "workday" | "weekly_holiday" | "unpaid_holiday" | "offday";

const DAY_INDEX_TO_KEY: Record<number, string> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};
const DAY_INDEX_TO_UPPER: Record<number, string> = {
  0: "SUN",
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
};

export function classifyDayType(
  workDate: string,
  weeklyWorkDayList: string[],
  weeklyHoliday: string,
  nonWorkDayDefaultType: string,
): DayType {
  if (!workDate) return "workday";
  const d = new Date(`${workDate}T00:00:00`);
  const dow = d.getDay();
  const upper = DAY_INDEX_TO_UPPER[dow];
  const lower = DAY_INDEX_TO_KEY[dow];

  if (weeklyWorkDayList.includes(upper)) return "workday";
  if (lower === String(weeklyHoliday).toLowerCase()) return "weekly_holiday";
  return nonWorkDayDefaultType === "HOLIDAY" ? "unpaid_holiday" : "offday";
}

// ─── 상위 래퍼: 일용직 급여 계산 (fixed/hourly + dayType 분기) ───
export interface DailyAttendancePayrollResult {
  regularHours: number;
  overtimeHours: number;
  nightHours: number;
  holidayHours: number;
  regularPay: number;
  overtimePay: number;
  nightPay: number;
  holidayPay: number;
  calculatedPay: number;
  dayType: DayType;
}

export function calculateDailyAttendancePayroll(params: {
  workType: "fixed" | "hourly";
  dailyWage: number;
  workMinutes: number;
  nightMinutes: number;
  standardHours?: number;
  dayType: DayType;
}): DailyAttendancePayrollResult {
  const { workType, dailyWage, workMinutes, nightMinutes, dayType } = params;
  const stdHours = params.standardHours || 8;
  const stdMin = stdHours * 60;

  // ── 고정일당: 기존 로직 그대로, 휴일가산 없음 ──
  if (workType === "fixed") {
    const base = calculateDailyWorkerPay({
      workType: "fixed",
      dailyWage,
      workMinutes,
      nightMinutes,
    });
    return {
      ...base,
      holidayHours: 0,
      holidayPay: 0,
      dayType,
    };
  }

  // ── 시급제: dayType에 따라 분기 ──
  const rate = dailyWage; // hourly rate
  const nightHours = Math.round((nightMinutes / 60) * 100) / 100;

  if (dayType === "workday" || dayType === "offday") {
    // 일반근로: 기존 calculateDailyWorkerPay 재사용
    const base = calculateDailyWorkerPay({
      workType: "hourly",
      dailyWage: rate,
      workMinutes,
      nightMinutes,
    });
    return {
      ...base,
      holidayHours: 0,
      holidayPay: 0,
      dayType,
    };
  }

  // ── 휴일근로 (weekly_holiday / unpaid_holiday) ──
  const totalWorkMin = workMinutes;
  const regularMin = Math.min(totalWorkMin, stdMin);
  const overtimeMin = Math.max(0, totalWorkMin - stdMin);

  const regularHours = Math.round((regularMin / 60) * 100) / 100;
  const overtimeHours = Math.round((overtimeMin / 60) * 100) / 100;

  // base 1.0 (전체 시간에 대한 기본급)
  const regularPay = Math.round(rate * (regularMin / 60));

  // 8시간 이내 휴일가산 0.5
  const holidayHours8 = Math.round((regularMin / 60) * 100) / 100;
  const holidayPay8 = Math.round(rate * 0.5 * (regularMin / 60));

  // 8시간 초과분: 연장으로 표시 (1.5배 = base 1.0 + 가산 0.5)
  // base 1.0은 이미 regularPay가 아닌 overtimePay에 포함
  const overtimePay = overtimeMin > 0 ? Math.round(rate * 1.5 * (overtimeMin / 60)) : 0;

  // 야간 0.5 (별도 중첩)
  const nightPay = nightMinutes > 0 ? Math.round(rate * 0.5 * (nightMinutes / 60)) : 0;

  const calculatedPay = regularPay + holidayPay8 + overtimePay + nightPay;

  return {
    regularHours,
    overtimeHours,
    nightHours,
    holidayHours: holidayHours8,
    regularPay,
    overtimePay,
    nightPay,
    holidayPay: holidayPay8,
    calculatedPay,
    dayType,
  };
}

// ─── 전체 파이프라인 (STEP 1~8) ───
export interface DailyWorkerEntry {
  siteId: string;
  workerName: string;
  workDate: string;
  workType: "fixed" | "hourly";
  startTime: string | null;
  endTime: string | null;
  workHours: number | null;
  breakMinutes: number;
  dailyWage: number;
  finalPay?: number;
  memo?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: { level: WorkdayWarning; message: string };
}

export function validateEntry(entry: DailyWorkerEntry, existingDayMinutes: number = 0): ValidationResult {
  // STEP 4
  const breakCheck = validateBreakTime(entry.startTime, entry.endTime, entry.breakMinutes);
  if (!breakCheck.valid) return { valid: false, error: breakCheck.error };

  // STEP 3
  const { workMin, startMin, endMin } = calculateWorkMinutes(
    entry.startTime,
    entry.endTime,
    entry.workHours,
    entry.breakMinutes,
  );

  // STEP 5
  const totalMin = existingDayMinutes + workMin;
  const dayCheck = checkDailyTotal(totalMin);
  if (dayCheck.level === "block") return { valid: false, error: dayCheck.message };

  // STEP 5.5
  if (entry.startTime && entry.endTime) {
    const sMin = toMinutes(entry.startTime);
    const eMin = adjustEndTime(sMin, toMinutes(entry.endTime));
    const nightMin = calculateNightMinutes(sMin, eMin);
    const nightVsWork = validateNightVsWork(nightMin, workMin);
    if (!nightVsWork.valid) return { valid: false, error: nightVsWork.error };
  }

  // STEP 6
  const posCheck = validatePositiveWork(workMin);
  if (!posCheck.valid) return { valid: false, error: posCheck.error };

  // STEP 5 warning (after all blocking checks)
  if (dayCheck.level !== "ok") {
    return { valid: true, warning: { level: dayCheck.level, message: dayCheck.message! } };
  }

  return { valid: true };
}
