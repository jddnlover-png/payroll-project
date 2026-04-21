// 주휴수당 저장/갱신 유틸리티 (추후 구현 예정)
import { supabase } from "@/integrations/supabase/client";
import type { WeeklyHolidayEligibilityResult } from "@/utils/weeklyHolidayEligibility";
import { calculateDailyTax } from "@/utils/dailyTaxCalculation";

export async function upsertWeeklyHolidayPayRecord(result: WeeklyHolidayEligibilityResult): Promise<void> {
  const payload = {
    organization_id: result.organization_id,
    worker_key: result.worker_key,
    worker_name: result.worker_name,
    week_start: result.week_start,
    week_end: result.week_end,
    worked_site_ids: result.worked_site_ids,
    weekly_work_day_list: result.weekly_work_day_list,
    weekly_holiday: result.weekly_holiday,
    weekly_work_hours: result.weekly_work_hours,
    prescribed_dates: result.prescribed_dates,
    worked_dates: result.worked_dates,
    total_work_minutes: result.total_work_minutes,
    is_eligible: result.is_eligible,
    reason: result.reason,
    applied_hourly_rate: result.applied_hourly_rate,
    has_mixed_hourly_rate: result.has_mixed_hourly_rate,
    rate_source: result.rate_source,
    weekly_holiday_pay: result.weekly_holiday_pay,
    calculated_at: result.calculated_at,
    updated_at: new Date().toISOString(),
  };

  const { error } = await (supabase as any).from("weekly_holiday_pay_records").upsert(payload as any, {
    onConflict: "organization_id,worker_key,week_start",
  });

  if (error) throw error;

  // 주휴수당이 0이면 세금 재계산 불필요
  if (!result.is_eligible || result.weekly_holiday_pay <= 0) return;

  try {
    // 해당 주 이 근로자의 daily_attendance 행 조회
    const { data: weekRows } = await supabase
      .from("daily_attendance")
      .select("*")
      .eq("organization_id", result.organization_id)
      .gte("work_date", result.week_start)
      .lte("work_date", result.week_end)
      .order("work_date", { ascending: false });

    if (!weekRows || weekRows.length === 0) return;

    // 해당 근로자 행만 필터
    const workerRows = weekRows.filter((r: any) => {
      const key = r.ssn_masked
        ? `SSN:${r.ssn_masked}`
        : r.phone
          ? `PHONE:${String(r.phone).replace(/[^0-9]/g, "")}`
          : `NAME:${(r.worker_name || "").trim()}`;
      return key === result.worker_key;
    });

    if (workerRows.length === 0) return;

    // 마지막 근무일 행 선택
    const targetRow = workerRows[0]; // already sorted desc

    // 급여설정 조회
    const { data: settingsData } = await supabase
      .from("daily_payroll_settings")
      .select("*")
      .eq("organization_id", result.organization_id)
      .single();

    if (!settingsData) return;

    // 주휴수당 포함 총 지급액으로 세금 재계산
    const calcPay = Number(targetRow.calculated_pay ?? 0);
    const mealAmt = Number(targetRow.meal_allowance_amount ?? 0);
    const vehicleAmt = Number(targetRow.vehicle_allowance_amount ?? 0);
    const extraAmt = Number(targetRow.extra_non_taxable_allowance_amount ?? 0);
    const weeklyHolidayPay = result.weekly_holiday_pay;

    const totalWage = calcPay + weeklyHolidayPay + mealAmt + vehicleAmt + extraAmt;

    const taxResult = calculateDailyTax(totalWage, settingsData as any, "employment_income", {
      totalWage,
      overtimePay: Number(targetRow.overtime_pay ?? 0),
      nightPay: Number(targetRow.night_pay ?? 0),
      holidayPay: Number(targetRow.holiday_pay ?? 0),
      mealAllowance: mealAmt,
      vehicleAllowance: vehicleAmt,
      extraNonTaxableAllowance: extraAmt,
    });

    // daily_attendance 업데이트
    await supabase
      .from("daily_attendance")
      .update({
        income_tax: taxResult.incomeTax,
        local_income_tax: taxResult.localIncomeTax,
        employment_insurance: taxResult.employmentInsurance,
        national_pension: taxResult.nationalPension,
        health_insurance: taxResult.healthInsurance,
        long_term_care_insurance: taxResult.longTermCareInsurance,
        industrial_accident: taxResult.industrialAccident,
        total_deductions: taxResult.totalDeductions,
        net_pay: taxResult.netPay,
      })
      .eq("id", targetRow.id);
  } catch (e) {
    console.error("주휴수당 세금 재계산 오류:", e);
    // 세금 재계산 실패해도 주휴수당 저장은 유지
  }
}
