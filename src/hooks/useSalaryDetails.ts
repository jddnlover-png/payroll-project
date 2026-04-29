/**
 * salary_details CRUD 및 계산 연동 훅
 * 월급제 직원 제외, 시급/일급제 직원 대상
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { useEmployees } from "@/hooks/useEmployees";
import { useWeeklyHolidayCarry } from "@/hooks/useWeeklyHolidayCarry";
import { toast } from "sonner";
import { calculateSalaryDetail, SalaryDetailResult, AttendanceRawRecord } from "@/utils/salaryDetailCalculation";

export interface SalaryDetailRow {
  id: string;
  organization_id: string;
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
  is_tax_exempt: boolean;
  tax_exempt_amount: number;
  site_id: string | null;
}

export function useSalaryDetails(year: number, month: number) {
  const { currentOrganization } = useOrganization();
  const { settings } = useOrganizationSettings();
  const { employees } = useEmployees();
  const { getEffectiveCarryDaysBatch } = useWeeklyHolidayCarry();
  const queryClient = useQueryClient();
  const yearMonth = `${year}-${String(month).padStart(2, "0")}`;

  // 기존 salary_details 조회
  const { data: salaryDetails = [], isLoading } = useQuery({
    queryKey: ["salary-details", currentOrganization?.id, yearMonth],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("salary_details")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .eq("pay_year_month", yearMonth);
      if (error) throw error;
      return (data || []) as SalaryDetailRow[];
    },
    enabled: !!currentOrganization?.id,
  });

  // 전체 직원 salary_details 일괄 계산 및 저장
  const calculateAll = useMutation({
    mutationFn: async (employeeIds?: string[]) => {
      if (!currentOrganization?.id) throw new Error("조직을 선택해주세요");

      // 비월급제 직원만 필터
      const targetEmployees = employees
        .filter((e) => e.is_active && e.pay_type !== "monthly")
        .filter((e) => !employeeIds || employeeIds.includes(e.id));

      if (targetEmployees.length === 0) {
        toast.info("계산 대상 직원이 없습니다 (시급/일급제만 대상)");
        return [];
      }

      // 해당 월 + 직전 4주 근태 조회 (주휴수당 판별용 — 월초 주의 전체 데이터 확보)
      const priorStart = new Date(year, month - 1, 1);
      priorStart.setDate(priorStart.getDate() - 28); // 4주 전
      const endDate = new Date(year, month, 0); // 해당월 말일
      const startStr = `${priorStart.getFullYear()}-${String(priorStart.getMonth() + 1).padStart(2, "0")}-${String(priorStart.getDate()).padStart(2, "0")}`;
      const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

      const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const monthEnd = endStr;

      const { data: allAttData, error: attErr } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .gte("date", startStr)
        .lte("date", endStr);

      if (attErr) throw attErr;

      const { data: holidayRows, error: holidayErr } = await (supabase as any)
        .from("public_holidays")
        .select("holiday_date")
        .eq("is_holiday", true)
        .gte("holiday_date", startStr)
        .lte("holiday_date", endStr);

      if (holidayErr) throw holidayErr;

      const publicHolidayDates = new Set<string>(
        ((holidayRows || []) as { holiday_date: string }[]).map((h) => h.holiday_date),
      );

      const allAttendance: AttendanceRawRecord[] = (allAttData || []).map((a: any) => ({
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

      const results: SalaryDetailResult[] = [];

      // 이월 데이터 일괄 조회
      const carryEmpIds = targetEmployees.map((e) => e.id);
      const carryMap = await getEffectiveCarryDaysBatch(carryEmpIds, year, month);

      for (const emp of targetEmployees) {
        const empMonthAtt = allAttendance.filter(
          (a) => a.employee_id === emp.id && a.date >= monthStart && a.date <= monthEnd,
        );

        const prevCarryDays = carryMap.get(emp.id) || 0;
        const result = calculateSalaryDetail(
          emp,
          empMonthAtt,
          allAttendance,
          settings,
          yearMonth,
          prevCarryDays,
          publicHolidayDates,
        );
        results.push(result);
      }

      // Upsert to DB
      const records = results.map((r) => ({
        organization_id: currentOrganization.id,
        employee_id: r.employee_id,
        pay_year_month: r.pay_year_month,
        regular_pay: r.regular_pay,
        overtime_pay: r.overtime_pay,
        night_pay: r.night_pay,
        shift_pay_1: r.shift_pay_1,
        shift_pay_2: r.shift_pay_2,
        shift_pay_3: r.shift_pay_3,
        shift_pay_4: r.shift_pay_4,
        holiday_work_pay: r.holiday_work_pay,
        holiday_work_overtime_pay: r.holiday_work_overtime_pay,
        public_holiday_pay: r.public_holiday_pay,
        public_holiday_work_pay: r.public_holiday_work_pay,
        weekly_holiday_pay: r.weekly_holiday_pay,
        hol_shift_t1_pay: r.hol_shift_t1_pay,
        hol_shift_t2_pay: r.hol_shift_t2_pay,
        hol_shift_t3_pay: r.hol_shift_t3_pay,
        hol_shift_t4_pay: r.hol_shift_t4_pay,
        is_tax_exempt: r.is_tax_exempt,
        tax_exempt_amount: r.tax_exempt_amount,
      }));

      // Delete existing then insert (simpler than upsert with composite key)
      const empIds = records.map((r) => r.employee_id);
      await supabase
        .from("salary_details")
        .delete()
        .eq("organization_id", currentOrganization.id)
        .eq("pay_year_month", yearMonth)
        .in("employee_id", empIds);

      if (records.length > 0) {
        const { error: insertErr } = await supabase.from("salary_details").insert(records);
        if (insertErr) throw insertErr;
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["salary-details", currentOrganization?.id, yearMonth] });
      if (results && results.length > 0) {
        toast.success(`${results.length}명의 급여 상세 내역이 계산되었습니다`);
      }
    },
    onError: (error) => {
      console.error("Salary detail calculation error:", error);
      toast.error("급여 상세 계산 중 오류가 발생했습니다");
    },
  });

  const getDetailByEmployee = (employeeId: string): SalaryDetailRow | undefined => {
    return salaryDetails.find((d) => d.employee_id === employeeId);
  };

  return {
    salaryDetails,
    isLoading,
    calculateAll,
    getDetailByEmployee,
    yearMonth,
  };
}
