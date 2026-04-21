// ============================================================
// 일용직 주휴수당 계산 엔진
// 기준: 2021.8.4 고용노동부 행정해석 (임금근로시간과-1736)
// 근로기준법 제18조 제3항
// ============================================================

const DAY_MAP: Record<string, number> = {
  MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6,
};

const HOLIDAY_WEEKDAY_MAP: Record<string, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
};

export interface DailyHolidayRecord {
  work_date: string;
  work_type: 'fixed' | 'hourly';
  daily_wage: number;
  work_hours: number;
  base_daily_wage?: number;
}

export interface WeeklyHolidayParams {
  records: DailyHolidayRecord[];
  weeklyWorkDays: number;
  weeklyWorkDayList: string[];
  weeklyHoliday: string;
  weeklyWorkHours: number;
  lastWorkDate?: string | null;
}

export interface WeeklyHolidayResult {
  weekStart: string;
  weekEnd: string;
  holidayDate: string;
  records: DailyHolidayRecord[];
  prescribedDays: string[];
  workedDays: string[];
  isEligible: boolean;
  reason: string;
  holidayPay: number;
}

function getWeekStart(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function groupByWeek(
  records: DailyHolidayRecord[]
): Map<string, DailyHolidayRecord[]> {
  const map = new Map<string, DailyHolidayRecord[]>();
  for (const r of records) {
    const monday = toDateStr(getWeekStart(r.work_date));
    if (!map.has(monday)) map.set(monday, []);
    map.get(monday)!.push(r);
  }
  return map;
}

function getPrescribedDaysInWeek(
  weekMonday: Date,
  prescribedDayList: string[]
): string[] {
  const prescribed = prescribedDayList.map(d => DAY_MAP[d]);
  const result: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekMonday);
    day.setDate(weekMonday.getDate() + i);
    const wd = day.getDay() === 0 ? 6 : day.getDay() - 1;
    if (prescribed.includes(wd)) result.push(toDateStr(day));
  }
  return result;
}

function getHolidayDate(
  weekMonday: Date,
  weeklyHoliday: string,
  prescribedDayList: string[]
): Date {
  const holidayWd = HOLIDAY_WEEKDAY_MAP[weeklyHoliday];
  const prescribedWds = prescribedDayList.map(d => DAY_MAP[d]);
  const lastPrescribedWd = Math.max(...prescribedWds);

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekMonday);
    day.setDate(weekMonday.getDate() + i);
    const wd = day.getDay() === 0 ? 6 : day.getDay() - 1;
    if (wd === holidayWd && i > lastPrescribedWd) return day;
  }

  for (let i = 7; i < 14; i++) {
    const day = new Date(weekMonday);
    day.setDate(weekMonday.getDate() + i);
    const wd = day.getDay() === 0 ? 6 : day.getDay() - 1;
    if (wd === holidayWd) return day;
  }

  const fallback = new Date(weekMonday);
  fallback.setDate(weekMonday.getDate() + 6);
  return fallback;
}

function checkAttendance(
  prescribedDays: string[],
  workedDays: string[]
): { ok: boolean; reason: string } {
  if (prescribedDays.length === 0) {
    return { ok: false, reason: '소정근로일 없음' };
  }
  const workedSet = new Set(workedDays);
  const missing = prescribedDays.filter(d => !workedSet.has(d));
  if (missing.length > 0) {
    return { ok: false, reason: `결근: ${missing.join(', ')}` };
  }
  return { ok: true, reason: '개근' };
}

function checkEmploymentContinues(
  weekMonday: Date,
  weeklyHoliday: string,
  prescribedDayList: string[],
  lastWorkDate?: string | null
): { ok: boolean; reason: string } {
  if (!lastWorkDate) return { ok: true, reason: '계속 근무' };

  const holidayDate = getHolidayDate(weekMonday, weeklyHoliday, prescribedDayList);
  const last = new Date(lastWorkDate + 'T00:00:00');

  if (last >= holidayDate) {
    return { ok: true, reason: '주휴일 이후 종료' };
  }

  return {
    ok: false,
    reason: `주휴일(${toDateStr(holidayDate)}) 전 퇴직`,
  };
}

function checkAverageWeeklyHours(
  allRecords: DailyHolidayRecord[],
  currentWeekStart: string
): { ok: boolean; avgHours: number; reason: string } {
  if (!allRecords || allRecords.length === 0) {
    return { ok: false, avgHours: 0, reason: '근무기록 없음' };
  }

  const sorted = [...allRecords].sort((a, b) =>
    a.work_date.localeCompare(b.work_date)
  );

  const weekMap = groupByWeek(sorted);
  const totalWeeksWorked = weekMap.size;

  const currentWeek = new Date(currentWeekStart + 'T00:00:00');
  const fourWeeksAgo = new Date(currentWeek);
  fourWeeksAgo.setDate(currentWeek.getDate() - 21);

  const targetRecords =
    totalWeeksWorked >= 4
      ? sorted.filter(r => {
          const weekStart = toDateStr(getWeekStart(r.work_date));
          return weekStart >= toDateStr(fourWeeksAgo);
        })
      : sorted;

  const targetWeekMap = groupByWeek(targetRecords);
  const weeks = totalWeeksWorked >= 4 ? 4 : targetWeekMap.size;

  const totalHours = targetRecords.reduce(
    (sum, r) => sum + (r.work_hours || 0),
    0
  );

  const avgHours = weeks > 0 ? totalHours / weeks : 0;

  if (avgHours < 15) {
    return {
      ok: false,
      avgHours,
      reason: `${weeks}주 평균 ${avgHours.toFixed(2)}h < 15h`,
    };
  }

  return {
    ok: true,
    avgHours,
    reason: `${weeks}주 평균 ${avgHours.toFixed(2)}h`,
  };
}

function calcHolidayPayAmount(
  weekRecords: DailyHolidayRecord[],
  weeklyWorkDays: number,
  weeklyWorkHours: number,
  weeklyWorkDayList: string[]
): number {
  if (weekRecords.length === 0) return 0;

  const workType = weekRecords[0].work_type;

  if (workType === 'fixed') {
    const workDays = weekRecords.length;
    if (workDays === 0) return 0;
    const total = weekRecords.reduce((sum, r) => sum + r.daily_wage, 0);
    return Math.floor(total / workDays);
  }

  if (workType === 'hourly') {
    // 우선순위 1: base_daily_wage(정상근로 1일 기본급)가 있으면 평균 사용
    const baseDailyWages = weekRecords
      .map(r => Number(r.base_daily_wage ?? 0))
      .filter(v => v > 0);

    if (baseDailyWages.length > 0) {
      const avgBaseDailyWage =
        baseDailyWages.reduce((sum, v) => sum + v, 0) / baseDailyWages.length;
      return Math.floor(avgBaseDailyWage);
    }

    // 우선순위 2: fallback - 기존 hourly 계산식
    const actualDays = Math.max(
      1,
      weeklyWorkDayList?.length || weeklyWorkDays || 1
    );
    if (actualDays === 0) return 0;
    const hourlyRate = weekRecords[0].daily_wage;
    const dailyPrescribedHours = weeklyWorkHours / actualDays;
    return Math.floor(hourlyRate * dailyPrescribedHours);
  }

  return 0;
}

export function calculateWeeklyHolidayPay(
  params: WeeklyHolidayParams
): WeeklyHolidayResult[] {
  const {
    records,
    weeklyWorkDays,
    weeklyWorkDayList,
    weeklyHoliday,
    weeklyWorkHours,
    lastWorkDate,
  } = params;

  const weekMap = groupByWeek(records);
  const results: WeeklyHolidayResult[] = [];

  for (const [mondayStr, weekRecords] of weekMap) {
    const weekMonday = new Date(mondayStr + 'T00:00:00');
    const weekSunday = new Date(weekMonday);
    weekSunday.setDate(weekMonday.getDate() + 6);

    const holidayDate = getHolidayDate(
      weekMonday, weeklyHoliday, weeklyWorkDayList
    );

    const prescribedDays = getPrescribedDaysInWeek(
      weekMonday, weeklyWorkDayList
    );

    const workedDays = weekRecords.map(r => r.work_date);

    // work_type 혼합 방어
    const uniqueTypes = [...new Set(weekRecords.map(r => r.work_type))];
    if (uniqueTypes.length > 1) {
      results.push({
        weekStart: mondayStr,
        weekEnd: toDateStr(weekSunday),
        holidayDate: toDateStr(holidayDate),
        records: weekRecords,
        prescribedDays,
        workedDays,
        isEligible: false,
        reason: '같은 주에 fixed/hourly 혼합 데이터',
        holidayPay: 0,
      });
      continue;
    }

    // ① 평균 근로시간 판정
    const avgCheck = checkAverageWeeklyHours(records, mondayStr);
    if (!avgCheck.ok) {
      results.push({
        weekStart: mondayStr,
        weekEnd: toDateStr(weekSunday),
        holidayDate: toDateStr(holidayDate),
        records: weekRecords,
        prescribedDays,
        workedDays,
        isEligible: false,
        reason: avgCheck.reason,
        holidayPay: 0,
      });
      continue;
    }

    // ② 개근 판정
    const attendance = checkAttendance(prescribedDays, workedDays);
    if (!attendance.ok) {
      results.push({
        weekStart: mondayStr,
        weekEnd: toDateStr(weekSunday),
        holidayDate: toDateStr(holidayDate),
        records: weekRecords,
        prescribedDays,
        workedDays,
        isEligible: false,
        reason: attendance.reason,
        holidayPay: 0,
      });
      continue;
    }

    // ③ 근로관계 존속
    const employment = checkEmploymentContinues(
      weekMonday, weeklyHoliday, weeklyWorkDayList, lastWorkDate
    );
    if (!employment.ok) {
      results.push({
        weekStart: mondayStr,
        weekEnd: toDateStr(weekSunday),
        holidayDate: toDateStr(holidayDate),
        records: weekRecords,
        prescribedDays,
        workedDays,
        isEligible: false,
        reason: employment.reason,
        holidayPay: 0,
      });
      continue;
    }

    // ④ 주휴수당 계산
    const holidayPay = calcHolidayPayAmount(
      weekRecords, weeklyWorkDays, weeklyWorkHours, weeklyWorkDayList
    );

    results.push({
      weekStart: mondayStr,
      weekEnd: toDateStr(weekSunday),
      holidayDate: toDateStr(holidayDate),
      records: weekRecords,
      prescribedDays,
      workedDays,
      isEligible: true,
      reason: '주휴수당 발생',
      holidayPay,
    });
  }

  return results.sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart)
  );
}
