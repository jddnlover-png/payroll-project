/**
 * 주민번호 기반 만 나이 계산 유틸리티
 * - 한국 만 나이 기준 (생일 지나면 +1)
 * - 65세 이상: 고용보험 면제 대상 경고
 * - 18세 미만: 고용보험 면제 대상 경고
 */

export interface SsnAgeResult {
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  age: number;
  isOver65: boolean;
  isOver60: boolean;
  isUnder18: boolean;
  isAgeWarning: boolean;
  isPensionWarning: boolean;
  warningMessage: string | null;
  pensionWarningMessage: string | null;
}

/**
 * 주민번호 앞자리(6자리) + 7번째 자리로 만 나이 계산
 * @param ssnInput 주민번호 입력값 (숫자만 또는 하이픈 포함)
 */
export function calculateAgeFromSsn(ssnInput: string): SsnAgeResult | null {
  // 숫자만 추출
  const digits = ssnInput.replace(/[^0-9]/g, "");
  if (digits.length < 7) return null;

  const yy = parseInt(digits.slice(0, 2));
  const mm = parseInt(digits.slice(2, 4));
  const dd = parseInt(digits.slice(4, 6));
  const genderDigit = parseInt(digits.charAt(6));

  // 월/일 유효성 검사
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  // 출생연도 계산
  // 1, 2 → 1900년대
  // 3, 4 → 2000년대
  // 5, 6 → 1900년대 (외국인)
  // 7, 8 → 2000년대 (외국인)
  let birthYear: number;
  if (genderDigit === 1 || genderDigit === 2 || genderDigit === 5 || genderDigit === 6) {
    birthYear = 1900 + yy;
  } else if (genderDigit === 3 || genderDigit === 4 || genderDigit === 7 || genderDigit === 8) {
    birthYear = 2000 + yy;
  } else {
    return null;
  }

  // 만 나이 계산 (한국 기준)
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();

  let age = currentYear - birthYear;

  // 생일이 아직 안 지났으면 -1
  if (currentMonth < mm || (currentMonth === mm && currentDay < dd)) {
    age -= 1;
  }

  const isOver65 = age >= 65;
  const isUnder18 = age < 18;
  const isAgeWarning = isOver65 || isUnder18;

  let warningMessage: string | null = null;
  if (isOver65) {
    warningMessage = `만 ${age}세 — 65세 이상으로 고용보험 면제 대상일 수 있습니다`;
  } else if (isUnder18) {
    warningMessage = `만 ${age}세 — 18세 미만으로 고용보험 면제 대상일 수 있습니다`;
  }

  const isOver60 = age >= 60;
  const isPensionWarning = isOver60;
  const pensionWarningMessage = isOver60 ? `만 ${age}세 — 60세 이상으로 국민연금 신규가입 불가` : null;

  return {
    birthYear,
    birthMonth: mm,
    birthDay: dd,
    age,
    isOver65,
    isOver60,
    isUnder18,
    isAgeWarning,
    isPensionWarning,
    warningMessage,
    pensionWarningMessage,
  };
}
