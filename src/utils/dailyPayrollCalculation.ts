/**
 * 일용직 급여 계산 유틸리티
 *
 * 16개 원칙에 따라 근태 데이터 기반 자동 급여 생성
 * - 세금/보험 계산 시 10원 미만 절삭(버림)
 * - 시급제: 시급 × 인정 근무시간(가산 배율 포함)
 * - 일당제: 고정 일당 + 초과/야간 가산 수당
 */

import { OrganizationSettings } from "@/hooks/useOrganizationSettings";

export interface DailyPayrollSettings {
  wage_calc_method: "fixed" | "hourly";
  tax_exempt_limit: number;
  default_settlement_type: "employment_income" | "business_income_3_3";
  apply_employment_insurance: boolean;
  apply_industrial_accident_insurance: boolean;
  apply_national_pension: boolean;
  apply_health_insurance: boolean;
  monthly_workday_warning: number;
  employment_insurance_rate: number;
  national_pension_rate: number;
  health_insurance_rate: number;
  long_term_care_rate: number;
  industrial_accident_rate: number;
  weekly_work_hours?: number;
  weekly_work_day_list?: string[];
  weekly_work_days?: number;
  weekly_holiday?: string;
  holiday_work_policy?: "REFERENCE_ONLY" | "LEGAL_AUTO" | "FIXED_DAILY_WAGE";
  fixed_holiday_daily_wage?: number | null;
  holiday_minimum_enforce?: boolean;
  // 비과세 항목 설정
  enable_meal_allowance?: boolean;
  enable_vehicle_allowance?: boolean;
  enable_extra_non_taxable?: boolean;
  extra_non_taxable_name?: string;
  production_worker_tax_exempt?: boolean;
  non_work_day_default_type?: "REST_DAY" | "HOLIDAY";
  payment_day?: number;
}

export interface DailyPayrollInput {
  employeeId: string;
  workDate: string;
  attendanceRecordId: string;
  recognizedMinutes: number; // 인정 근무시간
  stayMinutes: number;
  breakMinutes: number;
  policyDeductionMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  baseSalary: number; // daily_rate or hourly_rate
  dailyRate: number | null;
  hourlyRate: number | null;
  payType: "daily" | "hourly";
  settlementType: "employment_income" | "business_income_3_3";
}

export interface DailyPayrollResult {
  workMinutes: number;
  stayMinutes: number;
  breakMinutes: number;
  policyDeductionMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  baseDailyWage: number;
  overtimePay: number;
  nightPay: number;
  totalWage: number;
  settlementType: string;
  incomeTax: number;
  localIncomeTax: number;
  employmentInsurance: number;
  nationalPension: number;
  healthInsurance: number;
  longTermCareInsurance: number;
  industrialAccident: number;
  totalDeductions: number;
  netPay: number;
}

/** 10원 미만 절삭 (버림) */
function truncateTo10(amount: number): number {
  return Math.floor(amount / 10) * 10;
}

/**
 * 일용직 급여 계산 메인 함수
 */
export function calculateDailyPayroll(
  input: DailyPayrollInput,
  dpSettings: DailyPayrollSettings,
  orgSettings: OrganizationSettings,
): DailyPayrollResult {
  const standardMinutes = orgSettings.standard_work_hours * 60;

  // 1. 기본 일당 및 초과/야간 수당 계산
  let baseDailyWage = 0;
  let overtimePay = 0;
  let nightPay = 0;

  if (input.payType === "hourly") {
    // 시급 기반 계산
    const rate = input.hourlyRate || 0;
    const regularMinutes = Math.min(input.recognizedMinutes, standardMinutes);
    const overtimeMin = Math.max(0, input.recognizedMinutes - standardMinutes);

    baseDailyWage = Math.round(rate * (regularMinutes / 60));
    overtimePay = Math.round(rate * orgSettings.overtime_multiplier * (overtimeMin / 60));

    // 야간 수당: 야간 근무 시간에 대해 야간 배율 적용
    if (input.nightMinutes > 0) {
      nightPay = Math.round(rate * orgSettings.night_shift_multiplier * (input.nightMinutes / 60));
    }
  } else {
    // 고정 일당 기반 계산
    const dailyRate = input.dailyRate || 0;
    baseDailyWage = dailyRate;

    // 초과근무: [고정 일당 ÷ 8시간]으로 시급 산출 후 배율 적용
    const impliedHourlyRate = dailyRate / orgSettings.standard_work_hours;
    const overtimeMin = Math.max(0, input.recognizedMinutes - standardMinutes);

    if (overtimeMin > 0) {
      overtimePay = Math.round(impliedHourlyRate * orgSettings.overtime_multiplier * (overtimeMin / 60));
    }

    // 야간 수당
    if (input.nightMinutes > 0) {
      nightPay = Math.round(impliedHourlyRate * orgSettings.night_shift_multiplier * (input.nightMinutes / 60));
    }
  }

  const totalWage = baseDailyWage + overtimePay + nightPay;

  // 2. 세금 계산
  let incomeTax = 0;
  let localIncomeTax = 0;

  if (input.settlementType === "business_income_3_3") {
    // 3.3% 사업소득: 소득세 3% + 지방소득세 0.3%
    incomeTax = truncateTo10(totalWage * 0.03);
    localIncomeTax = truncateTo10(incomeTax * 0.1);
  } else {
    // 근로소득 (일용직): 면세 기준 초과분에 대해 소득세 적용
    const taxableAmount = Math.max(0, totalWage - dpSettings.tax_exempt_limit);
    if (taxableAmount > 0) {
      const rawTax = taxableAmount * 0.027;
      // 소액부징수: 결정세액 1,000원 미만 → 0원 (소득세법 기준)
      incomeTax = rawTax < 1000 ? 0 : truncateTo10(rawTax);
      localIncomeTax = truncateTo10(incomeTax * 0.1);
    }
  }

  // 3. 보험 계산 (3.3% 사업소득일 경우 보험 미적용)
  let employmentInsurance = 0;
  let nationalPension = 0;
  let healthInsurance = 0;

  if (input.settlementType !== "business_income_3_3") {
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

  // 장기요양보험 = 건강보험료 × 장기요양보험 요율%
  let longTermCareInsurance = 0;
  if (dpSettings.apply_health_insurance && healthInsurance > 0) {
    longTermCareInsurance = truncateTo10(healthInsurance * (dpSettings.long_term_care_rate / 100));
  }

  // 산재보험 = 총지급액 × 산재보험 요율% (사업주 부담, 공제 아님)
  const industrialAccident = truncateTo10(totalWage * (dpSettings.industrial_accident_rate / 100));

  const totalDeductions =
    incomeTax + localIncomeTax + employmentInsurance + nationalPension + healthInsurance + longTermCareInsurance;
  // industrialAccident는 공제 미포함 (참고용)
  const netPay = totalWage - totalDeductions;

  return {
    workMinutes: input.recognizedMinutes,
    stayMinutes: input.stayMinutes,
    breakMinutes: input.breakMinutes,
    policyDeductionMinutes: input.policyDeductionMinutes,
    overtimeMinutes: input.overtimeMinutes,
    nightMinutes: input.nightMinutes,
    baseDailyWage,
    overtimePay,
    nightPay,
    totalWage,
    settlementType: input.settlementType,
    incomeTax,
    localIncomeTax,
    employmentInsurance,
    nationalPension,
    healthInsurance,
    longTermCareInsurance,
    industrialAccident,
    totalDeductions,
    netPay,
  };
}
