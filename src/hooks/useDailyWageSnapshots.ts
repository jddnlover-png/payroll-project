import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrganizationSettings, OrganizationSettings } from '@/hooks/useOrganizationSettings';
import { Employee } from '@/hooks/useEmployees';
import { calculateSingleAttendance, WorkHoursBreakdown, getKSTMinutes } from '@/utils/attendanceCalculation';
import { calculate4TierNightShift } from '@/utils/salaryDetailCalculation';

export interface DailyWageSnapshot {
  id: string;
  organization_id: string;
  employee_id: string;
  attendance_record_id: string | null;
  work_date: string;
  hourly_rate: number;
  daily_rate: number;
  pay_type: string;
  overtime_multiplier: number;
  night_shift_multiplier: number;
  standard_work_hours: number;
  regular_minutes: number;
  overtime_minutes: number;
  night_minutes: number;
  night_shift_minutes: number;
  base_wage: number;
  overtime_pay: number;
  night_pay: number;
  total_wage: number;
  tier1_minutes: number;
  tier2_minutes: number;
  tier3_minutes: number;
  tier4_minutes: number;
  tier1_pay: number;
  tier2_pay: number;
  tier3_pay: number;
  tier4_pay: number;
  tier1_multiplier: number;
  tier2_multiplier: number;
  tier3_multiplier: number;
  tier4_multiplier: number;
  tier1_break_minutes: number;
  tier2_break_minutes: number;
  tier3_break_minutes: number;
  tier4_break_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface DailyWageBreakdown {
  hourlyRate: number;
  dailyRate: number;
  payType: string;
  overtimeMultiplier: number;
  nightMultiplier: number;
  standardWorkHours: number;
  regularMinutes: number;
  overtimeMinutes: number;
  nightMinutes: number;
  nightShiftMinutes: number;
  baseWage: number;
  overtimePay: number;
  nightPay: number;
  totalWage: number;
  tier1Minutes: number;
  tier2Minutes: number;
  tier3Minutes: number;
  tier4Minutes: number;
  tier1Pay: number;
  tier2Pay: number;
  tier3Pay: number;
  tier4Pay: number;
  tier1Multiplier: number;
  tier2Multiplier: number;
  tier3Multiplier: number;
  tier4Multiplier: number;
  tier1BreakMinutes: number;
  tier2BreakMinutes: number;
  tier3BreakMinutes: number;
  tier4BreakMinutes: number;
}

/**
 * 야간 교대근무 시간을 시간대(Tier)별로 분 단위로 분배 (레거시 3단계)
 * 자정을 넘는 야간 근무 처리 포함
 */
export function calculateNightTierMinutes(
  checkIn: Date,
  checkOut: Date,
  tier1Start: number, tier1End: number,
  tier2Start: number, tier2End: number,
  tier3Start: number, tier3End: number,
): { tier1: number; tier2: number; tier3: number } {
  const ciMin = getKSTMinutes(checkIn);
  const coMin = getKSTMinutes(checkOut);

  let workMinutes: number[] = [];
  if (ciMin <= coMin) {
    for (let m = ciMin; m < coMin; m++) workMinutes.push(m % 1440);
  } else {
    for (let m = ciMin; m < 1440; m++) workMinutes.push(m);
    for (let m = 0; m < coMin; m++) workMinutes.push(m);
  }

  const isInTier = (minute: number, start: number, end: number) => {
    if (start <= end) {
      return minute >= start && minute < end;
    } else {
      return minute >= start || minute < end;
    }
  };

  let tier1 = 0, tier2 = 0, tier3 = 0;
  workMinutes.forEach(m => {
    if (isInTier(m, tier2Start, tier2End)) tier2++;
    else if (isInTier(m, tier3Start, tier3End)) tier3++;
    else if (isInTier(m, tier1Start, tier1End)) tier1++;
  });

  return { tier1, tier2, tier3 };
}

/**
 * 시급/일급제 사원의 일일 급여 계산
 * 야간교대근무자: 4단계 차등 배율 적용
 * 주간근무자: 단일 야간 배율 적용
 */
export function calculateDailyWage(
  employee: Employee,
  breakdown: WorkHoursBreakdown,
  settings: OrganizationSettings,
  rawCheckIn?: string,
  rawCheckOut?: string,
): DailyWageBreakdown {
  const payType = employee.pay_type;
  const hourlyRate = employee.hourly_rate || 0;
  const dailyRate = employee.daily_rate || 0;
  const overtimeMultiplier = settings.overtime_multiplier;
  const nightMultiplier = settings.night_shift_multiplier;

  const tier1Multiplier = settings.shift_tier1_multiplier;
  const tier2Multiplier = settings.shift_tier2_multiplier;
  const tier3Multiplier = settings.shift_tier3_multiplier;
  const tier4Multiplier = settings.shift_tier4_multiplier || 1.5;

  let effectiveHourlyRate = 0;
  let baseWage = 0;
  let overtimePay = 0;
  let nightPay = 0;
  let tier1Minutes = 0, tier2Minutes = 0, tier3Minutes = 0, tier4Minutes = 0;
  let tier1Pay = 0, tier2Pay = 0, tier3Pay = 0, tier4Pay = 0;

  if (payType === 'hourly') {
    effectiveHourlyRate = hourlyRate;
    baseWage = Math.round(hourlyRate * (breakdown.regularMinutes / 60));
    overtimePay = Math.round(hourlyRate * overtimeMultiplier * (breakdown.overtimeWorkMinutes / 60));
  } else if (payType === 'daily') {
    effectiveHourlyRate = dailyRate / (settings.standard_work_hours || 8);
    baseWage = dailyRate;
    overtimePay = Math.round(effectiveHourlyRate * overtimeMultiplier * (breakdown.overtimeWorkMinutes / 60));
  }

  const isNightShift = breakdown.nightShiftWorkMinutes > 0;

  const tier1BreakMin = settings.shift_tier1_break_minutes || 0;
  const tier2BreakMin = settings.shift_tier2_break_minutes || 0;
  const tier3BreakMin = settings.shift_tier3_break_minutes || 0;
  const tier4BreakMin = settings.shift_tier4_break_minutes || 0;

  if (isNightShift && rawCheckIn && rawCheckOut) {
    // 야간교대근무자: 4단계 자동 계산
    const checkInDate = new Date(rawCheckIn);
    const checkOutDate = new Date(rawCheckOut);

    const t4 = calculate4TierNightShift(checkInDate, checkOutDate, settings);
    tier1Minutes = t4.tier1Minutes;
    tier2Minutes = t4.tier2Minutes;
    tier3Minutes = t4.tier3Minutes;
    tier4Minutes = t4.tier4Minutes;

    if (tier1Minutes > 0) {
      tier1Pay = Math.round(effectiveHourlyRate * tier1Multiplier * (tier1Minutes / 60));
    }
    if (tier2Minutes > 0) {
      tier2Pay = Math.round(effectiveHourlyRate * tier2Multiplier * (tier2Minutes / 60));
    }
    if (tier3Minutes > 0) {
      tier3Pay = Math.round(effectiveHourlyRate * tier3Multiplier * (tier3Minutes / 60));
    }
    if (tier4Minutes > 0) {
      tier4Pay = Math.round(effectiveHourlyRate * tier4Multiplier * (tier4Minutes / 60));
    }

    nightPay = tier1Pay + tier2Pay + tier3Pay + tier4Pay;
  } else if (breakdown.nightWorkMinutes > 0) {
    nightPay = Math.round(effectiveHourlyRate * nightMultiplier * (breakdown.nightWorkMinutes / 60));
  }

  const totalWage = baseWage + overtimePay + nightPay;

  return {
    hourlyRate,
    dailyRate,
    payType,
    overtimeMultiplier,
    nightMultiplier,
    standardWorkHours: settings.standard_work_hours,
    regularMinutes: breakdown.regularMinutes,
    overtimeMinutes: breakdown.overtimeWorkMinutes,
    nightMinutes: isNightShift ? 0 : breakdown.nightWorkMinutes,
    nightShiftMinutes: isNightShift ? (tier1Minutes + tier2Minutes + tier3Minutes + tier4Minutes) : breakdown.nightShiftWorkMinutes,
    baseWage,
    overtimePay,
    nightPay,
    totalWage,
    tier1Minutes,
    tier2Minutes,
    tier3Minutes,
    tier4Minutes,
    tier1Pay,
    tier2Pay,
    tier3Pay,
    tier4Pay,
    tier1Multiplier,
    tier2Multiplier,
    tier3Multiplier,
    tier4Multiplier,
    tier1BreakMinutes: isNightShift ? tier1BreakMin : 0,
    tier2BreakMinutes: isNightShift ? tier2BreakMin : 0,
    tier3BreakMinutes: isNightShift ? tier3BreakMin : 0,
    tier4BreakMinutes: isNightShift ? tier4BreakMin : 0,
  };
}

export function useDailyWageSnapshots(date: string) {
  const { currentOrganization } = useOrganization();
  const { settings } = useOrganizationSettings();
  const queryClient = useQueryClient();

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ['daily-wage-snapshots', currentOrganization?.id, date],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('daily_wage_snapshots' as any)
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('work_date', date);
      if (error) throw error;
      return (data || []) as unknown as DailyWageSnapshot[];
    },
    enabled: !!currentOrganization?.id,
  });

  const upsertSnapshot = useMutation({
    mutationFn: async ({
      employee,
      attendanceRecordId,
      breakdown,
      rawCheckIn,
      rawCheckOut,
    }: {
      employee: Employee;
      attendanceRecordId: string | null;
      breakdown: WorkHoursBreakdown;
      rawCheckIn?: string;
      rawCheckOut?: string;
    }) => {
      if (!currentOrganization?.id) throw new Error('No org');
      const wage = calculateDailyWage(employee, breakdown, settings, rawCheckIn, rawCheckOut);

      const record = {
        organization_id: currentOrganization.id,
        employee_id: employee.id,
        attendance_record_id: attendanceRecordId,
        work_date: date,
        hourly_rate: wage.hourlyRate,
        daily_rate: wage.dailyRate,
        pay_type: wage.payType,
        overtime_multiplier: wage.overtimeMultiplier,
        night_shift_multiplier: wage.nightMultiplier,
        standard_work_hours: wage.standardWorkHours,
        regular_minutes: wage.regularMinutes,
        overtime_minutes: wage.overtimeMinutes,
        night_minutes: wage.nightMinutes,
        night_shift_minutes: wage.nightShiftMinutes,
        base_wage: wage.baseWage,
        overtime_pay: wage.overtimePay,
        night_pay: wage.nightPay,
        total_wage: wage.totalWage,
        tier1_minutes: wage.tier1Minutes,
        tier2_minutes: wage.tier2Minutes,
        tier3_minutes: wage.tier3Minutes,
        tier4_minutes: wage.tier4Minutes,
        tier1_pay: wage.tier1Pay,
        tier2_pay: wage.tier2Pay,
        tier3_pay: wage.tier3Pay,
        tier4_pay: wage.tier4Pay,
        tier1_multiplier: wage.tier1Multiplier,
        tier2_multiplier: wage.tier2Multiplier,
        tier3_multiplier: wage.tier3Multiplier,
        tier4_multiplier: wage.tier4Multiplier,
        tier1_break_minutes: wage.tier1BreakMinutes,
        tier2_break_minutes: wage.tier2BreakMinutes,
        tier3_break_minutes: wage.tier3BreakMinutes,
        tier4_break_minutes: wage.tier4BreakMinutes,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('daily_wage_snapshots' as any)
        .upsert(record as any, {
          onConflict: 'organization_id,employee_id,work_date',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-wage-snapshots', currentOrganization?.id, date] });
    },
  });

  const calculateAndSave = async (
    employee: Employee,
    rawCheckIn: string,
    rawCheckOut: string,
    breakMinutes: number,
    isNight: boolean,
    attendanceRecordId: string | null
  ) => {
    if (employee.pay_type === 'monthly') return null;

    const breakdown = calculateSingleAttendance(
      rawCheckIn, rawCheckOut, date, breakMinutes, isNight, settings
    );

    return upsertSnapshot.mutateAsync({
      employee,
      attendanceRecordId,
      breakdown,
      rawCheckIn,
      rawCheckOut,
    });
  };

  const batchCalculateAndSave = async (
    records: Array<{
      employee: Employee;
      rawCheckIn: string;
      rawCheckOut: string;
      breakMinutes: number;
      isNight: boolean;
      attendanceRecordId: string | null;
    }>
  ) => {
    const promises = records
      .filter(r => r.employee.pay_type !== 'monthly')
      .map(r => calculateAndSave(
        r.employee, r.rawCheckIn, r.rawCheckOut, r.breakMinutes, r.isNight, r.attendanceRecordId
      ));
    await Promise.all(promises);
  };

  const getSnapshotByEmployee = (employeeId: string): DailyWageSnapshot | undefined => {
    return snapshots.find(s => s.employee_id === employeeId);
  };

  return {
    snapshots,
    isLoading,
    calculateAndSave,
    batchCalculateAndSave,
    getSnapshotByEmployee,
    upsertSnapshot,
  };
}
