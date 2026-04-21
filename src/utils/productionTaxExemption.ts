/**
 * 생산직 근로자 연장·야간·휴일수당 비과세 처리
 * 소득세법 시행령 제17조 (2026년 기준)
 *
 * 비과세 요건 (3가지 동시 충족):
 *   1. 직종 = 생산직 (job_category === 'production')
 *   2. 직전연도 총급여 ≤ 3,700만원 (수동 입력값)
 *   3. 당월 월정액급여 ≤ 260만원 (매월 자동 판단)
 *
 * 월정액급여 포함: 기본급, 식대(복리후생), 정기수당
 * 월정액급여 제외: 연장·야간·휴일수당, 주휴수당, 상여금, 차량운전보조금(실비변상)
 *
 * 비과세 대상 수당 itemId 목록:
 *   overtime, night-shift-allowance,
 *   night-shift-tier2, night-shift-tier3, night-shift-tier4,
 *   holiday-work-allowance,
 *   hol-shift-tier1, hol-shift-tier2, hol-shift-tier3, hol-shift-tier4
 *
 * 비과세 제외 (과세):
 *   base-salary, weekly-holiday-allowance(주휴수당),
 *   public-holiday-pay, bonus 등
 */

/** 연간 비과세 한도: 2,400,000원 */
export const ANNUAL_EXEMPT_LIMIT = 2_400_000;

/** 월정액급여 기준 한도: 2,600,000원 */
export const MONTHLY_SALARY_LIMIT = 2_600_000;

/** 직전연도 총급여 한도: 37,000,000원 */
export const PRIOR_YEAR_INCOME_LIMIT = 37_000_000;

/**
 * 비과세 대상 수당 itemId 목록
 * 이 목록에 포함된 항목만 비과세 계산에 포함
 */
export const EXEMPT_ITEM_IDS = new Set([
  "overtime",
  "night-shift-allowance",
  "night-shift-tier2",
  "night-shift-tier3",
  "night-shift-tier4",
  "holiday-work-allowance",
  "hol-shift-tier1",
  "hol-shift-tier2",
  "hol-shift-tier3",
  "hol-shift-tier4",
  "public-holiday-work-pay", // 공휴일 실제 근로 가산수당
]);

/**
 * 월정액급여 제외 항목 itemId 목록
 * 이 항목들은 월정액급여 계산 시 제외
 */
export const MONTHLY_SALARY_EXCLUDE_IDS = new Set([
  "overtime",
  "night-shift-allowance",
  "night-shift-tier2",
  "night-shift-tier3",
  "night-shift-tier4",
  "holiday-work-allowance",
  "hol-shift-tier1",
  "hol-shift-tier2",
  "hol-shift-tier3",
  "hol-shift-tier4",
  "weekly-holiday-allowance", // 주휴수당 제외
  "bonus", // 비정기 상여 제외
  "vehicle-allowance", // 차량운전보조금 제외 (실비변상)
]);

export interface ProductionExemptInput {
  /** 직종 코드 ('production' 여부 판단) */
  jobCategory: string;
  /** 직전연도 총급여 (수동 입력, 미입력 시 null) */
  priorYearTotalSalary: number | null;
  /** 해당 월 지급항목 목록 */
  paymentItems: { itemId: string; name: string; amount: number }[];
  /** 연간 누적 비과세 적용액 (이번 달 이전까지) */
  accumulatedExemptAmount: number;
}

export interface ProductionExemptResult {
  /** 생산직 비과세 적용 대상 여부 */
  isEligible: boolean;
  /** 요건 미충족 사유 (eligible=false 시) */
  ineligibleReason: string | null;
  /** 당월 월정액급여 */
  monthlySalary: number;
  /** 월정액급여 요건 통과 여부 */
  isMonthlySalaryEligible: boolean;
  /** 직전연도 총급여 요건 통과 여부 */
  isPriorYearEligible: boolean;
  /** 이번 달 비과세 대상 수당 합계 */
  exemptTargetAmount: number;
  /** 이번 달 실제 비과세 적용액 (한도 고려) */
  exemptAmount: number;
  /** 이번 달 과세 전환액 (한도 초과분) */
  taxableAmount: number;
  /** 적용 후 연간 누적 비과세액 */
  newAccumulatedAmount: number;
  /** 잔여 연간 한도 */
  remainingLimit: number;
}

/**
 * 당월 생산직 비과세 계산
 */
export function calculateProductionExempt(input: ProductionExemptInput): ProductionExemptResult {
  const { jobCategory, priorYearTotalSalary, paymentItems, accumulatedExemptAmount } = input;

  // 기본 반환 구조
  const baseResult = {
    monthlySalary: 0,
    isMonthlySalaryEligible: false,
    isPriorYearEligible: false,
    exemptTargetAmount: 0,
    exemptAmount: 0,
    taxableAmount: 0,
    newAccumulatedAmount: accumulatedExemptAmount,
    remainingLimit: Math.max(0, ANNUAL_EXEMPT_LIMIT - accumulatedExemptAmount),
  };

  // ① 직종 확인
  if (jobCategory !== "production") {
    return {
      isEligible: false,
      ineligibleReason: "생산직 아님",
      ...baseResult,
    };
  }

  // ② 직전연도 총급여 확인
  if (priorYearTotalSalary === null) {
    return {
      isEligible: false,
      ineligibleReason: "직전연도 총급여 미입력",
      ...baseResult,
    };
  }

  const isPriorYearEligible = priorYearTotalSalary <= PRIOR_YEAR_INCOME_LIMIT;
  if (!isPriorYearEligible) {
    return {
      isEligible: false,
      ineligibleReason: `직전연도 총급여 초과 (${priorYearTotalSalary.toLocaleString("ko-KR")}원 > 3,700만원)`,
      ...baseResult,
      isPriorYearEligible: false,
    };
  }

  // ③ 월정액급여 계산
  // 월정액급여 = 지급항목 합계 - 비과세 제외항목
  const monthlySalary = paymentItems.reduce((sum, item) => {
    if (MONTHLY_SALARY_EXCLUDE_IDS.has(item.itemId)) return sum;
    return sum + item.amount;
  }, 0);

  const isMonthlySalaryEligible = monthlySalary <= MONTHLY_SALARY_LIMIT;
  if (!isMonthlySalaryEligible) {
    return {
      isEligible: false,
      ineligibleReason: `월정액급여 초과 (${monthlySalary.toLocaleString("ko-KR")}원 > 260만원)`,
      ...baseResult,
      monthlySalary,
      isMonthlySalaryEligible: false,
      isPriorYearEligible: true,
    };
  }

  // ④ 연간 한도 확인
  const remainingLimit = Math.max(0, ANNUAL_EXEMPT_LIMIT - accumulatedExemptAmount);
  if (remainingLimit === 0) {
    return {
      isEligible: false,
      ineligibleReason: "연간 비과세 한도(240만원) 소진",
      ...baseResult,
      monthlySalary,
      isMonthlySalaryEligible: true,
      isPriorYearEligible: true,
      remainingLimit: 0,
    };
  }

  // ⑤ 비과세 대상 수당 합계 계산
  const exemptTargetAmount = paymentItems.reduce((sum, item) => {
    if (EXEMPT_ITEM_IDS.has(item.itemId)) return sum + item.amount;
    return sum;
  }, 0);

  // ⑥ 실제 비과세 적용액 (한도 내)
  const exemptAmount = Math.min(exemptTargetAmount, remainingLimit);
  const taxableAmount = exemptTargetAmount - exemptAmount;
  const newAccumulatedAmount = accumulatedExemptAmount + exemptAmount;

  return {
    isEligible: true,
    ineligibleReason: null,
    monthlySalary,
    isMonthlySalaryEligible: true,
    isPriorYearEligible: true,
    exemptTargetAmount,
    exemptAmount,
    taxableAmount,
    newAccumulatedAmount,
    remainingLimit,
  };
}
