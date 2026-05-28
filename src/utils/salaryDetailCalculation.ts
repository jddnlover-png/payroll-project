/**
 * salary_details 계산 로직
 *
 * 4단계: 요일별 수당 계산 (주5일/6일, 토/일/공휴일)
 * 5단계: 기본급(1.0) + Alpha(가산분) 분리 모델
 *
 * ※ 기존 근태 기록 로직, 월급제 고정급 로직 절대 수정 금지
 * ※ 모든 배율은 설정값 실시간 참조, 하드코딩 금지
 * ※ 월급제 직원은 이 로직에서 완전 제외
 */

import { OrganizationSettings } from "@/hooks/useOrganizationSettings";
import { calculateSingleAttendance, WorkHoursBreakdown, getKSTMinutes } from "@/utils/attendanceCalculation";
import { calculateNightTierMinutes } from "@/hooks/useDailyWageSnapshots";

// 대한민국 법정 공휴일 (매년 고정 날짜)
const FIXED_PUBLIC_HOLIDAYS: Array<[number, number]> = [
  [1, 1], // 신정
  [3, 1], // 삼일절
  [5, 1], // 근로자의 날
  [5, 5], // 어린이날
  [6, 6], // 현충일
  [8, 15], // 광복절
  [10, 3], // 개천절
  [10, 9], // 한글날
  [12, 25], // 크리스마스
];

// 음력 기반 공휴일 (매년 다르므로 2025~2027 하드코딩, 이후 확장)
const LUNAR_HOLIDAYS: Record<number, string[]> = {
  2025: ["2025-01-28", "2025-01-29", "2025-01-30", "2025-05-05", "2025-10-05", "2025-10-06", "2025-10-07"],
  2026: [
    "2026-02-16",
    "2026-02-17",
    "2026-02-18",
    "2026-03-02",
    "2026-05-06",
    "2026-05-24",
    "2026-09-24",
    "2026-09-25",
    "2026-09-26",
  ],
  2027: ["2027-02-06", "2027-02-07", "2027-02-08", "2027-05-13", "2027-10-14", "2027-10-15", "2027-10-16"],
};

export interface AttendanceRawRecord {
  id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  break_minutes: number | null;
  work_type: string | null;
  is_holiday: boolean | null;
}

function normalizeDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface SalaryDetailResult {
  employee_id: string;
  pay_year_month: string;
  regular_pay: number;
  overtime_pay: number;
  night_pay: number;
  shift_pay_1: number;
  shift_pay_2: number;
  shift_pay_3: number;
  shift_pay_4: number;
  holiday_work_pay: number;
  holiday_work_overtime_pay: number;
  public_holiday_pay: number;
  public_holiday_work_pay: number;
  weekly_holiday_pay: number;
  // 휴일 야간교대 가산 (4단계)
  hol_shift_t1_pay: number;
  hol_shift_t2_pay: number;
  hol_shift_t3_pay: number;
  hol_shift_t4_pay: number;
  is_tax_exempt: boolean;
  tax_exempt_amount: number;
  // 주휴수당 이월 데이터
  carryDays: number; // 미완성 주의 출근일수 (다음 달 이월)
  weeklyHolidayWeeks: number; // 이번 달 주휴수당 지급 주수
  // 계산 메타데이터 (UI 표시용)
  meta: SalaryDetailMeta;
}

export interface SalaryDetailMeta {
  totalWorkMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number; // 주간조 야간가산
  shiftTier1Minutes: number;
  shiftTier2Minutes: number;
  shiftTier3Minutes: number;
  shiftTier4Minutes: number;
  // 휴일 야간교대 시간 (4단계)
  holShiftTier1Minutes: number;
  holShiftTier2Minutes: number;
  holShiftTier3Minutes: number;
  holShiftTier4Minutes: number;
  holidayWorkMinutes: number; // 주휴일 근로 총시간 (주간조만)
  holidayWorkOvertimeMinutes: number; // 호환
  holidayWork8hMinutes: number; // 주휴일 근로 8h 이내 (주간조, 일별 합산)
  holidayWorkOver8hMinutes: number; // 주휴일 근로 8h 초과 (주간조, 일별 합산)
  holidayNightMinutes: number; // 주휴일 야간 시간 (주간조)
  publicHolidayWorkMinutes: number; // 공휴일 근로 분
  weeklyHolidayMinutes: number; // 주휴수당 분
  hourlyRate: number;
  workedDays: number;
  weeklyHolidayQualified: boolean;
}

/** 원단위 절사 */
function floor1(n: number): number {
  return Math.floor(n);
}

/** 해당 날짜가 법정 공휴일인지 판별 */
export function isPublicHoliday(dateStr: string, publicHolidayDates?: Set<string>): boolean {
  const normalizedDate = normalizeDateStr(dateStr);

  if (publicHolidayDates?.has(normalizedDate)) {
    return true;
  }

  const [y, m, d] = normalizedDate.split("-").map(Number);

  // 고정 공휴일
  for (const [hm, hd] of FIXED_PUBLIC_HOLIDAYS) {
    if (m === hm && d === hd) return true;
  }

  // 음력 기반 공휴일
  const lunarDates = LUNAR_HOLIDAYS[y] || [];
  return lunarDates.includes(normalizedDate);
}

/** 근로자의 날인지 판별 */
export function isLaborDay(dateStr: string): boolean {
  const [, m, d] = dateStr.split("-").map(Number);
  return m === 5 && d === 1;
}

/** 요일 인덱스 (0=일, 1=월, ..., 6=토) */
function getDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** 요일 인덱스 → work_day_list 값 매핑 */
const DOW_TO_DAY_VALUE: Record<number, string> = {
  0: "SUN",
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
};

/** 주휴일 요일 인덱스 */
function getWeeklyHolidayIndex(weeklyHoliday: string): number {
  const map: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return map[weeklyHoliday] ?? 0;
}

/** 해당 날짜가 소정근로일인지 (work_day_list 기반) */
export function isScheduledWorkday(dateStr: string, settings: OrganizationSettings): boolean {
  const dow = getDayOfWeek(dateStr);
  const dayValue = DOW_TO_DAY_VALUE[dow];
  const workDayList = settings.work_day_list || ["MON", "TUE", "WED", "THU", "FRI"];
  return workDayList.includes(dayValue);
}

/** 해당 날짜가 주휴일인지 */
export function isWeeklyHoliday(dateStr: string, settings: OrganizationSettings): boolean {
  const dow = getDayOfWeek(dateStr);
  return dow === getWeeklyHolidayIndex(settings.weekly_holiday);
}

/** 시급 산출 */
function getHourlyRate(
  employee: { pay_type: string; hourly_rate?: number | null; daily_rate?: number | null; base_salary: number },
  standardWorkHours: number,
): number {
  if (employee.pay_type === "hourly") return employee.hourly_rate || 0;
  if (employee.pay_type === "daily") return (employee.daily_rate || 0) / (standardWorkHours || 8);
  return 0; // 월급제는 이 로직 미사용
}

/**
 * 주별 근무시간 계산 (주휴수당 판별용)
 * 해당 주에 15시간 이상 & 소정근로일 개근 → 주휴수당 지급
 */
function calculateWeeklyStats(
  weekAttendance: AttendanceRawRecord[],
  settings: OrganizationSettings,
  weekDates: string[],
  publicHolidayDates?: Set<string>,
): { totalMinutes: number; scheduledDaysWorked: number; scheduledDaysTotal: number } {
  let totalMinutes = 0;
  let scheduledDaysWorked = 0;
  let scheduledDaysTotal = 0;

  const dailyPaidHolidayMinutes = (settings.standard_work_hours || 8) * 60;

  for (const dateStr of weekDates) {
    const isScheduled = isScheduledWorkday(dateStr, settings);
    const isPubHoliday = isPublicHoliday(dateStr, publicHolidayDates);
    const isLabor = isLaborDay(dateStr);

    if (isScheduled) scheduledDaysTotal++;

    const att = weekAttendance.find((a) => a.date === dateStr);
    const hasActualWork = !!(att && att.check_in && att.check_out);

    if (hasActualWork) {
      const isNight = att.work_type === "night";
      const breakdown = calculateSingleAttendance(
        att.check_in!,
        att.check_out!,
        att.date,
        att.break_minutes ?? 0,
        isNight,
        settings,
      );

      totalMinutes += breakdown.recognizedMinutes;

      if (isScheduled && (att.status === "present" || att.status === "late")) {
        scheduledDaysWorked++;
      }

      continue;
    }

    const isPaidPublicHoliday =
      settings.apply_public_holiday &&
      isScheduled &&
      isPubHoliday &&
      (settings.company_size === "over5" || isLabor);

    if (isPaidPublicHoliday) {
      totalMinutes += dailyPaidHolidayMinutes;
      scheduledDaysWorked++;
    }
  }

  return { totalMinutes, scheduledDaysWorked, scheduledDaysTotal };
}

/** ISO 주차 시작(월)~종료(일) 날짜 배열 생성 */
function getWeekDates(dateStr: string): string[] {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay(); // 0=일
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((dow + 6) % 7)); // 해당 주 월요일

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    dates.push(
      `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`,
    );
  }
  return dates;
}

/** 주 단위 근무유형별 1일 기준시간 산정 (주휴수당용) */
function calcDailyBaseHours(weekAtt: AttendanceRawRecord[], settings: OrganizationSettings): number {
  const standardDailyHours = Math.min(settings.standard_work_hours || 8, 8);

  const weekAttWithCheckIn = weekAtt.filter((a) => a.check_in && a.check_out);

  const hasNightWork = weekAttWithCheckIn.some((wa) => {
    if (wa.work_type === "night") return true;
    if (!wa.check_in) return false;

    const ciDate = new Date(wa.check_in);
    return ciDate.getHours() + ciDate.getMinutes() / 60 >= 14;
  });

  // 주간 고정근무자는 실제 출근일 평균이 아니라
  // 회사 설정의 1일 정규근무시간을 주휴 기준시간으로 사용한다.
  // 이유:
  // - 유급공휴일에 쉬어도 주휴가 깎이면 안 됨
  // - 토요일/휴무일 짧은 근무시간이 주휴 1일 기준시간을 줄이면 안 됨
  if (!hasNightWork) {
    return standardDailyHours;
  }

  if (weekAttWithCheckIn.length > 0) {
    let totalScheduledMinutes = 0;
    let scheduledNightWorkDays = 0;

    for (const wa of weekAttWithCheckIn) {
      const waIsNight =
        wa.work_type === "night" ||
        (() => {
          if (!wa.check_in) return false;
          const ciDate = new Date(wa.check_in);
          return ciDate.getHours() + ciDate.getMinutes() / 60 >= 14;
        })();

      if (!waIsNight) continue;

      const checkIn = new Date(wa.check_in!);
      const checkOut = new Date(wa.check_out!);
      const t4 = calculate4TierNightShift(checkIn, checkOut, settings);

      const nightRecognized =
        t4.tier1Minutes +
        t4.tier2Minutes +
        t4.tier3Minutes +
        t4.tier4Minutes;

      const nightOvertime = t4.tier3Minutes + t4.tier4Minutes;

      totalScheduledMinutes += nightRecognized - nightOvertime;
      scheduledNightWorkDays++;
    }

    if (scheduledNightWorkDays > 0) {
      return Math.min(totalScheduledMinutes / 60 / scheduledNightWorkDays, 8);
    }
  }

  return standardDailyHours;
}

/**
 * 직원 1명의 월간 salary_details 계산
 *
 * @param employee 직원 정보 (월급제 제외 전제)
 * @param attendance 해당 월 근태 기록
 * @param allAttendance 주휴수당 판별을 위한 전체 기간 근태 (전주 포함)
 * @param settings 조직 설정
 * @param yearMonth "YYYY-MM" 형식
 */
export function calculateSalaryDetail(
  employee: {
    id: string;
    pay_type: string;
    hourly_rate?: number | null;
    daily_rate?: number | null;
    base_salary: number;
  },
  attendance: AttendanceRawRecord[],
  allAttendance: AttendanceRawRecord[],
  settings: OrganizationSettings,
  yearMonth: string,
  prevCarryDays: number = 0,
  publicHolidayDates?: Set<string>,
): SalaryDetailResult {
  const hourlyRate = getHourlyRate(employee, settings.standard_work_hours);
  const standardMinutes = (settings.standard_work_hours || 8) * 60;
  const workDays = settings.work_days; // 5 or 6

  // 야간교대 설정 (4단계)
  const [nsH, nsM] = settings.night_shift_start_time.split(":").map(Number);
  const nightStartMin = nsH * 60 + nsM; // night_start (e.g., 22:00 = 1320)
  const [neH, neM] = settings.night_shift_end_time.split(":").map(Number);
  const nightEndMin = neH * 60 + neM; // night_end (e.g., 06:00 = 360)

  // Legacy tier parsing (for calculateNightTierMinutes backward compat)
  const [t1sH, t1sM] = settings.shift_tier1_start.split(":").map(Number);
  const [t1eH, t1eM] = settings.shift_tier1_end.split(":").map(Number);
  const [t2sH, t2sM] = settings.shift_tier2_start.split(":").map(Number);
  const [t2eH, t2eM] = settings.shift_tier2_end.split(":").map(Number);
  const [t3sH, t3sM] = settings.shift_tier3_start.split(":").map(Number);
  const [t3eH, t3eM] = settings.shift_tier3_end.split(":").map(Number);
  const tier1Start = t1sH * 60 + t1sM;
  const tier1End = t1eH * 60 + t1eM;
  const tier2Start = t2sH * 60 + t2sM;
  const tier2End = t2eH * 60 + t2eM;
  const tier3Start = t3sH * 60 + t3sM;
  const tier3End = t3eH * 60 + t3eM;

  // 누적 결과
  let totalWorkMinutes = 0;
  let regularMinutes = 0;
  let overtimeMinutes = 0;
  let nightMinutes = 0;
  let shiftTier1Min = 0,
    shiftTier2Min = 0,
    shiftTier3Min = 0,
    shiftTier4Min = 0;
  // 휴일 야간교대 시간 (4단계)
  let holShiftT1Min = 0,
    holShiftT2Min = 0,
    holShiftT3Min = 0,
    holShiftT4Min = 0;
  let holidayWorkMin = 0;
  let holidayWork8hMin = 0; // 주간조 일별 8h 이내 합산
  let holidayWorkOver8hMin = 0; // 주간조 일별 8h 초과 합산
  let holidayNightMin = 0; // 주간조 휴일 야간 시간
  let publicHolidayWorkMin = 0;
  let workedDays = 0;
  let nightShiftDays = 0; // 야간교대 근무일수 (혼합 직원 휴게 보정용)
  let dayShiftDays = 0; // 주간 근무일수 (혼합 직원 판별용)

  // 주휴수당 합계
  let qualifiedWeeklyHolidayPay = 0;
  let totalWeeklyHolidayPay = 0;
  let weeklyHolidayQualified = false;

  // 직원 전체 근태: 월말~월초 주차 연결 판단용
const empAllAtt = allAttendance.filter((a) => a.employee_id === employee.id);

// STEP 0: 주휴수당 사전 판정 — 직전 최대 4주 평균 소정근로시간 >= 15h
const empAllAttForAvg = empAllAtt;
  const prior4WeekMinutes = new Map<string, number>();
  for (const att of empAllAttForAvg) {
    if (!att.check_in || !att.check_out) continue;
    // 소정근로일만 집계
    if (!isScheduledWorkday(att.date, settings)) continue;

    const wkDates = getWeekDates(att.date);
    const wk = wkDates[0];
    const isNight = att.work_type === "night";
    const bd = calculateSingleAttendance(
      att.check_in,
      att.check_out,
      att.date,
      att.break_minutes ?? 0,
      isNight,
      settings,
    );
    prior4WeekMinutes.set(wk, (prior4WeekMinutes.get(wk) || 0) + bd.recognizedMinutes);
  }
  const weeksWithWork = prior4WeekMinutes.size;
  const totalScheduledMin = Array.from(prior4WeekMinutes.values()).reduce((s, m) => s + m, 0);
  const avgWeeklyMinutes = weeksWithWork > 0 ? totalScheduledMin / weeksWithWork : 0;
  const weeklyHolidayEligible = avgWeeklyMinutes >= 15 * 60;

  // 공휴일 유급수당 합계
  let totalPublicHolidayPay = 0;

  // 각 출근일별 처리
  for (const att of attendance) {
    if (!att.check_in || !att.check_out) continue;

    const dateStr = att.date;
    const isNight = att.work_type === "night";

    const breakdown = calculateSingleAttendance(
      att.check_in,
      att.check_out,
      dateStr,
      att.break_minutes ?? 0,
      isNight,
      settings,
    );

    if (breakdown.recognizedMinutes <= 0) continue;
    workedDays++;

    const recognized = breakdown.recognizedMinutes;
    totalWorkMinutes += recognized;

    const isWeeklyHol = isWeeklyHoliday(dateStr, settings);
    const isPubHoliday = att.is_holiday === true || isPublicHoliday(dateStr, publicHolidayDates);
    const isLabor = isLaborDay(dateStr);
    const isScheduled = isScheduledWorkday(dateStr, settings);

    // === 요일별 분류 (record 단위 판단) ===
    // 핵심: 야간교대(isNight)인 경우 휴일/비휴일 모두 4단계 로직 적용
    //       주간조(isNight=false)인 경우만 기존 휴일 버킷 사용

    if (isNight) {
      // 야간교대: 항상 4단계 로직 사용 (비휴일/휴일 구분은 가산 항목으로)
      nightShiftDays++;
      const checkIn = new Date(att.check_in);
      const checkOut = new Date(att.check_out);
      const t4 = calculate4TierNightShift(checkIn, checkOut, settings);

      if (isWeeklyHol || (isPubHoliday && settings.apply_public_holiday)) {
        // HOLIDAY_NIGHT_SHIFT: 4단계 시간을 휴일 야간교대 버킷에 적립
        holShiftT1Min += t4.tier1Minutes;
        holShiftT2Min += t4.tier2Minutes;
        holShiftT3Min += t4.tier3Minutes;
        holShiftT4Min += t4.tier4Minutes;
      } else {
        // NIGHT_SHIFT: 비휴일 4단계
        shiftTier1Min += t4.tier1Minutes;
        shiftTier2Min += t4.tier2Minutes;
        shiftTier3Min += t4.tier3Minutes;
        shiftTier4Min += t4.tier4Minutes;
      }
    } else if (isWeeklyHol) {
      dayShiftDays++;
      // 주간조 주휴일 근무: 일별 8h 기준 분리 (근로기준법 제56조 제2항)
      const nonNightMin = recognized - breakdown.nightWorkMinutes;
      holidayWorkMin += recognized;
      const dayHol8h = Math.min(nonNightMin, standardMinutes);
      const dayHolOver8h = Math.max(0, nonNightMin - standardMinutes);
      holidayWork8hMin += dayHol8h;
      holidayWorkOver8hMin += dayHolOver8h;
      nightMinutes += breakdown.nightWorkMinutes;
      holidayNightMin += breakdown.nightWorkMinutes;
    } else if (isPubHoliday && settings.apply_public_holiday) {
      // 주간조 공휴일 근무
      dayShiftDays++;
      publicHolidayWorkMin += recognized;
    } else if (isScheduled) {
      dayShiftDays++;
      // 소정근로일 주간조
      regularMinutes += breakdown.regularMinutes;
      overtimeMinutes += breakdown.overtimeWorkMinutes;
      nightMinutes += breakdown.nightWorkMinutes;
    } else {
      // 비소정일(토요일 등) 주간조 → 설정값 기반 휴무일/휴일 분기
      dayShiftDays++;
      const nonWorkDayType = (settings as any).non_work_day_default_type ?? "REST_DAY";
      if (nonWorkDayType === "HOLIDAY") {
        // 휴일 처리: 주휴일과 동일하게 휴일수당 버킷으로
        const nonNightMin = recognized - breakdown.nightWorkMinutes;
        holidayWorkMin += recognized;
        const dayHol8h = Math.min(nonNightMin, standardMinutes);
        const dayHolOver8h = Math.max(0, nonNightMin - standardMinutes);
        holidayWork8hMin += dayHol8h;
        holidayWorkOver8hMin += dayHolOver8h;
        nightMinutes += breakdown.nightWorkMinutes;
        holidayNightMin += breakdown.nightWorkMinutes;
      } else {
                // 휴무일 처리 (REST_DAY): 주 40h 초과분만 연장
        const weeklyLimitMinutes = (settings.weekly_work_hours || 40) * 60;
        const weekDates = getWeekDates(dateStr);

        // 해당 주 소정근로일의 "정규 인정시간"만 합산한다.
        // 중요:
        // 평일 일별 연장시간은 이미 breakdown.overtimeWorkMinutes로 overtimeMinutes에 반영된다.
        // 따라서 주40시간 초과 판정용 누적시간에 recognizedMinutes를 넣으면
        // 평일 연장시간이 다시 한 번 포함되어 연장근무가 중복 계산된다.
        //
        // 예: 3/12 평일 1시간 8분 연장
        // 기존: 평일 8시간 8분 전체를 주 누적에 포함 → 토요일 연장도 1시간 8분 더 증가
        // 수정: 평일 정규 7시간만 주 누적에 포함 → 중복 제거
        const correctionMonth = (settings as any).payroll_start_month || null;

const weekScheduledMinutes = weekDates
  .filter((d) => d !== dateStr && isScheduledWorkday(d, settings))
  .reduce((sum, d) => {
    const actualRecord = empAllAtt.find((a) => a.date === d);

    // 1순위: 실제 근태기록이 있으면 실제 근태를 우선 적용
    if (actualRecord) {
      if (!actualRecord.check_in || !actualRecord.check_out) {
        return sum;
      }

      const bd = calculateSingleAttendance(
        actualRecord.check_in,
        actualRecord.check_out,
        actualRecord.date,
        actualRecord.break_minutes ?? 0,
        actualRecord.work_type === "night",
        settings,
      );

      return sum + bd.regularMinutes;
    }

    // 2순위: 실제 근태기록이 없고,
    // 첫 달 전월 마지막주차 연결 보정월에 해당하면 정상근무로 보정
    if (correctionMonth && d.startsWith(correctionMonth)) {
      return sum + standardMinutes;
    }

    // 3순위: 실제 근태도 없고 보정도 없으면 미반영
    return sum;
  }, 0);

        const nonNightMin = recognized - breakdown.nightWorkMinutes;
        const remainingCapacity = Math.max(0, weeklyLimitMinutes - weekScheduledMinutes);
        const regularPart = Math.min(nonNightMin, remainingCapacity);
        const overtimePart = Math.max(0, nonNightMin - remainingCapacity);

        regularMinutes += regularPart;
        overtimeMinutes += overtimePart;
        nightMinutes += breakdown.nightWorkMinutes;
      }
    }

    // === 주휴수당 판별 — 이월 로직 포함 ===
    // (주 단위 판별은 아래 별도 블록에서 처리)
  }

  // ── 주휴수당 주 단위 판별 (이월 carry-forward 로직) ──
  let eligibleWeeks = 0;
  let carryDays = 0;

  if (weeklyHolidayEligible) {
    const [yearStr, monthStr] = yearMonth.split("-");
    const calcYear = parseInt(yearStr);
    const calcMonth = parseInt(monthStr);
    const lastDay = new Date(calcYear, calcMonth, 0).getDate();

    // 해당 월의 모든 날짜를 월요일 기준 주 단위로 그룹화
    interface WeekGroup {
      weekKey: string;
      dates: string[];
    }
    const weekMap = new Map<string, string[]>();
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`;
      const wkDates = getWeekDates(dateStr);
      const wk = wkDates[0]; // 월요일
      if (!weekMap.has(wk)) weekMap.set(wk, []);
      // 이 달에 속하는 날짜만 추가
      if (!weekMap.get(wk)!.includes(dateStr)) weekMap.get(wk)!.push(dateStr);
    }

    // 주 정렬 (시간순)
    const weeks = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekKey, dates]) => ({ weekKey, dates }));

  

        // ① + ② 월말~월초 연결 주휴수당 판정
    // 핵심:
    // - 소정근로일이 전월+당월에 걸친 월초 주차는 이번 달에서 전체 주차로 판정한다.
    // - 소정근로일이 당월+다음 달에 걸친 월말 주차는 이번 달에서 지급하지 않고 다음 달로 이월한다.
    // - 소정근로일이 모두 이번 달 안에서 끝나는 주차는 이번 달에서 지급한다.
    const monthStart = `${yearStr}-${monthStr}-01`;
    const monthEnd = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;

    const isWorkedOrPaidScheduledDay = (dateStr: string): boolean => {
      const att = empAllAtt.find((a) => a.date === dateStr);
      const isPubHoliday = isPublicHoliday(dateStr, publicHolidayDates);
      const isLabor = isLaborDay(dateStr);

      const isPaidPublicHoliday =
        settings.apply_public_holiday &&
        isScheduledWorkday(dateStr, settings) &&
        isPubHoliday &&
        (settings.company_size === "over5" || isLabor);

      return (
        (att && (att.status === "present" || att.status === "late")) ||
        isPaidPublicHoliday
      );
    };

    for (const week of weeks) {
      const fullWeekDates = getWeekDates(week.dates[0]);

      // 전체 주차 중 회사 설정상 소정근로일만 추출
      // work_day_list가 월~금, 월~토, 월/수/금 등으로 바뀌어도 여기서 그대로 반영된다.
      const scheduledFullWeek = fullWeekDates.filter((d) =>
        isScheduledWorkday(d, settings)
      );

      const scheduledInCurrentMonth = scheduledFullWeek.filter(
        (d) => d >= monthStart && d <= monthEnd
      );

      // 이번 달에 해당하는 소정근로일이 하나도 없으면 계산 대상 아님
      if (scheduledInCurrentMonth.length === 0) {
        continue;
      }

      const hasPrevMonthScheduledDay = scheduledFullWeek.some(
        (d) => d < monthStart
      );

      const hasNextMonthScheduledDay = scheduledFullWeek.some(
        (d) => d > monthEnd
      );

      // 월말 주차: 소정근로일이 다음 달까지 이어지면 이번 달에서 지급하지 않는다.
      // 예: 월~토 소정근로인데 토요일이 다음 달 1일이면, 이번 달 지급 금지 후 다음 달에서 최종 판정.
      if (hasNextMonthScheduledDay) {
        const workedInCurrentMonth = scheduledInCurrentMonth.filter((d) =>
          isWorkedOrPaidScheduledDay(d)
        );

        carryDays = workedInCurrentMonth.length;
        continue;
      }

      // 월초 주차 또는 이번 달 안에서 소정근로일이 끝나는 주차는 전체 주차 기준으로 판정한다.
      const weekAtt = empAllAtt.filter((a) =>
        fullWeekDates.includes(a.date)
      );

      const stats = calculateWeeklyStats(
        weekAtt,
        settings,
        fullWeekDates,
        publicHolidayDates
      );

      // 전월 근태가 allAttendance에 없고 prevCarryDays만 넘어온 경우를 위한 보정.
      // 기본은 실제 전월 근태기록 우선, 없을 때만 prevCarryDays를 보조로 사용한다.
      const prevScheduledDates = scheduledFullWeek.filter(
        (d) => d < monthStart
      );

      const prevAttendanceDates = new Set(
        empAllAtt
          .filter((a) => prevScheduledDates.includes(a.date))
          .map((a) => a.date)
      );

      const missingPrevScheduledDays = Math.max(
        0,
        prevScheduledDates.length - prevAttendanceDates.size
      );

      const carryDaysToApply =
        hasPrevMonthScheduledDay && missingPrevScheduledDays > 0
          ? Math.min(prevCarryDays, missingPrevScheduledDays)
          : 0;

      const adjustedScheduledDaysWorked =
        stats.scheduledDaysWorked + carryDaysToApply;

      const adjustedTotalMinutes =
        stats.totalMinutes + carryDaysToApply * standardMinutes;

      if (
        adjustedTotalMinutes >= 15 * 60 &&
        stats.scheduledDaysTotal > 0 &&
        adjustedScheduledDaysWorked >= stats.scheduledDaysTotal
      ) {
        weeklyHolidayQualified = true;

        const dailyBaseHours = calcDailyBaseHours(
          weekAtt,
          settings
        );

        qualifiedWeeklyHolidayPay += floor1(
          dailyBaseHours * hourlyRate
        );

        eligibleWeeks++;
      }
    }
  }

  // 주휴수당: 사전 판정(4주 평균 >= 15h) 통과 시에만 반영
  totalWeeklyHolidayPay = weeklyHolidayEligible ? qualifiedWeeklyHolidayPay : 0;

  // === 공휴일 유급수당 (쉰 날) ===
  if (settings.apply_public_holiday) {
    const [yearStr, monthStr] = yearMonth.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);
    const lastDay = new Date(year, month, 0).getDate();

    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, "0")}`;
      const isPubHol = isPublicHoliday(dateStr, publicHolidayDates);
      const isLabor = isLaborDay(dateStr);
      if (!isPubHol) continue;

      // 비소정근로일(주휴일, 5일제 토요일)에 해당하는 공휴일은 유급수당 미지급
      // (이미 쉬는 날이므로 추가 유급 불필요)
      if (!isScheduledWorkday(dateStr, settings)) continue;

      // 5인 미만: 근로자의 날만 유급
if (settings.company_size === "under5" && !isLabor) continue;

// 유급휴일수당: 회사 설정 1일 정규근무시간 × 시급
// 실제 근무 여부와 관계없이 지급
totalPublicHolidayPay += floor1((standardMinutes / 60) * hourlyRate);
    }
  }

  // === 혼합 직원 야간교대 휴게 보정 ===
  // 야간교대 1단계에서 60분 휴게가 차감되지만, 주간+야교 혼합 직원의 경우
  // calculateSingleAttendance가 야간교대 record에도 주간 휴게를 적용하여 이중 차감 발생
  // 보정: 주간 근무도 있는 혼합 직원에 한해 nightShiftDays × 60분을 복원
  if (nightShiftDays > 0 && dayShiftDays > 0) {
    totalWorkMinutes += nightShiftDays * 60;
  }

    // === 5단계: 정식 하이브리드 계산 ===
  // 기본급 = 정규근로시간만 × 시급
  // 연장근로수당 = 연장시간 × 시급 × 1.5
  // 야간근로수당 = 야간시간 × 시급 × 0.5
  // 휴일근로수당 = 휴일 8h 이내 × 1.5 / 8h 초과 × 2.0

  const overtimeMultiplier =
    settings.overtime_rate || settings.overtime_multiplier || 1.5;

  const nightAlphaRate =
    (settings.night_shift_multiplier || 1.5) - 1.0;

  const holidayAlpha8h = settings.holiday_alpha_8h ?? 0.5;
  const holidayAlphaOt = settings.holiday_alpha_ot ?? 1.0;

  const holidayWithin8hMultiplier = 1.0 + holidayAlpha8h; // 보통 1.5
  const holidayOver8hMultiplier = 1.0 + holidayAlphaOt; // 보통 2.0

  const t1Multiplier = settings.shift_tier1_multiplier || 1.0;
  const t2Multiplier = settings.shift_tier2_multiplier || 1.5;
  const t3Multiplier = settings.shift_tier3_multiplier || 2.0;
  const t4Multiplier = settings.shift_tier4_multiplier || 1.5;

  const t1Alpha = t1Multiplier - 1.0;
  const t2Alpha = t2Multiplier - 1.0;

  // 혼합 근무자 야간교대 휴게 보정분은 기존 totalWorkMinutes 보정과 동일하게
  // 기본급 정규시간에 포함한다.
  const mixedNightShiftBreakRestoreMinutes =
    nightShiftDays > 0 && dayShiftDays > 0 ? nightShiftDays * 60 : 0;

  // 기본급 대상 시간:
  // 주간 정규 + 야간교대 1단계(정규+비야간) + 야간교대 2단계(정규+야간)
  // 단, 연장 구간과 휴일 근로 구간은 기본급에서 제외한다.
  const regularBaseMinutes =
    regularMinutes +
    shiftTier1Min +
    shiftTier2Min +
    mixedNightShiftBreakRestoreMinutes;

  const basePay = floor1((regularBaseMinutes / 60) * hourlyRate);

    // 주간조 일반 연장근로수당: 연장시간 × 시급 × 1.5
  // 예: 09:00~24:00 근무 시, 정규시간 초과분은 여기로 들어간다.
  let overtimePay = floor1(
    (overtimeMinutes / 60) * hourlyRate * overtimeMultiplier,
  );

  // 주간조 야간근로수당: 야간시간 × 시급 × 0.5
  // 예: 09:00~24:00 근무 시, 22:00~24:00은 여기로 들어간다.
  let nightPay = floor1(
    (nightMinutes / 60) * hourlyRate * nightAlphaRate,
  );

  // 비휴일 야간교대 분리형 처리
  // 1단계 정규+비야간: 기본급 포함
  // 2단계 정규+야간: 기본급 + 야간 0.5
  // 3단계 연장+야간: 연장 1.5 + 야간 0.5
  // 4단계 연장+비야간: 연장 1.5
  const nightAlpha = t2Alpha; // 보통 0.5

  const shiftNightMinutes = shiftTier2Min + shiftTier3Min;
  const shiftOvertimeMinutes = shiftTier3Min + shiftTier4Min;

  nightPay += floor1(
    (shiftNightMinutes / 60) * hourlyRate * nightAlpha,
  );

  overtimePay += floor1(
    (shiftOvertimeMinutes / 60) * hourlyRate * overtimeMultiplier,
  );

  // 야간교대 전용 수당 필드는 분리형 전환 후 중복 방지를 위해 0 처리한다.
  // 시간 정보는 meta.shiftTier*Minutes에 그대로 남긴다.
  const shiftPay1 = 0;
  const shiftPay2 = 0;
  const shiftPay3 = 0;
  const shiftPay4 = 0;

  // 휴일 야간교대 분리형 처리
  // 휴일 8h 이내 = 휴일근로수당 1.5
  // 휴일 8h 초과 = 휴일근로수당 2.0
  // 휴일 + 야간 = 야간근로수당 0.5 추가
  // 휴일 + 연장은 별도 연장 1.5로 계산하지 않고 휴일초과 2.0으로 처리한다.
  const holidayShiftWithin8hMinutes = holShiftT1Min + holShiftT2Min;
  const holidayShiftOver8hMinutes = holShiftT3Min + holShiftT4Min;
  const holidayShiftNightMinutes = holShiftT2Min + holShiftT3Min;

  // 주간조 주휴일 근로
  const holidayWork8hPay = floor1(
    (holidayWork8hMin / 60) * hourlyRate * holidayWithin8hMultiplier,
  );

  const holidayWorkOver8hPay = floor1(
    (holidayWorkOver8hMin / 60) * hourlyRate * holidayOver8hMultiplier,
  );

  // 주간조 휴일 야간은 휴일초과 2.0 부분과 야간 0.5 부분을 분리한다.
  // holidayNightMin은 holidayWork8hMin/holidayWorkOver8hMin에서 제외되어 있으므로
  // 휴일근로수당에는 2.0을, 야간근로수당에는 0.5를 각각 더한다.
  const holidayNightBasePay = floor1(
    (holidayNightMin / 60) * hourlyRate * holidayOver8hMultiplier,
  );

  nightPay += floor1(
    (holidayNightMin / 60) * hourlyRate * nightAlphaRate,
  );

  // 휴일 야간교대의 야간 0.5 추가분
  nightPay += floor1(
    (holidayShiftNightMinutes / 60) * hourlyRate * nightAlpha,
  );

  const holidayShiftWithin8hPay = floor1(
    (holidayShiftWithin8hMinutes / 60) * hourlyRate * holidayWithin8hMultiplier,
  );

  const holidayShiftOver8hPay = floor1(
    (holidayShiftOver8hMinutes / 60) * hourlyRate * holidayOver8hMultiplier,
  );

  const holidayWorkPay =
    holidayWork8hPay +
    holidayWorkOver8hPay +
    holidayNightBasePay +
    holidayShiftWithin8hPay +
    holidayShiftOver8hPay;

  // 휴일 야간교대 전용 수당 필드는 분리형 전환 후 중복 방지를 위해 0 처리한다.
  // 시간 정보는 meta.holShiftTier*Minutes에 그대로 남긴다.
  const holShiftT1Pay = 0;
  const holShiftT2Pay = 0;
  const holShiftT3Pay = 0;
  const holShiftT4Pay = 0;

  const holidayWorkOvertimePay = 0; // 호환 유지

  // 공휴일 실제 근로
  // 공휴일 유급수당(public_holiday_pay)은 별도 지급되고,
  // 실제 근로분은 휴일근로수당 1.5 / 2.0으로 지급한다.
  let publicHolidayWorkPay = 0;

  if (settings.company_size === "over5") {
    const pubWithin8h = Math.min(publicHolidayWorkMin, standardMinutes);
    const pubOver8h = Math.max(0, publicHolidayWorkMin - standardMinutes);

    publicHolidayWorkPay =
      floor1((pubWithin8h / 60) * hourlyRate * holidayWithin8hMultiplier) +
      floor1((pubOver8h / 60) * hourlyRate * holidayOver8hMultiplier);
  } else {
    publicHolidayWorkPay = 0;
  }

  return {
    employee_id: employee.id,
    pay_year_month: yearMonth,
    regular_pay: basePay,
    overtime_pay: overtimePay,
    night_pay: nightPay,
    shift_pay_1: shiftPay1,
    shift_pay_2: shiftPay2,
    shift_pay_3: shiftPay3,
    shift_pay_4: shiftPay4,
    holiday_work_pay: holidayWorkPay,
    holiday_work_overtime_pay: holidayWorkOvertimePay,
    public_holiday_pay: totalPublicHolidayPay,
    public_holiday_work_pay: publicHolidayWorkPay,
    weekly_holiday_pay: totalWeeklyHolidayPay,
    hol_shift_t1_pay: holShiftT1Pay,
    hol_shift_t2_pay: holShiftT2Pay,
    hol_shift_t3_pay: holShiftT3Pay,
    hol_shift_t4_pay: holShiftT4Pay,
    is_tax_exempt: false,
    tax_exempt_amount: 0,
    carryDays,
    weeklyHolidayWeeks: eligibleWeeks,
    meta: {
      totalWorkMinutes,
      regularMinutes,
            overtimeMinutes: overtimeMinutes + shiftTier3Min + shiftTier4Min,
      nightMinutes:
        nightMinutes +
        shiftTier2Min +
        shiftTier3Min +
        holShiftT2Min +
        holShiftT3Min,
      shiftTier1Minutes: shiftTier1Min,
      shiftTier2Minutes: shiftTier2Min,
      shiftTier3Minutes: shiftTier3Min,
      shiftTier4Minutes: shiftTier4Min,
      holShiftTier1Minutes: holShiftT1Min,
      holShiftTier2Minutes: holShiftT2Min,
      holShiftTier3Minutes: holShiftT3Min,
      holShiftTier4Minutes: holShiftT4Min,
            holidayWorkMinutes:
        holidayWorkMin +
        holShiftT1Min +
        holShiftT2Min +
        holShiftT3Min +
        holShiftT4Min,
      holidayWorkOvertimeMinutes: 0,
      holidayWork8hMinutes:
        holidayWork8hMin +
        holShiftT1Min +
        holShiftT2Min,
      holidayWorkOver8hMinutes:
        holidayWorkOver8hMin +
        holidayNightMin +
        holShiftT3Min +
        holShiftT4Min,
      holidayNightMinutes: holidayNightMin,
      publicHolidayWorkMinutes: publicHolidayWorkMin,
      weeklyHolidayMinutes: totalWeeklyHolidayPay > 0 ? Math.round((totalWeeklyHolidayPay / hourlyRate) * 60) : 0,
      hourlyRate,
      workedDays,
      weeklyHolidayQualified,
    },
  };
}

/** salary_detail의 총 지급액 (기본급 + 모든 Alpha + 주휴 + 유급) */
export function getSalaryDetailTotal(detail: SalaryDetailResult): number {
  return (
    detail.regular_pay +
    detail.overtime_pay +
    detail.night_pay +
    detail.shift_pay_1 +
    detail.shift_pay_2 +
    detail.shift_pay_3 +
    detail.shift_pay_4 +
    detail.holiday_work_pay +
    detail.holiday_work_overtime_pay +
    detail.public_holiday_pay +
    detail.public_holiday_work_pay +
    detail.weekly_holiday_pay +
    detail.hol_shift_t1_pay +
    detail.hol_shift_t2_pay +
    detail.hol_shift_t3_pay +
    detail.hol_shift_t4_pay
  );
}

/**
 * 야간교대 4단계 자동 계산
 *
 * 1단계: 출근시간 ~ night_start (정규+비야간, 기본배율 1.0)
 * 2단계: night_start ~ 8h초과시점 (정규+야간, 기본배율 1.5)
 * 3단계: 8h초과시점 ~ night_end (연장+야간, 기본배율 2.0)
 * 4단계: MAX(night_end, 8h초과시점) ~ 퇴근 (연장+비야간, 기본배율 1.5)
 *        23:00+ 출근 시 4단계 내 정규/연장 자동 분리
 */
export function calculate4TierNightShift(
  checkIn: Date,
  checkOut: Date,
  settings: OrganizationSettings,
): { tier1Minutes: number; tier2Minutes: number; tier3Minutes: number; tier4Minutes: number } {
  const ciKST = getKSTMinutes(checkIn);
  let coKST = getKSTMinutes(checkOut);

  // 자정 넘김 처리: 퇴근이 출근보다 이전이면 +1440
  if (coKST <= ciKST) coKST += 1440;

  // 4단계 시스템에서 1단계→2단계 경계는 shift_tier1_end (22:00)
  const [nsH, nsM_] = (settings.shift_tier1_end || settings.night_shift_start_time).split(":").map(Number);
  const nightStart = nsH * 60 + nsM_; // e.g., 22:00 = 1320
  const [neH, neM_] = settings.night_shift_end_time.split(":").map(Number);
  const nightEnd = neH * 60 + neM_; // e.g., 06:00 = 360
  const nightEnd24 = nightEnd < nightStart ? nightEnd + 1440 : nightEnd; // 06:00 → 1800

  const stdMinutes = (settings.standard_work_hours || 8) * 60;

  const t1Break = settings.shift_tier1_break_minutes || 0;
  const t2Break = settings.shift_tier2_break_minutes || 0;
  const t3Break = settings.shift_tier3_break_minutes || 0;
  const t4Break = settings.shift_tier4_break_minutes || 0;

  // 출근 보정: 지각 기준 이내 → tier1 시작(고정출근시간)으로 소급
  const lateThreshold = settings.shift_late_threshold || 0;
  const fixedCheckIn = nightStart; // 1단계 고정출근시간 = night_start (legacy)
  // 실제로 1단계 고정출근시간은 shift_tier1_start
  const [t1sH_, t1sM_] = settings.shift_tier1_start.split(":").map(Number);
  const tier1FixedStart = t1sH_ * 60 + t1sM_;

  let effectiveCiMin = ciKST;
  if (ciKST >= tier1FixedStart && ciKST <= tier1FixedStart + lateThreshold) {
    effectiveCiMin = tier1FixedStart;
  } else if (ciKST < tier1FixedStart) {
    effectiveCiMin = tier1FixedStart;
  }

  // 퇴근 보정: 매시 정각 이후 N분 이내 → 해당 정각으로 절사
  const coThreshold = settings.shift_checkout_threshold || 0;
  let effectiveCoMin = coKST;
  if (coThreshold > 0) {
    const minutesPastHour = effectiveCoMin % 60;
    if (minutesPastHour > 0 && minutesPastHour <= coThreshold) {
      effectiveCoMin = effectiveCoMin - minutesPastHour;
    }
  }

  // 1단계: effectiveCiMin ~ nightStart (또는 nightStart+1440 if ci > nightStart)
  let nightStartNorm = nightStart;
  if (effectiveCiMin > nightStart) {
    // 출근이 야간시작 이후 (예: 23:00 출근, nightStart=22:00)
    nightStartNorm = nightStart; // 1단계는 OFF
  }

  const tier1RawMin = Math.max(0, nightStartNorm - effectiveCiMin);
  // 1단계 구간이 휴게보다 작을 경우 초과분을 다음 단계로 자동 이월
  const t1BreakApplied = Math.min(t1Break, tier1RawMin);
  const t1BreakOverflow = t1Break - t1BreakApplied;
  const tier1ActualMin = Math.max(0, tier1RawMin - t1BreakApplied);
  const effectiveT2Break = t2Break + t1BreakOverflow;

  // 8h 초과 시점 자동 계산
  const regularNeededInNight = Math.max(0, stdMinutes - tier1ActualMin);
  const tier2EndPoint = nightStartNorm + regularNeededInNight + t2Break;
  // If checkIn >= nightStart, nightStartNorm is same as nightStart
  // Recalculate for ci >= nightStart case
  let actualTier2Start = nightStartNorm;
  if (effectiveCiMin >= nightStart) {
    actualTier2Start = effectiveCiMin;
    // All regular time is in night
    const fullRegularNeeded = stdMinutes;
    const adjustedTier2End = actualTier2Start + fullRegularNeeded + t2Break;
    // Override
    const t2End = adjustedTier2End;
    const t2Capped = Math.min(effectiveCoMin, t2End);
    const tier2RawMin = Math.max(0, t2Capped - actualTier2Start);
    const tier2ActMin = Math.max(0, tier2RawMin - t2Break);

    // 3단계: t2End ~ nightEnd24
    let tier3ActMin = 0;
    if (t2End < nightEnd24 && effectiveCoMin > t2End) {
      const t3RawMin = Math.max(0, Math.min(effectiveCoMin, nightEnd24) - t2End);
      tier3ActMin = Math.max(0, t3RawMin - t3Break);
    }

    // 4단계 시작: MAX(nightEnd24, t2End)
    const tier4Start = Math.max(nightEnd24, t2End);
    let tier4ActMin = 0;
    let tier4RegMin = 0;
    if (effectiveCoMin > tier4Start) {
      const t4RawMin = effectiveCoMin - tier4Start;
      tier4ActMin = Math.max(0, t4RawMin - t4Break);
    }

    // 23:00+ 출근 특수: 야간 종료 후에도 정규시간이 남는 경우
    // 4단계 내 정규/연장 자동 분리
    const totalRegularSoFar = tier2ActMin; // tier1 is 0
    const remainingRegular = Math.max(0, stdMinutes - totalRegularSoFar);
    if (remainingRegular > 0 && tier4ActMin > 0) {
      // 4단계 중 정규 부분은 1.0배 (alpha = 0), 연장 부분은 설정 배율
      tier4RegMin = Math.min(remainingRegular, tier4ActMin);
      // tier4 overtime = tier4ActMin - tier4RegMin
      // For alpha calculation: tier4 regular has alpha 0 (1.0배), overtime has tier4 alpha
      // We report tier4Minutes as only the overtime portion (alpha-bearing)
      // and add regular portion to the base pay (already in totalWorkMinutes via recognizedMinutes)
      // But the alpha model: basePay covers ALL minutes at 1.0, so alpha only adds the +0.5
      // tier4 regular → alpha = 0 (1.0배 base already counted)
      // tier4 overtime → alpha = tier4_multiplier - 1.0
      tier4ActMin = tier4ActMin - tier4RegMin; // only overtime gets tier4 alpha
    }

    return {
      tier1Minutes: 0,
      tier2Minutes: tier2ActMin,
      tier3Minutes: tier3ActMin,
      tier4Minutes: tier4ActMin,
    };
  }

  // Standard case: effectiveCiMin < nightStart
  // 2단계: nightStart ~ min(effectiveCo, tier2EndPoint)
  const tier2Capped = Math.min(effectiveCoMin, tier2EndPoint);
  const tier2RawMin = Math.max(0, tier2Capped - nightStartNorm);
  const tier2ActualMin = Math.max(0, tier2RawMin - effectiveT2Break);

  // 3단계: tier2EndPoint ~ nightEnd24
  let tier3ActualMin = 0;
  if (tier2EndPoint < nightEnd24 && effectiveCoMin > tier2EndPoint) {
    const t3RawMin = Math.max(0, Math.min(effectiveCoMin, nightEnd24) - tier2EndPoint);
    tier3ActualMin = Math.max(0, t3RawMin - t3Break);
  }

  // 4단계 시작: MAX(nightEnd24, tier2EndPoint)
  const tier4Start = Math.max(nightEnd24, tier2EndPoint);
  let tier4ActualMin = 0;
  if (effectiveCoMin > tier4Start) {
    const t4RawMin = effectiveCoMin - tier4Start;
    tier4ActualMin = Math.max(0, t4RawMin - t4Break);
  }

  return {
    tier1Minutes: tier1ActualMin,
    tier2Minutes: tier2ActualMin,
    tier3Minutes: tier3ActualMin,
    tier4Minutes: tier4ActualMin,
  };
}
