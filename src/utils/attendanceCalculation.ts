/**
 * 공통 근태 계산 로직
 * DailyAttendance, AttendanceSummary, usePayrollCalculation 에서 공통으로 사용
 *
 * 이 파일을 통해 모든 화면에서 동일한 근무시간 계산 결과를 보장합니다.
 */

import { OrganizationSettings } from "@/hooks/useOrganizationSettings";
import { calculateWorkMinutes, calculateOvertimeBreak, calculateNightBreakMinutes } from "./workHoursCalculation";
import {
  calculate4TierNightShift,
  isPublicHoliday,
  isWeeklyHoliday,
  isScheduledWorkday,
} from "./salaryDetailCalculation";

export interface AttendanceRecord {
  date: string;
  rawCheckIn: string | null;
  rawCheckOut: string | null;
  breakMinutes: number;
  workType: string; // 'day' | 'night'
}

export interface WorkHoursBreakdown {
  stayMinutes: number;
  breakMinutes: number;
  lateTruncation: number;
  overtimeTruncation: number;
  earlyLeaveTruncation: number;
  outingTruncation: number;
  recognizedMinutes: number;
  regularMinutes: number;
  overtimeWorkMinutes: number;
  nightWorkMinutes: number;
  nightShiftWorkMinutes: number;
  actualCheckIn: string;
  actualCheckOut: string;
  // 휴일 근무 구간별 분
  isHolidayWork: boolean;
  holidayMinutesWithin8h: number; // 구간 A: 8h 이내
  holidayMinutesOver8h: number; // 구간 B: 8h 초과 (비야간)
  holidayNightMinutes: number; // 구간 C: 8h 초과 + 야간
  // 야간교대 4단계 세분화 (표시 전용)
  nightShiftTier1Minutes: number;
  nightShiftTier2Minutes: number;
  nightShiftTier3Minutes: number;
  nightShiftTier4Minutes: number;
}

/** KST 기준 분 (브라우저 타임존 무관) */
export function getKSTMinutes(d: Date): number {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

/** KST 기준 시/분 설정 */
export function setKSTHours(d: Date, h: number, m: number): Date {
  const kstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const utcTarget =
    Date.UTC(kstDate.getUTCFullYear(), kstDate.getUTCMonth(), kstDate.getUTCDate(), h, m, 0) - 9 * 60 * 60 * 1000;
  return new Date(utcTarget);
}

/** KST 시간 포맷 (HH:mm) */
export function formatKSTTime(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

/** 다음 날짜 문자열 */
function getNextDayStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

/**
 * 퇴근 시각이 어떤 수당 구간에 속하는지 판별
 * - regular: 정규근무 종료 ~ 정규 보정 범위 이내
 * - overtime: 정규 보정 범위 초과 ~ 연장수당 종료 + 보정 범위 이내
 * - night: 연장수당 종료 보정 범위 초과 (야간수당 구간)
 */
function getCheckoutZone(
  coMin: number,
  workEndMin: number,
  overtimeEndMin: number,
  regularThreshold: number,
  overtimeThreshold: number,
): "regular" | "overtime" | "night" | "none" {
  // 자정 이후 퇴근(coMin < workEndMin) → 야간수당 구간
  if (coMin < workEndMin && workEndMin > 720) {
    return "night";
  }

  if (overtimeEndMin <= 1440) {
    // 정규종료 ~ 정규종료+보정 범위 이내 → 정규 구간 (퇴근 절사 대상)
    if (coMin >= workEndMin && coMin <= workEndMin + regularThreshold) return "regular";
    // 정규 보정 범위 초과 ~ 연장종료+보정 범위 이내
    if (coMin > workEndMin && coMin <= overtimeEndMin + overtimeThreshold) return "overtime";
    // 연장 보정 범위 초과 → 야간수당 구간
    if (coMin > overtimeEndMin + overtimeThreshold) return "night";
  }
  return "none";
}

/**
 * 단일 출퇴근 기록에 대한 근무시간 상세 계산
 * DailyAttendance와 AttendanceSummary 모두 이 함수를 사용합니다.
 */
export function calculateSingleAttendance(
  rawCheckIn: string,
  rawCheckOut: string,
  date: string,
  breakMinutesFromRecord: number,
  isNight: boolean,
  settings: OrganizationSettings,
  isHolidayWork: boolean = false,
): WorkHoursBreakdown {
  const ciDate = new Date(rawCheckIn);
  const coDate = new Date(rawCheckOut);
  const originalCheckInDate = new Date(rawCheckIn);
  const originalCheckOutDate = new Date(rawCheckOut);

  // 1. 체류시간 (실제 출퇴근 간 차이)
  let stayDiffMs = originalCheckOutDate.getTime() - originalCheckInDate.getTime();
  if (stayDiffMs < 0) stayDiffMs += 24 * 60 * 60 * 1000;
  const stayMinutes = Math.round(stayDiffMs / 60000);

  // 설정값 추출
  const [dayStartH, dayStartM] = settings.work_start_time.split(":").map(Number);
  const dayWorkStartMin = dayStartH * 60 + dayStartM;
  const [dayEndH, dayEndM] = settings.work_end_time.split(":").map(Number);
  const dayWorkEndMin = dayEndH * 60 + dayEndM;
  const [nightStartH, nightStartM] = settings.shift_tier1_start.split(":").map(Number);
  const nightWorkStartMin = nightStartH * 60 + nightStartM;
  const [nightEndH, nightEndM] = settings.night_shift_end_time.split(":").map(Number);
  const nightWorkEndMin = nightEndH * 60 + nightEndM;

  const workStartMin = isNight ? nightWorkStartMin : dayWorkStartMin;
  const lateThreshold = isNight ? settings.shift_late_threshold : settings.late_threshold;
  const workEndMin = isNight ? nightWorkEndMin : dayWorkEndMin;
  const checkoutThreshold = isNight ? settings.shift_checkout_threshold : settings.checkout_threshold;
  const workStartTime = isNight ? settings.shift_tier1_start : settings.work_start_time;
  const workEndTime = isNight ? settings.shift_tier3_end : settings.work_end_time;

  let lateTruncation = 0;
  let earlyLeaveTruncation = 0;
  let overtimeTruncation = 0;
  const outingTruncation = 0;

  // 2. 출근 보정
  const ciMin = getKSTMinutes(ciDate);
  let effectiveCheckIn = ciDate;
  if (ciMin < workStartMin || (ciMin >= workStartMin && ciMin <= workStartMin + lateThreshold)) {
    const clamped = isNight ? new Date(`${date}T${workStartTime}:00+09:00`) : setKSTHours(ciDate, dayStartH, dayStartM);
    // AttendanceSummary uses ISO string approach; DailyAttendance uses setKSTHours
    // Unify to setKSTHours for consistency
    const clampedDate = setKSTHours(
      ciDate,
      ...((isNight ? [nightStartH, nightStartM] : [dayStartH, dayStartM]) as [number, number]),
    );
    const clampDiff = Math.round((clampedDate.getTime() - ciDate.getTime()) / 60000);
    if (clampDiff > 0) lateTruncation += clampDiff;
    effectiveCheckIn = clampedDate;
  }

  // 3. 퇴근 보정 - 구간별 독립 적용
  const coMin = getKSTMinutes(coDate);
  let effectiveCheckOut = coDate;

  // 구간 종료시간 파싱
  const [workEndH, workEndM_] = workEndTime.split(":").map(Number);
  const workEndMinute = workEndH * 60 + workEndM_;

  const [otEndH, otEndM] = settings.overtime_end_time.split(":").map(Number);
  const overtimeEndMinute = otEndH * 60 + otEndM;

  const [nsEndH, nsEndM] = settings.night_shift_end_time.split(":").map(Number);
  const nightEndMinute = nsEndH * 60 + nsEndM;

  if (isNight) {
    // 야간조: shift_checkout_threshold 기반
    // 1) shift_tier3_end(06:00) 근처 보정
    if (coMin >= workEndMin && coMin <= workEndMin + checkoutThreshold) {
      const nextDayStr = getNextDayStr(date);
      const clamped = new Date(`${nextDayStr}T${workEndTime}:00+09:00`);
      const clampDiff = Math.round((coDate.getTime() - clamped.getTime()) / 60000);
      if (clampDiff > 0) earlyLeaveTruncation += clampDiff;
      effectiveCheckOut = clamped;
    } else if (coMin > workEndMin + checkoutThreshold || coMin < workStartMin) {
      // 2) 4단계 구간 (06:00 이후): 매시 정각 기준 보정
      const minutesPastHour = coMin % 60;
      if (minutesPastHour > 0 && minutesPastHour <= checkoutThreshold) {
        const flooredHour = Math.floor(coMin / 60);
        // 자정 이후(0~12시)에는 다음날 날짜 기준
        if (flooredHour < 12) {
          const nextDayStr = getNextDayStr(date);
          const clampedDate = new Date(`${nextDayStr}T${String(flooredHour).padStart(2, "0")}:00:00+09:00`);
          const clampDiff = Math.round((coDate.getTime() - clampedDate.getTime()) / 60000);
          if (clampDiff > 0) overtimeTruncation += clampDiff;
          effectiveCheckOut = clampedDate;
        } else {
          const clampedDate = setKSTHours(coDate, flooredHour, 0);
          const clampDiff = Math.round((coDate.getTime() - clampedDate.getTime()) / 60000);
          if (clampDiff > 0) overtimeTruncation += clampDiff;
          effectiveCheckOut = clampedDate;
        }
      }
    }
  } else {
    // 주간조: 구간별 독립 퇴근기준 적용
    const zone = getCheckoutZone(
      coMin,
      workEndMinute,
      overtimeEndMinute,
      checkoutThreshold,
      settings.overtime_checkout_threshold,
    );

    if (zone === "regular") {
      // 정규근무 구간: 정시 퇴근시간 이후 N분 이내 → 정시로 처리
      const minutesPastEnd = coMin - workEndMinute;
      if (minutesPastEnd >= 0 && minutesPastEnd <= checkoutThreshold) {
        const clampedDate = setKSTHours(coDate, workEndH, workEndM_);
        const clampDiff = Math.round((coDate.getTime() - clampedDate.getTime()) / 60000);
        if (clampDiff > 0) earlyLeaveTruncation += clampDiff;
        effectiveCheckOut = clampedDate;
      }
    } else if (zone === "overtime") {
      // 연장수당 구간: 연장종료시간 근처 또는 매시 정각 기준 보정
      const minutesPastOtEnd = coMin - overtimeEndMinute;
      if (minutesPastOtEnd >= 0 && minutesPastOtEnd <= settings.overtime_checkout_threshold) {
        // 연장종료시간 이후 보정범위 이내 → 연장종료시간으로 절사
        const clampedDate = setKSTHours(coDate, otEndH, otEndM);
        const clampDiff = Math.round((coDate.getTime() - clampedDate.getTime()) / 60000);
        if (clampDiff > 0) overtimeTruncation += clampDiff;
        effectiveCheckOut = clampedDate;
      } else if (minutesPastOtEnd < 0) {
        // 연장 구간 중간: 매시 정각 기준 보정 (예: 21:10 → 21:00)
        const minutesPastHour = coMin % 60;
        if (minutesPastHour > 0 && minutesPastHour <= settings.overtime_checkout_threshold) {
          const flooredHour = Math.floor(coMin / 60);
          const clampedDate = setKSTHours(coDate, flooredHour, 0);
          const clampDiff = Math.round((coDate.getTime() - clampedDate.getTime()) / 60000);
          if (clampDiff > 0) overtimeTruncation += clampDiff;
          effectiveCheckOut = clampedDate;
        }
      }
    } else if (zone === "night") {
      // 야간수당 구간: 해당 정각 이후 N분 이내 → 정각으로 절사
      // 자정 이후 시간도 동일하게 처리 (예: 01:05 → 01:00)
      const minutesPastHour = coMin % 60;
      if (minutesPastHour > 0 && minutesPastHour <= settings.night_checkout_threshold) {
        const flooredHour = Math.floor(coMin / 60);
        // 자정 이후(0~6시 등)에는 다음날 날짜 기준
        if (flooredHour < 12 && getKSTMinutes(new Date(`${date}T12:00:00+09:00`)) >= 720) {
          const nextDayStr = getNextDayStr(date);
          const clampedDate = new Date(`${nextDayStr}T${String(flooredHour).padStart(2, "0")}:00:00+09:00`);
          const clampDiff = Math.round((coDate.getTime() - clampedDate.getTime()) / 60000);
          if (clampDiff > 0) overtimeTruncation += clampDiff;
          effectiveCheckOut = clampedDate;
        } else {
          const clampedDate = setKSTHours(coDate, flooredHour, 0);
          const clampDiff = Math.round((coDate.getTime() - clampedDate.getTime()) / 60000);
          if (clampDiff > 0) overtimeTruncation += clampDiff;
          effectiveCheckOut = clampedDate;
        }
      }
    }
  }

  // 4. 휴게시간 결정
  let effectiveBreak = breakMinutesFromRecord ?? 0;
  if (isNight) {
    // 야간교대: 단계별 고정 휴게시간 합산 차감 (비례 방식 대신 고정 분수)
    const t1Break = settings.shift_tier1_break_minutes || 0;
    const t2Break = settings.shift_tier2_break_minutes || 0;
    const t3Break = settings.shift_tier3_break_minutes || 0;
    const t4Break = settings.shift_tier4_break_minutes || 0;
    effectiveBreak = t1Break + t2Break + t3Break + t4Break;
  } else if (effectiveBreak === 0) {
    const [bsH, bsM] = settings.break_start_time.split(":").map(Number);
    const [beH, beM] = settings.break_end_time.split(":").map(Number);
    effectiveBreak = beH * 60 + beM - (bsH * 60 + bsM);
    if (effectiveBreak < 0) effectiveBreak = 0;
  }

  // 5. 근무시간 계산
  const workMinutesBeforeOT = calculateWorkMinutes(effectiveCheckIn, effectiveCheckOut, effectiveBreak);

  // 6. 주간조: 초과근무 휴게시간 추가 차감 → 휴게시간에 합산
  let finalMinutes = workMinutesBeforeOT;
  let otBreak = 0;
  if (!isNight) {
    otBreak = calculateOvertimeBreak(
      workMinutesBeforeOT,
      settings.standard_work_hours,
      settings.overtime_break_2h,
      settings.overtime_break_4h,
    );
    if (otBreak > 0) effectiveBreak += otBreak;
    finalMinutes = Math.max(0, workMinutesBeforeOT - otBreak);
  }

  // 7. 정규/연장/야간 근무시간 세분화
  let regularMinutes = 0;
  let overtimeWorkMinutes = 0;
  let nightWorkMinutes = 0;

  let nightShiftWorkMinutes = 0;

  if (isNight) {
    // 야간조: 전체를 야간교대근무로 처리
    nightShiftWorkMinutes = finalMinutes;
  } else {
    // 주간조: 설정 기반 구간 분리
    const standardMinutes = settings.standard_work_hours * 60;
    regularMinutes = Math.min(finalMinutes, standardMinutes);

    const remaining = finalMinutes - regularMinutes;
    if (remaining > 0) {
      // night_shift_start_time 이후 = 야간근무, 그 전 = 연장근무
      const [nsH, nsM] = settings.night_shift_start_time.split(":").map(Number);
      const nightStartMin = nsH * 60 + nsM;

      // 정규종료 시각
      const [weH, weM] = settings.work_end_time.split(":").map(Number);
      const workEndMinute = weH * 60 + weM;

      // 퇴근 시각(보정 후) - 자정 이후 퇴근 시 +1440 보정
      let effectiveCoMin = getKSTMinutes(effectiveCheckOut);
      if (effectiveCoMin < workEndMinute) {
        effectiveCoMin += 1440; // 익일 퇴근
      }

      // 연장 구간: workEnd ~ min(checkout, nightStart)
      const overtimeEnd = Math.min(effectiveCoMin, nightStartMin);
      const rawOvertimeMin = Math.max(0, overtimeEnd - workEndMinute);

      // 야간 구간: max(workEnd, nightStart) ~ checkout
      const nightActualStart = Math.max(workEndMinute, nightStartMin);
      const rawNightMin = Math.max(0, effectiveCoMin - nightActualStart);

      // 연장 휴게는 연장 구간에서만 차감, 야간 구간은 그대로 유지
      overtimeWorkMinutes = Math.max(0, rawOvertimeMin - otBreak);
      nightWorkMinutes = rawNightMin;

      // 안전장치: 합계가 remaining을 초과하지 않도록 조정
      const total = overtimeWorkMinutes + nightWorkMinutes;
      if (total > remaining) {
        // 초과분은 연장에서 차감
        overtimeWorkMinutes = Math.max(0, remaining - nightWorkMinutes);
      }
    }
  }

  // 휴일근로 구간별 분 계산
  let holidayMinutesWithin8h = 0;
  let holidayMinutesOver8h = 0;
  let holidayNightMinutes = 0;

  if (isHolidayWork && !isNight) {
    const stdMin = settings.standard_work_hours * 60;
    // 8h 이내 구간 (야간 제외)
    const nonNightMinutes = finalMinutes - nightWorkMinutes;
    holidayMinutesWithin8h = Math.min(nonNightMinutes, stdMin);
    // 8h 초과 비야간 구간
    const overStd = Math.max(0, nonNightMinutes - stdMin);
    holidayMinutesOver8h = overStd;
    // 야간 구간 (8h 초과에 해당)
    holidayNightMinutes = nightWorkMinutes;
  }

  // 야간교대 4단계 세분화 계산 (표시 전용)
  let nightShiftTier1Minutes = 0;
  let nightShiftTier2Minutes = 0;
  let nightShiftTier3Minutes = 0;
  let nightShiftTier4Minutes = 0;

  if (isNight) {
    const t4 = calculate4TierNightShift(effectiveCheckIn, effectiveCheckOut, settings);
    nightShiftTier1Minutes = t4.tier1Minutes;
    nightShiftTier2Minutes = t4.tier2Minutes;
    nightShiftTier3Minutes = t4.tier3Minutes;
    nightShiftTier4Minutes = t4.tier4Minutes;
  }

  return {
    stayMinutes,
    breakMinutes: effectiveBreak,
    lateTruncation,
    overtimeTruncation,
    earlyLeaveTruncation,
    outingTruncation,
    recognizedMinutes: finalMinutes,
    regularMinutes,
    overtimeWorkMinutes,
    nightWorkMinutes,
    nightShiftWorkMinutes,
    actualCheckIn: formatKSTTime(originalCheckInDate),
    actualCheckOut: formatKSTTime(originalCheckOutDate),
    isHolidayWork,
    holidayMinutesWithin8h,
    holidayMinutesOver8h,
    holidayNightMinutes,
    nightShiftTier1Minutes,
    nightShiftTier2Minutes,
    nightShiftTier3Minutes,
    nightShiftTier4Minutes,
  };
}
export function calculateAttendanceTotals(
  records: AttendanceRecord[],
  settings: OrganizationSettings,
): {
  totalMinutes: number;
  totalStayMinutes: number;
  totalBreakMinutes: number;
  totalLateTruncation: number;
  totalOvertimeTruncation: number;
  totalEarlyLeaveTruncation: number;
  totalOutingTruncation: number;
  totalRegularMinutes: number;
  totalOvertimeWorkMinutes: number;
  totalNightWorkMinutes: number;
  totalNightShiftWorkMinutes: number;
  totalNightShiftTier1Minutes: number;
  totalNightShiftTier2Minutes: number;
  totalNightShiftTier3Minutes: number;
  totalNightShiftTier4Minutes: number;
  totalHoliday8hMinutes: number;
  totalHolidayOver8hMinutes: number;
  totalHolidayNightMinutes: number;
} {
  let totalMinutes = 0;
  let totalStayMinutes = 0;
  let totalBreakMinutes = 0;
  let totalLateTruncation = 0;
  let totalOvertimeTruncation = 0;
  let totalEarlyLeaveTruncation = 0;
  let totalOutingTruncation = 0;
  let totalRegularMinutes = 0;
  let totalOvertimeWorkMinutes = 0;
  let totalNightWorkMinutes = 0;
  let totalNightShiftWorkMinutes = 0;
  let totalNightShiftTier1Minutes = 0;
  let totalNightShiftTier2Minutes = 0;
  let totalNightShiftTier3Minutes = 0;
  let totalNightShiftTier4Minutes = 0;
  let totalHoliday8hMinutes = 0;
  let totalHolidayOver8hMinutes = 0;
  let totalHolidayNightMinutes = 0;

  records.forEach((att) => {
    if (att.rawCheckIn && att.rawCheckOut) {
      const isNight = att.workType === "night";

      // 날짜 분류: 공휴일 > 주휴일 > 토요일(비소정일) > 평일(소정근로일)
      const isWeeklyHol = isWeeklyHoliday(att.date, settings);
      const isPubHol = isPublicHoliday(att.date);
      const isScheduled = isScheduledWorkday(att.date, settings);
      const nonWorkDayType = (settings as any).non_work_day_default_type ?? "REST_DAY";
      const isNonScheduledHoliday =
        !isScheduled && !isWeeklyHol && !(isPubHol && settings.apply_public_holiday) && nonWorkDayType === "HOLIDAY";
      const isHolidayDay = isWeeklyHol || (isPubHol && settings.apply_public_holiday) || isNonScheduledHoliday;

      const breakdown = calculateSingleAttendance(
        att.rawCheckIn,
        att.rawCheckOut,
        att.date,
        att.breakMinutes,
        isNight,
        settings,
        isHolidayDay && !isNight,
      );

      totalStayMinutes += breakdown.stayMinutes;
      totalBreakMinutes += breakdown.breakMinutes;
      totalLateTruncation += breakdown.lateTruncation;
      totalOvertimeTruncation += breakdown.overtimeTruncation;
      totalEarlyLeaveTruncation += breakdown.earlyLeaveTruncation;
      totalOutingTruncation += breakdown.outingTruncation;
      totalMinutes += breakdown.recognizedMinutes;

      if (isNight) {
        // 야간교대조: 항상 야간교대근무로 처리 (휴일 여부 무관)
        totalNightShiftWorkMinutes += breakdown.nightShiftWorkMinutes;
        totalNightShiftTier1Minutes += breakdown.nightShiftTier1Minutes;
        totalNightShiftTier2Minutes += breakdown.nightShiftTier2Minutes;
        totalNightShiftTier3Minutes += breakdown.nightShiftTier3Minutes;
        totalNightShiftTier4Minutes += breakdown.nightShiftTier4Minutes;
      } else if (isHolidayDay) {
        // 주간조 휴일근무: 휴일 버킷으로 분리 (연장에 합산 금지)
        totalHoliday8hMinutes += breakdown.holidayMinutesWithin8h;
        totalHolidayOver8hMinutes += breakdown.holidayMinutesOver8h;
        totalHolidayNightMinutes += breakdown.holidayNightMinutes;
        totalNightWorkMinutes += breakdown.nightWorkMinutes;
      } else if (!isScheduled) {
        // 비소정근로일 (토요일 등): 설정값 기반 휴무일/휴일 분기
        const nonWorkDayType = (settings as any).non_work_day_default_type ?? "REST_DAY";
        if (nonWorkDayType === "HOLIDAY") {
          // 휴일 처리: 휴일 버킷으로
          totalHoliday8hMinutes += breakdown.holidayMinutesWithin8h;
          totalHolidayOver8hMinutes += breakdown.holidayMinutesOver8h;
          totalHolidayNightMinutes += breakdown.holidayNightMinutes;
          totalNightWorkMinutes += breakdown.nightWorkMinutes;
        } else {
          // 휴무일 처리 (REST_DAY): 연장근로로
          const nonNightMinutes = breakdown.recognizedMinutes - breakdown.nightWorkMinutes;
          totalOvertimeWorkMinutes += nonNightMinutes;
          totalNightWorkMinutes += breakdown.nightWorkMinutes;
        }
      } else {
        // 소정근로일 (평일): 정규/연장/야간 정상 분류
        totalRegularMinutes += breakdown.regularMinutes;
        totalOvertimeWorkMinutes += breakdown.overtimeWorkMinutes;
        totalNightWorkMinutes += breakdown.nightWorkMinutes;
      }
    }
  });

  return {
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
  };
}
