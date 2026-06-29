/**
 * 일용직 세금/보험 간이 계산 유틸리티
 * - dailyPayrollCalculation.ts의 세금 로직만 추출
 * - 일괄입력(BatchRegistration, BulkAttendance) 저장 시 사용
 */
import { DailyPayrollSettings } from "@/utils/dailyPayrollCalculation";

export interface DailyTaxResult {
  incomeTax: number;
  localIncomeTax: number;
  employmentInsurance: number;
  nationalPension: number;
  healthInsurance: number;
  longTermCareInsurance: number;
  industrialAccident: number;
  totalDeductions: number;
  netPay: number;
  // 과세/비과세 분리
  taxableIncome: number;
  nonTaxableIncome: number;
}

export interface DailyTaxInput {
  totalWage: number;
  overtimePay?: number;
  nightPay?: number;
  holidayPay?: number;
  mealAllowance?: number;
  vehicleAllowance?: number;
  extraNonTaxableAllowance?: number;
  isProductionWorkerTaxExempt?: boolean;
  /** 해당 월의 이미 누적된 식대 합계 (한도 계산용) */
  mealMonthlyAccum?: number;
  /** 해당 월의 이미 누적된 차량운전보조금 합계 (한도 계산용) */
  vehicleMonthlyAccum?: number;
}

/** 10원 미만 절삭 (버림) */
function truncateTo10(amount: number): number {
  return Math.floor(amount / 10) * 10;
}

/**
 * 총 지급액과 설정 기반으로 세금/보험 계산
 * @param totalWage 총 지급액 (calculated_pay)
 * @param dpSettings 일용직 급여 설정
 * @param settlementType 정산 유형
 * @param taxInput 과세/비과세 분리를 위한 추가 입력 (선택)
 */
/**
 * 월 비과세 한도 상수
 * - 식대: 월 200,000원
 * - 차량운전보조금: 월 200,000원
 * - 기타 비과세: 전액 과세 (extraNonTaxableAllowance는 과세소득에 포함)
 */
const MEAL_MONTHLY_LIMIT = 200000;
const VEHICLE_MONTHLY_LIMIT = 200000;

export function calculateDailyTax(
  totalWage: number,
  dpSettings: DailyPayrollSettings,
  settlementType?: "employment_income" | "business_income_3_3",
  taxInput?: DailyTaxInput,
): DailyTaxResult {
  const st = settlementType || dpSettings.default_settlement_type;

  // 비과세 소득 합산
  let nonTaxableIncome = 0;
  let limitExcessIncome = 0; // 비과세 한도 초과분 → 과세로 전환
  if (taxInput) {
    // 식대 - 월 20만원 한도
    const mealAmt = taxInput.mealAllowance ?? 0;
    if (mealAmt > 0) {
      const mealLimit =
        taxInput.mealMonthlyAccum !== undefined
          ? Math.max(0, MEAL_MONTHLY_LIMIT - taxInput.mealMonthlyAccum)
          : MEAL_MONTHLY_LIMIT;
      const mealNonTaxable = Math.min(mealAmt, mealLimit);
      nonTaxableIncome += mealNonTaxable;
      limitExcessIncome += mealAmt - mealNonTaxable;
    }
    // 차량운전보조금 - 월 20만원 한도
    const vehicleAmt = taxInput.vehicleAllowance ?? 0;
    if (vehicleAmt > 0) {
      const vehicleLimit =
        taxInput.vehicleMonthlyAccum !== undefined
          ? Math.max(0, VEHICLE_MONTHLY_LIMIT - taxInput.vehicleMonthlyAccum)
          : VEHICLE_MONTHLY_LIMIT;
      const vehicleNonTaxable = Math.min(vehicleAmt, vehicleLimit);
      nonTaxableIncome += vehicleNonTaxable;
      limitExcessIncome += vehicleAmt - vehicleNonTaxable;
    }
    // 기타수당(extraNonTaxableAllowance)은 전액 과세 → nonTaxableIncome에 포함하지 않음
  }

  const taxableIncome = Math.max(0, totalWage - nonTaxableIncome);

  // 1. 세금 계산 (과세소득 기준)
  let incomeTax = 0;
  let localIncomeTax = 0;

  if (st === "business_income_3_3") {
    incomeTax = truncateTo10(taxableIncome * 0.03);
    localIncomeTax = truncateTo10(incomeTax * 0.1);
  } else {
    const taxableAmount = Math.max(0, taxableIncome - dpSettings.tax_exempt_limit);
    if (taxableAmount > 0) {
      const rawTax = taxableAmount * 0.027;
      incomeTax = rawTax < 1000 ? 0 : truncateTo10(rawTax);
      localIncomeTax = truncateTo10(incomeTax * 0.1);
    }
  }

  // 2. 보험 계산 (총지급액 기준, 3.3% 사업소득일 경우 미적용)
  let employmentInsurance = 0;
  let nationalPension = 0;
  let healthInsurance = 0;

  if (st !== "business_income_3_3") {
    if (dpSettings.apply_employment_insurance) {
      employmentInsurance = truncateTo10(totalWage * (dpSettings.employment_insurance_rate / 100));
    }
    if (dpSettings.apply_national_pension) {
      nationalPension = truncateTo10(totalWage * (dpSettings.national_pension_rate / 100));
    }
    if (dpSettings.apply_health_insurance) {
      healthInsurance = truncateTo10(totalWage * (dpSettings.health_insurance_rate / 100));
    }
  }

  // 장기요양보험 = 건강보험료 × 장기요양보험 요율
let longTermCareInsurance = 0;
if (dpSettings.apply_health_insurance && healthInsurance > 0) {
  longTermCareInsurance = truncateTo10(healthInsurance * (dpSettings.long_term_care_rate / 100));
}

  // 산재보험 (사업주 부담, 참고용)
  const industrialAccident = truncateTo10(totalWage * (dpSettings.industrial_accident_rate / 100));

  const totalDeductions =
    incomeTax + localIncomeTax + employmentInsurance + nationalPension + healthInsurance + longTermCareInsurance;
  const netPay = totalWage - totalDeductions;

  return {
    incomeTax,
    localIncomeTax,
    employmentInsurance,
    nationalPension,
    healthInsurance,
    longTermCareInsurance,
    industrialAccident,
    totalDeductions,
    netPay,
    taxableIncome,
    nonTaxableIncome,
  };
}
