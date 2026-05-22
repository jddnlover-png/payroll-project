/**
 * 주휴수당 이월 데이터 관리 훅
 */
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';

export function useWeeklyHolidayCarry() {
  const { currentOrganization } = useOrganization();

  /**
   * 특정 직원의 이전 달 유효 이월일수 조회
   * 우선순위: 1) 전달 확정 저장값 → 2) 직원 수동 초기값 → 3) 회사 도입 기준월 → 4) 0
   */
  const getEffectiveCarryDays = useCallback(async (
    employeeId: string,
    year: number,
    month: number,
  ): Promise<number> => {
    if (!currentOrganization?.id) return 0;

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    // 1순위: 전달 급여 확정 시 자동 저장된 값
    const { data: autoCarry } = await supabase
      .from('weekly_holiday_carry')
      .select('carry_days')
      .eq('organization_id', currentOrganization.id)
      .eq('employee_id', employeeId)
      .eq('year', prevYear)
      .eq('month', prevMonth)
      .maybeSingle();

    if (autoCarry) return autoCarry.carry_days;

    // 2순위: 직원 수동 초기값
const { data: employee } = await supabase
  .from('employees')
  .select('initial_carry_weeks, initial_carry_month')
  .eq('id', employeeId)
  .eq('organization_id', currentOrganization.id)
  .maybeSingle();

const initialCarryMonth = (employee as any)?.initial_carry_month as string | null;
const initialCarryWeeks = Number((employee as any)?.initial_carry_weeks ?? 0);

if (initialCarryMonth === prevMonthStr && initialCarryWeeks > 0) {
  return initialCarryWeeks;
}

// 3순위: 회사 전체 도입 기준월 설정
const { data: orgSettings } = await supabase
  .from('organization_settings')
  .select('payroll_start_month')
  .eq('organization_id', currentOrganization.id)
  .maybeSingle();

const companyStartMonth = (orgSettings as any)?.payroll_start_month as string | null;

// 예: 계산월 2026-04, 전달 2026-03, 도입월 2026-03이면 첫 주 보정 발생
if (companyStartMonth && prevMonthStr === companyStartMonth) {
  return 1;
}

// 4순위: 없으면 0
return 0;
  }, [currentOrganization?.id]);

  /**
   * 여러 직원의 이월일수 일괄 조회
   */
  const getEffectiveCarryDaysBatch = useCallback(async (
    employeeIds: string[],
    year: number,
    month: number,
  ): Promise<Map<string, number>> => {
    if (!currentOrganization?.id || employeeIds.length === 0) return new Map();

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    const result = new Map<string, number>();

    // 1순위: 전달 확정 저장값 일괄 조회
    const { data: autoCarries } = await supabase
      .from('weekly_holiday_carry')
      .select('employee_id, carry_days')
      .eq('organization_id', currentOrganization.id)
      .eq('year', prevYear)
      .eq('month', prevMonth)
      .in('employee_id', employeeIds);

    if (autoCarries) {
      autoCarries.forEach(c => result.set(c.employee_id, c.carry_days));
    }

    // 아직 값이 없는 직원들 → 직원 수동 초기값 확인
let remainingIds = employeeIds.filter(id => !result.has(id));
const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

if (remainingIds.length > 0) {
  const { data: employees } = await supabase
    .from('employees')
    .select('id, initial_carry_weeks, initial_carry_month')
    .eq('organization_id', currentOrganization.id)
    .in('id', remainingIds);

  employees?.forEach((employee: any) => {
    const initialCarryMonth = employee.initial_carry_month as string | null;
    const initialCarryWeeks = Number(employee.initial_carry_weeks ?? 0);

    if (initialCarryMonth === prevMonthStr && initialCarryWeeks > 0) {
      result.set(employee.id, initialCarryWeeks);
    }
  });
}

// 그래도 값이 없는 직원들 → 회사 도입 기준월 확인
remainingIds = employeeIds.filter(id => !result.has(id));

if (remainingIds.length > 0) {
  const { data: orgSettings } = await supabase
    .from('organization_settings')
    .select('payroll_start_month')
    .eq('organization_id', currentOrganization.id)
    .maybeSingle();

  const companyStartMonth = (orgSettings as any)?.payroll_start_month as string | null;

  remainingIds.forEach(id => {
    if (companyStartMonth && prevMonthStr === companyStartMonth) {
      result.set(id, 1);
    } else {
      result.set(id, 0);
    }
  });
}

    // 나머지 0
    employeeIds.forEach(id => {
      if (!result.has(id)) result.set(id, 0);
    });

    return result;
  }, [currentOrganization?.id]);

  /**
   * 급여 확정 시 이월값 저장 (upsert)
   */
  const saveCarryDays = useCallback(async (
    employeeId: string,
    year: number,
    month: number,
    carryDays: number,
  ) => {
    if (!currentOrganization?.id) return;

    const { error } = await supabase
      .from('weekly_holiday_carry')
      .upsert({
        organization_id: currentOrganization.id,
        employee_id: employeeId,
        year,
        month,
        carry_days: carryDays,
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,employee_id,year,month' });

    if (error) console.error('Failed to save carry days:', error);
  }, [currentOrganization?.id]);

  /**
   * 급여 확정 취소 시 이월값 삭제
   */
  const deleteCarryDays = useCallback(async (
    employeeId: string,
    year: number,
    month: number,
  ) => {
    if (!currentOrganization?.id) return;

    await supabase
      .from('weekly_holiday_carry')
      .delete()
      .eq('organization_id', currentOrganization.id)
      .eq('employee_id', employeeId)
      .eq('year', year)
      .eq('month', month);
  }, [currentOrganization?.id]);

  /**
   * 여러 직원 이월값 일괄 삭제
   */
  const deleteCarryDaysBatch = useCallback(async (
    employeeIds: string[],
    year: number,
    month: number,
  ) => {
    if (!currentOrganization?.id || employeeIds.length === 0) return;

    await supabase
      .from('weekly_holiday_carry')
      .delete()
      .eq('organization_id', currentOrganization.id)
      .eq('year', year)
      .eq('month', month)
      .in('employee_id', employeeIds);
  }, [currentOrganization?.id]);

  return {
    getEffectiveCarryDays,
    getEffectiveCarryDaysBatch,
    saveCarryDays,
    deleteCarryDays,
    deleteCarryDaysBatch,
  };
}
