/**
 * 근무시간 계산 유틸리티
 * 
 * Date Diff 우선 계산 방식:
 * 1. 먼저 두 타임스탬프 간의 절대적 시간 차이(Date Diff)를 계산
 * 2. 퇴근 타임스탬프가 출근보다 이전이면 익일 퇴근으로 간주하여 +24시간 보정
 * 3. 휴게시간 차감 후 최종 실근무시간 산출
 * 
 * 이 방식은 YYYY-MM-DD HH:mm 형식(ADT/세콤)과 HH:mm 형식 모두 대응 가능
 */

/**
 * 두 Date 객체 간의 근무시간(분)을 계산합니다.
 * 퇴근이 출근보다 이전이면 자동으로 익일로 간주합니다.
 */
export function calculateWorkMinutes(
  checkIn: Date,
  checkOut: Date,
  breakMinutes: number = 0
): number {
  let diffMs = checkOut.getTime() - checkIn.getTime();
  
  // 퇴근 타임스탬프가 출근보다 이전이면 익일 퇴근으로 보정 (+24시간)
  if (diffMs < 0) {
    diffMs += 24 * 60 * 60 * 1000;
  }
  
  const totalMinutes = Math.round(diffMs / 60000);
  return Math.max(0, totalMinutes - breakMinutes);
}

/**
 * 근무시간을 "X시간 Y분" 형식 문자열로 변환합니다.
 */
export function formatWorkHours(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}시간 ${minutes}분`;
}

/**
 * 퇴근 시간이 출근 시간보다 이전인지 판별합니다.
 * (야간조/자정 경계 판별용)
 */
export function isOvernightShift(checkInTime: string, checkOutTime: string): boolean {
  const [ciH, ciM] = checkInTime.split(':').map(Number);
  const [coH, coM] = checkOutTime.split(':').map(Number);
  return (coH * 60 + coM) < (ciH * 60 + ciM);
}

/**
 * 초과근무 휴게시간을 계산합니다.
 * - 초과근무 2시간 이상: overtime_break_2h 적용
 * - 초과근무 4시간 이상: overtime_break_4h 적용
 */
export function calculateOvertimeBreak(
  totalWorkMinutes: number,
  standardWorkHours: number,
  overtimeBreak2h: number,
  overtimeBreak4h: number
): number {
  const standardMinutes = standardWorkHours * 60;
  const overtimeMinutes = totalWorkMinutes - standardMinutes;
  
  if (overtimeMinutes <= 0) return 0;
  if (overtimeMinutes >= 240) return overtimeBreak4h; // 4시간 이상
  if (overtimeMinutes >= 120) return overtimeBreak2h; // 2시간 이상
  return 0;
}

/**
 * 야간 근무 휴게시간을 비례 차감 방식으로 계산합니다.
 * - 4시간 미만 근무: 0분 (휴게 없음)
 * - 4시간 이상 8시간 미만: 설정값의 절반
 * - 8시간 이상: 설정값 전체
 * - 안전장치: 차감 휴게시간이 실제 근무시간을 초과할 수 없음
 */
export function calculateNightBreakMinutes(
  nightWorkMinutes: number,
  nightBreakSetting: number
): number {
  if (nightWorkMinutes < 240) return 0; // 4시간 미만: 0분
  
  let breakMinutes: number;
  if (nightWorkMinutes >= 480) {
    breakMinutes = nightBreakSetting; // 8시간 이상: 전체
  } else {
    breakMinutes = Math.round(nightBreakSetting / 2); // 4~8시간: 절반
  }
  
  // 안전장치: 휴게시간이 근무시간을 초과하지 않도록 제한
  return Math.min(breakMinutes, nightWorkMinutes);
}

/**
 * HH:mm 형식의 출퇴근 시간과 기준 날짜로부터 올바른 ISO 타임스탬프를 생성합니다.
 * 퇴근이 출근보다 이른 시간이면 자동으로 익일 날짜를 적용합니다.
 */
export function buildCheckOutTimestamp(
  baseDate: string,
  checkInTime: string,
  checkOutTime: string,
  timezone: string = '+09:00'
): string {
  let checkOutDate = baseDate;
  
  if (isOvernightShift(checkInTime, checkOutTime)) {
    const nextDay = new Date(`${baseDate}T00:00:00${timezone}`);
    nextDay.setDate(nextDay.getDate() + 1);
    const y = nextDay.getFullYear();
    const m = String(nextDay.getMonth() + 1).padStart(2, '0');
    const d = String(nextDay.getDate()).padStart(2, '0');
    checkOutDate = `${y}-${m}-${d}`;
  }
  
  return `${checkOutDate}T${checkOutTime}:00${timezone}`;
}
