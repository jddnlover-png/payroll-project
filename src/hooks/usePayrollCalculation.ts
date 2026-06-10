import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useEmployees } from "@/hooks/useEmployees";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { usePayrollSettingsStore } from "@/store/payrollSettingsStore";
import { usePayroll } from "@/hooks/usePayroll";
import { useEmployeePayrollSettings } from "@/hooks/useEmployeePayrollSettings";
import { useWeeklyHolidayCarry } from "@/hooks/useWeeklyHolidayCarry";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateSingleAttendance } from "@/utils/attendanceCalculation";
import { calculateNightTierMinutes } from "@/hooks/useDailyWageSnapshots";
import { calculateSalaryDetail, AttendanceRawRecord } from "@/utils/salaryDetailCalculation";
import { calculateProductionExempt } from "@/utils/productionTaxExemption";
import { calculateIncomeTax } from "@/lib/incomeTaxCalculation";

export function usePayrollCalculation(year: number, month: number) {
  const queryClient = useQueryClient();

  const { currentOrganization } = useOrganization();
  const { employees } = useEmployees();
  const { settings: orgSettings } = useOrganizationSettings();
  const { createPayroll } = usePayroll(year, month);
  const payrollItemSettings = usePayrollSettingsStore();
  const { getEmployeePaymentItems, getEmployeeDeductionItems } = useEmployeePayrollSettings();
  const { getEffectiveCarryDaysBatch } = useWeeklyHolidayCarry();

  const calculatePayroll = useCallback(
    async (employeeIds: string[]) => {
      if (!currentOrganization?.id) {
        toast.error("조직을 선택해주세요");
        return;
      }

      if (employeeIds.length === 0) {
        toast.error("급여 계산할 직원을 선택해주세요");
        return;
      }

      try {
        const getKstMinutes = (value: string | null) => {
          if (!value) return null;
          const d = new Date(value);
          const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
          return kst.getUTCHours() * 60 + kst.getUTCMinutes();
        };

        const getActualAttendanceMinutes = (records: any[]) => {
          let actualLateMinutes = 0;
          let actualEarlyLeaveMinutes = 0;

          records.forEach((att) => {
            const ci = att.check_in;
            const co = att.check_out;
            if (!ci || !co) return;

            const isNight = (att.work_type || "day") === "night";

            const checkInMin = getKstMinutes(ci);
            const checkOutMin = getKstMinutes(co);
            if (checkInMin === null || checkOutMin === null) return;

            const startTime = isNight ? orgSettings.shift_tier1_start : orgSettings.work_start_time;
            const endTime = isNight ? orgSettings.shift_tier3_end : orgSettings.work_end_time;
            const lateThreshold = isNight ? orgSettings.shift_late_threshold : orgSettings.late_threshold;

            const [sh, sm] = startTime.split(":").map(Number);
            const startMin = sh * 60 + sm;

            const [eh, em] = endTime.split(":").map(Number);
            const endMin = eh * 60 + em;

            if (checkInMin > startMin + lateThreshold) {
              actualLateMinutes += checkInMin - startMin;
            }

            if (!isNight && checkOutMin < endMin) {
              actualEarlyLeaveMinutes += endMin - checkOutMin;
            }
          });

          return {
            actualLateMinutes,
            actualEarlyLeaveMinutes,
          };
        };

        // 해당 월의 시작일과 종료일 계산
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        const workDaysInMonth = lastDay;

        // 주휴수당 사전 판정을 위해 직전 4주 데이터도 함께 조회
        const priorStart = new Date(year, month - 1, 1);
        priorStart.setDate(priorStart.getDate() - 28); // 4주 전
        const priorStartDate = `${priorStart.getFullYear()}-${String(priorStart.getMonth() + 1).padStart(2, "0")}-${String(priorStart.getDate()).padStart(2, "0")}`;

        // Supabase에서 해당 월 + 직전 4주의 근태 데이터 조회
        const { data: allAttendanceData, error: attendanceError } = await supabase
          .from("attendance_records")
          .select("*")
          .eq("organization_id", currentOrganization.id)
          .gte("date", priorStartDate)
          .lte("date", endDate);

        if (attendanceError) throw attendanceError;

        // 해당 월 근태만 필터
        const attendanceData = allAttendanceData?.filter((a) => a.date >= startDate && a.date <= endDate) || [];

        // 조직 설정에서 급여 계산 관련 값 사용 (하드코딩 제거)
        const overtimeRate = orgSettings.overtime_rate;
        const standardWorkHours = orgSettings.standard_work_hours;
        const lateDeductionRate = orgSettings.late_deduction_rate;
        const absentDeductionRate = orgSettings.absent_deduction_rate;
        const insuranceDeductionRate = orgSettings.insurance_deduction_rate;

        // 야간 수당 배율 설정
        const shiftTier1Multiplier = orgSettings.shift_tier1_multiplier;
        const shiftTier2Multiplier = orgSettings.shift_tier2_multiplier;
        const shiftTier3Multiplier = orgSettings.shift_tier3_multiplier;

        // 야간 시간대 설정 (분 단위)
        const [t1sH, t1sM] = orgSettings.shift_tier1_start.split(":").map(Number);
        const [t1eH, t1eM] = orgSettings.shift_tier1_end.split(":").map(Number);
        const [t2sH, t2sM] = orgSettings.shift_tier2_start.split(":").map(Number);
        const [t2eH, t2eM] = orgSettings.shift_tier2_end.split(":").map(Number);
        const [t3sH, t3sM] = orgSettings.shift_tier3_start.split(":").map(Number);
        const [t3eH, t3eM] = orgSettings.shift_tier3_end.split(":").map(Number);

        const tier1Start = t1sH * 60 + t1sM;
        const tier1End = t1eH * 60 + t1eM;
        const tier2Start = t2sH * 60 + t2sM;
        const tier2End = t2eH * 60 + t2eM;
        const tier3Start = t3sH * 60 + t3sM;
        const tier3End = t3eH * 60 + t3eM;

        // 선택된 직원 필터링
        const targetEmployees = employees.filter(
          (emp) => emp.is_active && employeeIds.includes(emp.id) && emp.employment_type !== "daily",
        );

        const targetEmployeeIds = targetEmployees.map((emp) => emp.id);

        // 이번 급여계산에서 제외된 직원의 해당 월 생산직 비과세 records 삭제
        // 급여계산 버튼이 해당 월의 최신 계산 상태를 의미하므로,
        // 선택되지 않은 직원의 월별 비과세 기록도 함께 제거한다.
        const { error: cleanupExemptError } = await supabase
          .from("production_tax_exempt_records")
          .delete()
          .eq("organization_id", currentOrganization.id)
          .eq("apply_year", year)
          .eq("apply_month", month)
          .not("employee_id", "in", `(${targetEmployeeIds.join(",")})`);

        if (cleanupExemptError) {
          console.error("production_tax_exempt_records cleanup error:", cleanupExemptError);
          throw cleanupExemptError;
        }

        // salary_details 엔진용 전체 근태 데이터 변환
        const allAttRaw: AttendanceRawRecord[] = (allAttendanceData || []).map((a: any) => ({
          id: a.id,
          employee_id: a.employee_id,
          date: a.date,
          check_in: a.check_in,
          check_out: a.check_out,
          status: a.status,
          break_minutes: a.break_minutes,
          work_type: a.work_type,
          is_holiday: a.is_holiday,
        }));

        const yearMonth = `${year}-${String(month).padStart(2, "0")}`;

        // 이월 데이터 일괄 조회
        const nonMonthlyIds = targetEmployees.filter((e) => e.pay_type !== "monthly").map((e) => e.id);
        const carryMap = await getEffectiveCarryDaysBatch(nonMonthlyIds, year, month);

        const payrollRecords = await Promise.all(
          targetEmployees.map(async (emp) => {
            // 해당 직원의 근태 기록 필터링
            const empAttendance = attendanceData?.filter((att) => att.employee_id === emp.id) || [];

            const presentDays = empAttendance.filter((a) => a.status === "present").length;
            const lateDays = empAttendance.filter((a) => a.status === "late").length;
            const absentDays = empAttendance.filter((a) => a.status === "absent").length;
            const workedDays = presentDays + lateDays;

            const { actualLateMinutes, actualEarlyLeaveMinutes } = getActualAttendanceMinutes(empAttendance);

            // ========== 시급/일급제: 검증 완료된 salary_details 엔진 사용 ==========
            if (emp.pay_type !== "monthly") {
              const empMonthAtt = allAttRaw.filter(
                (a) => a.employee_id === emp.id && a.date >= startDate && a.date <= endDate,
              );

              const prevCarryDays = carryMap.get(emp.id) || 0;
              const sdResult = calculateSalaryDetail(
                emp,
                empMonthAtt,
                allAttRaw,
                orgSettings,
                yearMonth,
                prevCarryDays,
              );

              const baseSalary = sdResult.regular_pay;
              const overtime = sdResult.overtime_pay;
              const nightShiftAllowance = sdResult.night_pay;
              const totalHolidayPay = sdResult.holiday_work_pay + sdResult.holiday_work_overtime_pay;
              const weeklyHolidayPay = sdResult.weekly_holiday_pay;
              const publicHolidayPay = sdResult.public_holiday_pay;
const publicHolidayWorkPay = sdResult.public_holiday_work_pay;
const paidLeavePay = sdResult.paid_leave_pay;

              const meta = sdResult.meta;

              // 직원별 오버라이드가 적용된 지급/공제 항목 조회
              const activePaymentItems = getEmployeePaymentItems(emp.id);
              const activeDeductionItems = getEmployeeDeductionItems(emp.id);

              // 동적 지급 항목 계산 (salary_details 값 사용)
              const paymentItemsValues = activePaymentItems.map((item) => {
                let amount = 0;
                if (item.id === "base-salary") {
                  amount = baseSalary;
                } else if (item.id === "overtime") {
                  // 야간교대 전용 직원은 overtime이 tier에 포함되므로 여기서 제외
                  // 혼합근무 직원은 주간 연장수당만 포함
                  amount = (item as any).overrideValue != null ? (item as any).overrideValue : overtime;
                } else if (item.id === "night-shift-allowance") {
                  amount = (item as any).overrideValue != null ? (item as any).overrideValue : nightShiftAllowance;
                } else if (item.calculationType === "fixed" && item.defaultValue) {
                  amount = item.defaultValue;
                } else if (item.calculationType === "percentage" && item.defaultValue) {
                  amount = Math.round((baseSalary * item.defaultValue) / 100);
                } else if (item.calculationType === "manual") {
                  // 수동입력 항목: overrideValue 우선, 없으면 defaultValue
                  amount = (item as any).overrideValue ?? item.defaultValue ?? 0;
                }
                return { itemId: item.id, name: item.name, amount, type: "payment" as const };
              });

              // 야간수당 자동 추가 (주간조 야간근무)
              const hasNightItem = paymentItemsValues.some((v) => v.itemId === "night-shift-allowance");
              if (!hasNightItem && nightShiftAllowance > 0) {
                paymentItemsValues.push({
                  itemId: "night-shift-allowance",
                  name: "야간근로수당",
                  amount: nightShiftAllowance,
                  type: "payment",
                });
              }

              // 야간교대 단계별 수당 추가 (비휴일 2/3/4단계 Alpha)
              if (sdResult.shift_pay_2 > 0) {
                paymentItemsValues.push({
                  itemId: "night-shift-tier2",
                  name: "야간수당(2단계)",
                  amount: sdResult.shift_pay_2,
                  type: "payment",
                  shiftTierMinutes: meta.shiftTier2Minutes,
                  shiftTierMultiplier: orgSettings.shift_tier2_multiplier,
                } as any);
              }
              if (sdResult.shift_pay_3 > 0) {
                paymentItemsValues.push({
                  itemId: "night-shift-tier3",
                  name: "야간+연장수당(3단계)",
                  amount: sdResult.shift_pay_3,
                  type: "payment",
                  shiftTierMinutes: meta.shiftTier3Minutes,
                  shiftTierMultiplier: orgSettings.shift_tier3_multiplier,
                } as any);
              }
              if (sdResult.shift_pay_4 > 0) {
                paymentItemsValues.push({
                  itemId: "night-shift-tier4",
                  name: "연장수당(4단계)",
                  amount: sdResult.shift_pay_4,
                  type: "payment",
                  shiftTierMinutes: meta.shiftTier4Minutes,
                  shiftTierMultiplier: orgSettings.shift_tier4_multiplier || 1.5,
                } as any);
              }

              // 휴일 야간교대 가산 (4단계) — 0원 항목 제외
              if (sdResult.hol_shift_t1_pay > 0) {
                paymentItemsValues.push({
                  itemId: "hol-shift-tier1",
                  name: "휴일1단계가산",
                  amount: sdResult.hol_shift_t1_pay,
                  type: "payment",
                  shiftTierMinutes: meta.holShiftTier1Minutes,
                  shiftTierMultiplier: orgSettings.shift_tier1_multiplier + (orgSettings.holiday_alpha_8h || 0.5),
                } as any);
              }
              if (sdResult.hol_shift_t2_pay > 0) {
                paymentItemsValues.push({
                  itemId: "hol-shift-tier2",
                  name: "휴일2단계가산",
                  amount: sdResult.hol_shift_t2_pay,
                  type: "payment",
                  shiftTierMinutes: meta.holShiftTier2Minutes,
                  shiftTierMultiplier: orgSettings.shift_tier2_multiplier + (orgSettings.holiday_alpha_8h || 0.5),
                } as any);
              }
              if (sdResult.hol_shift_t3_pay > 0) {
                // T3 가산분: 야간(0.5) + 휴일초과(1.0) = 1.5 → tierMultiplier = 2.5 (PaySlip에서 -1.0)
                const nightAlpha = (orgSettings.shift_tier2_multiplier || 1.5) - 1.0; // 0.5
                paymentItemsValues.push({
                  itemId: "hol-shift-tier3",
                  name: "휴일3단계가산",
                  amount: sdResult.hol_shift_t3_pay,
                  type: "payment",
                  shiftTierMinutes: meta.holShiftTier3Minutes,
                  shiftTierMultiplier: 1.0 + nightAlpha + (orgSettings.holiday_alpha_ot || 1.0),
                } as any);
              }
              if (sdResult.hol_shift_t4_pay > 0) {
                // T4 가산분: 휴일초과(1.0)만 → tierMultiplier = 2.0 (PaySlip에서 -1.0)
                paymentItemsValues.push({
                  itemId: "hol-shift-tier4",
                  name: "휴일4단계가산",
                  amount: sdResult.hol_shift_t4_pay,
                  type: "payment",
                  shiftTierMinutes: meta.holShiftTier4Minutes,
                  shiftTierMultiplier: 1.0 + (orgSettings.holiday_alpha_ot || 1.0),
                } as any);
              }

              // 주간조 휴일가산수당 추가 (야간교대 휴일은 위에서 처리, 중복 금지)
              if (totalHolidayPay > 0) {
                paymentItemsValues.push({
                  itemId: "holiday-work-allowance",
                  name: "휴일근로수당",
                  amount: totalHolidayPay,
                  type: "payment" as const,
                  holidayWork8hMinutes: meta.holidayWork8hMinutes,
                  holidayWorkOver8hMinutes: meta.holidayWorkOver8hMinutes,
                  holidayNightMinutes: meta.holidayNightMinutes,
                } as any);
              }

              // 공휴일 유급수당 추가
              if (publicHolidayPay > 0) {
                paymentItemsValues.push({
                  itemId: "public-holiday-pay",
                  name: "공휴일 유급수당",
                  amount: publicHolidayPay,
                  type: "payment",
                });
              }
              // 휴가 유급수당 추가
if (paidLeavePay > 0) {
  paymentItemsValues.push({
    itemId: "paid-leave-pay",
    name: "휴가 유급수당",
    amount: paidLeavePay,
    type: "payment",
    paidLeaveMinutes: meta.paidLeaveMinutes,
  } as any);
}

              // 공휴일 근로시간 메타 저장
              // 금액이 0원이어도 명세서 근무시간 표시를 위해 시간은 반드시 저장
              if (meta.publicHolidayWorkMinutes > 0 || publicHolidayWorkPay > 0) {
                paymentItemsValues.push({
                  itemId: "public-holiday-work-pay",
                  name: "공휴일 근로수당",
                  amount: publicHolidayWorkPay,
                  type: "payment",
                  publicHolidayWorkMinutes: meta.publicHolidayWorkMinutes,
                } as any);
              }

              // 주휴수당 추가
              if (weeklyHolidayPay > 0) {
                paymentItemsValues.push({
                  itemId: "weekly-holiday-allowance",
                  name: "주휴수당",
                  amount: weeklyHolidayPay,
                  type: "payment",
                });
              }

              const totalPayments = paymentItemsValues.reduce((sum, item) => sum + item.amount, 0);

              // ── 생산직 비과세 계산 ──
              // 직전연도 총급여는 production_tax_exempt_settings 에서 조회
              let exemptAmount = 0;
              let exemptResult = null;
              if (emp.job_category === "production") {
                // 해당 직원의 이번 연도 설정 조회
                const { data: exemptSetting } = await supabase
                  .from("production_tax_exempt_settings")
                  .select("*")
                  .eq("organization_id", currentOrganization.id)
                  .eq("employee_id", emp.id)
                  .eq("apply_year", year)
                  .maybeSingle();

                // 이번 달 이전까지 누적 비과세액 조회
                const { data: priorRecords } = await supabase
                  .from("production_tax_exempt_records")
                  .select("exempt_amount")
                  .eq("organization_id", currentOrganization.id)
                  .eq("employee_id", emp.id)
                  .eq("apply_year", year)
                  .lt("apply_month", month);

                const accumulatedExempt = (priorRecords || []).reduce(
                  (sum: number, r: any) => sum + (r.exempt_amount || 0),
                  0,
                );

                exemptResult = calculateProductionExempt({
                  jobCategory: emp.job_category,
                  priorYearTotalSalary: exemptSetting?.is_eligible
                    ? (exemptSetting.prior_year_total_salary ?? null)
                    : null,
                  paymentItems: paymentItemsValues,
                  accumulatedExemptAmount: accumulatedExempt,
                });

                exemptAmount = exemptResult.exemptAmount;

                // upsert로 변경 (UNIQUE 제약 기반 안전한 덮어쓰기)
                const { data: savedExemptRecord, error: exemptRecordError } = await supabase
                  .from("production_tax_exempt_records")
                  .upsert(
                    {
                      organization_id: currentOrganization.id,
                      employee_id: emp.id,
                      apply_year: year,
                      apply_month: month,
                      monthly_salary: exemptResult.monthlySalary,
                      is_eligible_month: exemptResult.isEligible,
                      exempt_amount: exemptResult.exemptAmount,
                      taxable_amount: exemptResult.taxableAmount,
                    },
                    { onConflict: "organization_id,employee_id,apply_year,apply_month" },
                  )
                  .select()
                  .single();

                if (exemptRecordError) {
                  console.error("production_tax_exempt_records upsert error:", exemptRecordError);
                  throw exemptRecordError;
                }

                if (!savedExemptRecord) {
                  throw new Error("production_tax_exempt_records 저장 결과가 없습니다.");
                }
              }

              // ── 공제 기준 분리 (법적 기준) ──
              // exemptLimit 기반 비과세 항목 자동 계산 (소득세에서만 제외)
              const staticExemptAmount = paymentItemsValues.reduce((sum, item) => {
                const payrollItem = activePaymentItems.find((p) => p.id === item.itemId);
                if (payrollItem?.exemptLimit && item.amount > 0) {
                  return sum + Math.min(item.amount, payrollItem.exemptLimit);
                }
                return sum;
              }, 0);

              // 소득세 기준: 생산직비과세 + 모든 비과세한도 항목 제외
              const taxBase = Math.max(0, totalPayments - exemptAmount - staticExemptAmount);

              // 4대보험 산정 기준
// 국민연금/건강보험은 직원등록의 공단 고지 기준금액을 우선 사용
// 미입력 시 기존 방식(totalPayments)으로 fallback
const insuranceBase = totalPayments;

const nationalPensionBaseRaw =
  Number((emp as any).national_pension_monthly_income) || insuranceBase;

const healthInsuranceBase =
  Number((emp as any).health_insurance_monthly_income) || insuranceBase;

// 국민연금 기준소득월액 상·하한
// 2025.07~2026.06 기준: 400,000원 ~ 6,370,000원
const nationalPensionBase = Math.min(
  6_370_000,
  Math.max(400_000, nationalPensionBaseRaw),
);

const healthInsuranceItem = activeDeductionItems.find((i) => i.id === "health-insurance");
const healthInsuranceAmount = healthInsuranceItem?.defaultValue
  ? Math.floor((healthInsuranceBase * healthInsuranceItem.defaultValue) / 100 / 10) * 10
  : 0;
              // 간이세액표 소득세 계산
              const taxResult = await calculateIncomeTax({
                taxBase,
                dependents: (emp as any).dependents ?? 1,
                childrenAged8to20: (emp as any).children_aged_8_to_20 ?? 0,
              });
              let incomeTaxAmount = taxResult.incomeTax;

              const deductionItemsValues = activeDeductionItems.map((item) => {
                let amount = 0;
                if (item.id === "income-tax") {
                  // 소득세: 간이세액표 계산 결과
                  amount = incomeTaxAmount;
                } else if (item.id === "local-income-tax") {
                  // 지방소득세: 소득세 × 10%
                  amount = taxResult.localIncomeTax;
                } else if (item.id === "long-term-care") {
                  // 장기요양: 건강보험료 기준
                  const rate = item.defaultValue || 12.81;
                  amount = Math.floor((healthInsuranceAmount * rate) / 100 / 10) * 10;
                } else if (item.id === "health-insurance") {
                  // 건강보험: 직원등록의 건강보험 보수월액 기준
                  amount = healthInsuranceAmount;
                                } else if (item.id === "national-pension") {
                  // 국민연금: 직원등록의 기준소득월액 기준
                  amount = item.defaultValue
                    ? Math.floor((nationalPensionBase * item.defaultValue) / 100 / 10) * 10
                    : 0;
                } else if (item.id === "employment-insurance") {
                  // 고용보험: 기존처럼 지급총액 기준 유지
                  amount = item.defaultValue
                    ? Math.floor((insuranceBase * item.defaultValue) / 100 / 10) * 10
                    : 0;
                } else if (item.calculationType === "percentage" && item.defaultValue) {
                  // 기타 비율 항목: insuranceBase 기준
                  amount = Math.floor((insuranceBase * item.defaultValue) / 100 / 10) * 10;
                } else if (item.calculationType === "fixed" && item.defaultValue) {
                  amount = item.defaultValue;
                }
                return { itemId: item.id, name: item.name, amount, type: "deduction" as const };
              });

              const totalDeductions = deductionItemsValues.reduce((sum, item) => sum + item.amount, 0);
              const netSalary = totalPayments - totalDeductions;

              return {
                organization_id: currentOrganization.id,
                employee_id: emp.id,
                actual_late_minutes: actualLateMinutes,
                actual_early_leave_minutes: actualEarlyLeaveMinutes,
                period_year: year,
                period_month: month,
                base_salary: baseSalary,
                total_payments: totalPayments,
                total_deductions: totalDeductions,
                net_salary: netSalary,
                payment_items: paymentItemsValues,
                deduction_items: deductionItemsValues,
                working_days: workedDays,
                overtime_hours: Math.round((meta.overtimeMinutes / 60) * 10) / 10,
                total_work_minutes: meta.totalWorkMinutes,
                regular_work_minutes: meta.regularMinutes,
                overtime_minutes: meta.overtimeMinutes,
                night_work_minutes: meta.nightMinutes,
                night_shift_minutes:
                  meta.shiftTier1Minutes + meta.shiftTier2Minutes + meta.shiftTier3Minutes + meta.shiftTier4Minutes,
                status: "draft",
                paid_at: null,
              };
            }

            // ========== 월급제: 기존 로직 유지 ==========
            const weeklyHolidayMap: Record<string, number> = {
              sun: 0,
              mon: 1,
              tue: 2,
              wed: 3,
              thu: 4,
              fri: 5,
              sat: 6,
            };
            const holidayDayOfWeek = weeklyHolidayMap[orgSettings.weekly_holiday] ?? 0;

            let totalRecognizedMinutes = 0;
            let totalRegularMinutes = 0;
            let totalOvertimeWorkMinutes = 0;
            let totalNightMinutes = 0;
            let totalNightWeightedMinutes = 0;
            let totalDayNightMinutes = 0;
            let totalNightShiftMinutes = 0;

            empAttendance.forEach((att) => {
              if (att.check_in && att.check_out) {
                const isNight = att.work_type === "night";
                const attDate = new Date(att.date + "T00:00:00");
                const dayOfWeek = attDate.getDay();
                const isHolidayWork = dayOfWeek === holidayDayOfWeek;

                const breakdown = calculateSingleAttendance(
                  att.check_in,
                  att.check_out,
                  att.date,
                  att.break_minutes ?? 0,
                  isNight,
                  orgSettings,
                  isHolidayWork,
                );
                totalRecognizedMinutes += breakdown.recognizedMinutes;
                totalRegularMinutes += breakdown.regularMinutes;
                totalOvertimeWorkMinutes += breakdown.overtimeWorkMinutes;

                if (isNight && breakdown.recognizedMinutes > 0) {
                  totalNightMinutes += breakdown.recognizedMinutes;
                  totalNightShiftMinutes += breakdown.recognizedMinutes;
                  const checkIn = new Date(att.check_in);
                  const checkOut = new Date(att.check_out);
                  const nightBreakdown = calculateNightTierMinutes(
                    checkIn,
                    checkOut,
                    tier1Start,
                    tier1End,
                    tier2Start,
                    tier2End,
                    tier3Start,
                    tier3End,
                  );
                  const totalNightRaw = nightBreakdown.tier1 + nightBreakdown.tier2 + nightBreakdown.tier3;
                  if (totalNightRaw > 0) {
                    const ratio = breakdown.recognizedMinutes / totalNightRaw;
                    totalNightWeightedMinutes +=
                      Math.round(nightBreakdown.tier1 * ratio * shiftTier1Multiplier) +
                      Math.round(nightBreakdown.tier2 * ratio * shiftTier2Multiplier) +
                      Math.round(nightBreakdown.tier3 * ratio * shiftTier3Multiplier);
                  }
                } else if (!isNight && breakdown.recognizedMinutes > 0) {
                  const dayWorkerNightMin = breakdown.nightWorkMinutes;
                  if (dayWorkerNightMin > 0) {
                    totalNightMinutes += dayWorkerNightMin;
                    totalDayNightMinutes += dayWorkerNightMin;
                    totalNightWeightedMinutes += Math.round(dayWorkerNightMin * orgSettings.night_shift_multiplier);
                  }
                }
              }
            });

            const totalWorkMinutes = totalRecognizedMinutes;
            let baseSalary = emp.base_salary;
            const overtimeMinutes = totalOvertimeWorkMinutes;
            const nightShiftAllowance = 0; // 월급제는 시급 기반 야간수당 없음

            // 직원별 오버라이드가 적용된 지급/공제 항목 조회
            const activePaymentItems = getEmployeePaymentItems(emp.id);
            const activeDeductionItems = getEmployeeDeductionItems(emp.id);

            // 동적 지급 항목 계산
            const paymentItemsValues = activePaymentItems.map((item) => {
              let amount = 0;
              if (item.id === "base-salary") {
                amount = baseSalary;
              } else if (item.id === "overtime") {
                amount = (item as any).overrideValue ?? (item as any).defaultValue ?? 0;
              } else if (item.id === "night-shift-allowance") {
                amount = (item as any).overrideValue ?? (item as any).defaultValue ?? 0;
              } else if (item.calculationType === "fixed" && item.defaultValue) {
                amount = item.defaultValue;
              } else if (item.calculationType === "percentage" && item.defaultValue) {
                amount = Math.round((baseSalary * item.defaultValue) / 100);
              } else if (item.calculationType === "manual") {
                // 수동입력 항목: overrideValue 우선, 없으면 defaultValue
                amount = (item as any).overrideValue ?? item.defaultValue ?? 0;
              }
              return { itemId: item.id, name: item.name, amount, type: "payment" as const };
            });

            const totalPayments = paymentItemsValues.reduce((sum, item) => sum + item.amount, 0);

            // ── 공제 기준 분리 (법적 기준) ──
            const totalPaymentsForDeduction = paymentItemsValues.reduce((sum, item) => sum + item.amount, 0);

            // exemptLimit 기반 비과세 항목 자동 계산 (소득세에서만 제외)
            const staticExemptAmountM = paymentItemsValues.reduce((sum, item) => {
              const payrollItem = activePaymentItems.find((p) => p.id === item.itemId);
              if (payrollItem?.exemptLimit && item.amount > 0) {
                return sum + Math.min(item.amount, payrollItem.exemptLimit);
              }
              return sum;
            }, 0);

            // 소득세 기준: 모든 비과세한도 항목 제외
            const taxBaseM = Math.max(0, totalPaymentsForDeduction - staticExemptAmountM);

            // 4대보험 산정 기준
// 국민연금/건강보험은 직원등록의 공단 고지 기준금액을 우선 사용
// 미입력 시 기존 방식(totalPaymentsForDeduction)으로 fallback
const insuranceBaseM = totalPaymentsForDeduction;

const nationalPensionBaseRawM =
  Number((emp as any).national_pension_monthly_income) || insuranceBaseM;

const healthInsuranceBaseM =
  Number((emp as any).health_insurance_monthly_income) || insuranceBaseM;

// 국민연금 기준소득월액 상·하한
// 2025.07~2026.06 기준: 400,000원 ~ 6,370,000원
const nationalPensionBaseM = Math.min(
  6_370_000,
  Math.max(400_000, nationalPensionBaseRawM),
);

// 건강보험료 먼저 계산 (장기요양보험 산출 기준)
const healthInsuranceItem = activeDeductionItems.find((i) => i.id === "health-insurance");
const healthInsuranceAmount = healthInsuranceItem?.defaultValue
  ? Math.floor((healthInsuranceBaseM * healthInsuranceItem.defaultValue) / 100 / 10) * 10
  : 0;

            // 간이세액표 소득세 계산
            const taxResultM = await calculateIncomeTax({
              taxBase: taxBaseM,
              dependents: (emp as any).dependents ?? 1,
              childrenAged8to20: (emp as any).children_aged_8_to_20 ?? 0,
            });
            let incomeTaxAmount = taxResultM.incomeTax;

            const deductionItemsValues = activeDeductionItems.map((item) => {
              let amount = 0;
              if (item.id === "income-tax") {
                // 소득세: 간이세액표 계산 결과
                amount = incomeTaxAmount;
              } else if (item.id === "local-income-tax") {
                // 지방소득세 = 소득세 × 10%
                amount = taxResultM.localIncomeTax;
              } else if (item.id === "long-term-care") {
                // 장기요양보험 = 건강보험료 기준
                const rate = item.defaultValue || 12.81;
                amount = Math.floor((healthInsuranceAmount * rate) / 100 / 10) * 10;
              } else if (item.id === "health-insurance") {
                // 건강보험: 직원등록의 건강보험 보수월액 기준
                amount = healthInsuranceAmount;
                            } else if (item.id === "national-pension") {
                // 국민연금: 직원등록의 기준소득월액 기준
                amount = item.defaultValue
                  ? Math.floor((nationalPensionBaseM * item.defaultValue) / 100 / 10) * 10
                  : 0;
              } else if (item.id === "employment-insurance") {
                // 고용보험: 기존처럼 지급총액 기준 유지
                amount = item.defaultValue
                  ? Math.floor((insuranceBaseM * item.defaultValue) / 100 / 10) * 10
                  : 0;
              } else if (item.calculationType === "percentage" && item.defaultValue) {
                // 기타 비율 항목: insuranceBaseM 기준
                amount = Math.floor((insuranceBaseM * item.defaultValue) / 100 / 10) * 10;
              } else if (item.calculationType === "fixed" && item.defaultValue) {
                amount = item.defaultValue;
              }
              return { itemId: item.id, name: item.name, amount, type: "deduction" as const };
            });

            // 지각/결근 공제 추가 (월급제만)
            if (emp.pay_type === "monthly") {
              const dailyRateForDeduction = Math.round(emp.base_salary / workDaysInMonth);
              const lateDeduction = Math.round(lateDays * dailyRateForDeduction * lateDeductionRate);
              const absentDeduction = Math.round(absentDays * dailyRateForDeduction * absentDeductionRate);

              if (lateDeduction > 0) {
                deductionItemsValues.push({
                  itemId: "late-deduction",
                  name: "지각공제",
                  amount: lateDeduction,
                  type: "deduction",
                });
              }
              if (absentDeduction > 0) {
                deductionItemsValues.push({
                  itemId: "absent-deduction",
                  name: "결근공제",
                  amount: absentDeduction,
                  type: "deduction",
                });
              }
            }

            const totalDeductions = deductionItemsValues.reduce((sum, item) => sum + item.amount, 0);
            const netSalary = totalPayments - totalDeductions;

            // 정규근무 분: 공통 근태 계산 엔진의 일자별 분류값을 그대로 사용
            const regularWorkMinutes = totalRegularMinutes;

            return {
              organization_id: currentOrganization.id,
              employee_id: emp.id,
              actual_late_minutes: actualLateMinutes,
              actual_early_leave_minutes: actualEarlyLeaveMinutes,
              period_year: year,
              period_month: month,
              base_salary: baseSalary,
              total_payments: totalPayments,
              total_deductions: totalDeductions,
              net_salary: netSalary,
              payment_items: paymentItemsValues,
              deduction_items: deductionItemsValues,
              working_days: workedDays,
              overtime_hours: Math.round((overtimeMinutes / 60) * 10) / 10,
              total_work_minutes: totalWorkMinutes,
              regular_work_minutes: totalRegularMinutes,
              overtime_minutes: overtimeMinutes,
              night_work_minutes: totalDayNightMinutes,
              night_shift_minutes: totalNightShiftMinutes,
              status: "draft",
              paid_at: null,
            };
          }),
        );

        // Supabase에 저장
        await createPayroll.mutateAsync(payrollRecords);

        queryClient.invalidateQueries({
          queryKey: ["production_tax_exempt_records", currentOrganization.id, year],
        });

        queryClient.invalidateQueries({
          queryKey: ["payroll_records", currentOrganization.id, year, month],
        });

        return payrollRecords;
      } catch (error) {
        console.error("Error calculating payroll:", error);
        toast.error("급여 계산 중 오류가 발생했습니다");
        throw error;
      }
    },
    [
      currentOrganization?.id,
      employees,
      year,
      month,
      createPayroll,
      queryClient,
      getEmployeePaymentItems,
      getEmployeeDeductionItems,
      orgSettings,
      getEffectiveCarryDaysBatch,
    ],
  );

  return { calculatePayroll };
}

// calculateNightTierMinutes는 useDailyWageSnapshots에서 가져옴
