import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { toast } from 'sonner';
import { format } from 'date-fns';

export type ShiftType = 'day' | 'night';

export interface AttendanceRecord {
  id: string;
  organization_id: string;
  employee_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: 'present' | 'late' | 'absent' | 'leave' | 'half_day';
  overtime_hours: number;
  break_minutes: number | null;
  notes: string | null;
  work_type: ShiftType | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  employee?: {
    name: string;
    employee_number: string;
    department: string | null;
  };
}

/**
 * 출근 시간을 기준으로 주간조/야간조를 판별합니다.
 * - 주간조: work_start_time 기준 ±5시간 (기본 04:00 ~ 14:00)
 * - 야간조: shift_tier1_start 기준 ±4시간 (기본 14:00 ~ 22:00 이후)
 */
export function detectShiftType(
  checkInTime: Date,
  workStartTime: string,
  _shiftTier1Start: string
): ShiftType {
  const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();

  // 주간 기준 시간 파싱: work_start_time ±5시간
  const [dayH, dayM] = workStartTime.split(':').map(Number);
  const dayCenter = dayH * 60 + dayM;
  const dayStart = dayCenter - 5 * 60; // 기본 04:00 (09:00 - 5h)
  const dayEnd = dayCenter + 5 * 60;   // 기본 14:00 (09:00 + 5h)

  // 자정 경계 처리
  const adjustedCheckIn = checkInMinutes < 0 ? checkInMinutes + 1440 : checkInMinutes;

  // 주간조 범위(04:00~14:00)에 해당하면 주간조, 그 외는 야간조
  if (adjustedCheckIn >= dayStart && adjustedCheckIn < dayEnd) {
    return 'day';
  }

  return 'night';
}

/**
 * 시프트에 따라 출근시간을 보정합니다.
 * - 주간조: 정규 출근시간으로 보정 (조기 출근 시)
 * - 야간조: 1단계 시작시간으로 보정 (조기 출근 시)
 */
function getRoundedCheckInTime(
  checkInTime: Date,
  shiftType: ShiftType,
  workStartTime: string,
  shiftTier1Start: string
): Date {
  const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();

  if (shiftType === 'day') {
    const [h, m] = workStartTime.split(':').map(Number);
    const startMinutes = h * 60 + m;
    if (checkInMinutes < startMinutes) {
      const rounded = new Date(checkInTime);
      rounded.setHours(h, m, 0, 0);
      return rounded;
    }
  } else {
    const [h, m] = shiftTier1Start.split(':').map(Number);
    const startMinutes = h * 60 + m;
    if (checkInMinutes < startMinutes) {
      const rounded = new Date(checkInTime);
      rounded.setHours(h, m, 0, 0);
      return rounded;
    }
  }

  return checkInTime;
}

export function useAttendance(date?: string) {
  const { currentOrganization } = useOrganization();
  const { settings } = useOrganizationSettings();
  const queryClient = useQueryClient();
  const targetDate = date || format(new Date(), 'yyyy-MM-dd');

  const { data: attendance = [], isLoading, error } = useQuery({
    queryKey: ['attendance', currentOrganization?.id, targetDate],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from('attendance_records')
        .select(`
          *,
          employee:employees(name, employee_number, department)
        `)
        .eq('organization_id', currentOrganization.id)
        .eq('date', targetDate)
        .order('created_at');

      if (error) throw error;
      return data as AttendanceRecord[];
    },
    enabled: !!currentOrganization?.id,
  });

  const checkIn = useMutation({
    mutationFn: async (employeeId: string) => {
      if (!currentOrganization?.id) throw new Error('No organization selected');

      const now = new Date();
      const checkInTime = now.toISOString();
      
      // 시프트 자동 판별
      const shiftType = detectShiftType(now, settings.work_start_time, settings.shift_tier1_start);
      
      // 시프트에 따른 지각 판정
      let isLate = false;
      if (shiftType === 'day') {
        const [startH, startM] = settings.work_start_time.split(':').map(Number);
        const workStartMinutes = startH * 60 + startM;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        isLate = nowMinutes > workStartMinutes + settings.late_threshold;
      } else {
        // 야간조: 1단계 시작시간 기준으로 지각 판정
        const [startH, startM] = settings.shift_tier1_start.split(':').map(Number);
        const shiftStartMinutes = startH * 60 + startM;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        isLate = nowMinutes > shiftStartMinutes + settings.late_threshold;
      }

      // 출근시간은 실제 클릭 시간을 그대로 기록
      const finalCheckInTime = checkInTime;

      // Try to update existing record or insert new one
      const { data: existing } = await supabase
        .from('attendance_records')
        .select('id')
        .eq('employee_id', employeeId)
        .eq('date', targetDate)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from('attendance_records')
          .update({
            check_in: finalCheckInTime,
            status: isLate ? 'late' : 'present',
            work_type: shiftType,
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('attendance_records')
          .insert({
            organization_id: currentOrganization.id,
            employee_id: employeeId,
            date: targetDate,
            check_in: finalCheckInTime,
            status: isLate ? 'late' : 'present',
            work_type: shiftType,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance', currentOrganization?.id] });
      toast.success('출근 처리되었습니다');
    },
    onError: (error) => {
      console.error('Error checking in:', error);
      toast.error('출근 처리 중 오류가 발생했습니다');
    },
  });

  const checkOut = useMutation({
    mutationFn: async (employeeId: string) => {
      const now = new Date();
      const checkOutTime = now.toISOString();

      const { data: existing } = await supabase
        .from('attendance_records')
        .select('id, check_in, work_type')
        .eq('employee_id', employeeId)
        .eq('date', targetDate)
        .maybeSingle();

      if (!existing) {
        throw new Error('출근 기록이 없습니다');
      }

      const shiftType = (existing.work_type as ShiftType) || 'day';

      // Calculate overtime based on shift type
      let overtimeHours = 0;
      if (existing.check_in) {
        const checkInDate = new Date(existing.check_in);

        if (shiftType === 'day') {
          // 주간조: 실제 출근시간과 정규 출근시간 중 늦은 시간을 기준으로 계산
          const [startH, startM] = settings.work_start_time.split(':').map(Number);
          const dayStart = new Date(checkInDate);
          dayStart.setHours(startH, startM, 0, 0);
          const effectiveStart = checkInDate > dayStart ? checkInDate : dayStart;

          const totalMinutes = (now.getTime() - effectiveStart.getTime()) / (1000 * 60);
          const standardMinutes = settings.standard_work_hours * 60;
          const [endH, endM] = settings.work_end_time.split(':').map(Number);
          const workEndMinutes = endH * 60 + endM;
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          
          if (nowMinutes <= workEndMinutes + settings.checkout_threshold) {
            overtimeHours = 0;
          } else if (totalMinutes > standardMinutes) {
            overtimeHours = Math.round((totalMinutes - standardMinutes) / 60 * 10) / 10;
          }
        } else {
          // 야간조: 실제 출근시간과 1단계 시작시간 중 늦은 시간을 기준으로 계산
          const [t1sH, t1sM] = settings.shift_tier1_start.split(':').map(Number);
          const shiftStart = new Date(checkInDate);
          shiftStart.setHours(t1sH, t1sM, 0, 0);
          // 출근이 야간조 시작보다 이르면 야간조 시작시간 기준으로 근무시간 산출
          const effectiveStart = checkInDate > shiftStart ? checkInDate : shiftStart;

          const totalMinutes = (now.getTime() - effectiveStart.getTime()) / (1000 * 60);

          const [t3eH, t3eM] = settings.shift_tier3_end.split(':').map(Number);
          let shiftDuration = (t3eH * 60 + t3eM) - (t1sH * 60 + t1sM);
          if (shiftDuration <= 0) shiftDuration += 1440; // 자정 경계 처리
          
          // 야간 교대근무 휴게시간 차감
          const netShiftMinutes = shiftDuration - settings.shift_break_minutes;
          
          if (totalMinutes > netShiftMinutes) {
            overtimeHours = Math.round((totalMinutes - netShiftMinutes) / 60 * 10) / 10;
          }
        }
      }

      // 시프트에 따른 휴게시간 계산
      let breakMinutes = 0;
      if (shiftType === 'day') {
        const [bsH, bsM] = settings.break_start_time.split(':').map(Number);
        const [beH, beM] = settings.break_end_time.split(':').map(Number);
        breakMinutes = (beH * 60 + beM) - (bsH * 60 + bsM);
      } else {
        breakMinutes = settings.shift_break_minutes || 0;
      }
      if (breakMinutes < 0) breakMinutes = 0;

      const { data, error } = await supabase
        .from('attendance_records')
        .update({
          check_out: checkOutTime,
          overtime_hours: overtimeHours,
          break_minutes: breakMinutes,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance', currentOrganization?.id] });
      toast.success('퇴근 처리되었습니다');
    },
    onError: (error: any) => {
      console.error('Error checking out:', error);
      toast.error(error.message || '퇴근 처리 중 오류가 발생했습니다');
    },
  });

  const updateAttendance = useMutation({
    mutationFn: async ({ 
      id, 
      ...updates 
    }: { 
      id: string; 
      status?: 'present' | 'late' | 'absent' | 'leave' | 'half_day';
      notes?: string;
      work_type?: ShiftType;
    }) => {
      const { data, error } = await supabase
        .from('attendance_records')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance', currentOrganization?.id] });
      toast.success('근태 기록이 수정되었습니다');
    },
    onError: (error) => {
      console.error('Error updating attendance:', error);
      toast.error('근태 기록 수정 중 오류가 발생했습니다');
    },
  });

  // 미기록 직원 일괄 상태 변경
  const bulkUpdateStatus = useMutation({
    mutationFn: async ({ 
      employeeIds, 
      status 
    }: { 
      employeeIds: string[]; 
      status: 'absent' | 'leave' | 'half_day';
    }) => {
      if (!currentOrganization?.id) throw new Error('No organization selected');
      if (employeeIds.length === 0) throw new Error('선택된 직원이 없습니다');

      const records = employeeIds.map(employeeId => ({
        organization_id: currentOrganization.id,
        employee_id: employeeId,
        date: targetDate,
        status,
      }));

      const { data, error } = await supabase
        .from('attendance_records')
        .upsert(records, { 
          onConflict: 'organization_id,employee_id,date',
          ignoreDuplicates: false 
        })
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['attendance', currentOrganization?.id] });
      const statusLabel = variables.status === 'absent' ? '결근' : variables.status === 'leave' ? '휴가' : '반차';
      toast.success(`${variables.employeeIds.length}명이 ${statusLabel} 처리되었습니다`);
    },
    onError: (error: any) => {
      console.error('Error bulk updating status:', error);
      toast.error(error.message || '일괄 처리 중 오류가 발생했습니다');
    },
  });

  // 시프트 수동 변경
  const updateShiftType = useMutation({
    mutationFn: async ({ id, shiftType }: { id: string; shiftType: ShiftType }) => {
      const { data, error } = await supabase
        .from('attendance_records')
        .update({ work_type: shiftType })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance', currentOrganization?.id] });
      toast.success('근무조가 변경되었습니다');
    },
    onError: (error) => {
      console.error('Error updating shift type:', error);
      toast.error('근무조 변경 중 오류가 발생했습니다');
    },
  });

  return {
    attendance,
    isLoading,
    error,
    checkIn,
    checkOut,
    updateAttendance,
    bulkUpdateStatus,
    updateShiftType,
  };
}

export function useAttendanceRange(startDate: string, endDate: string) {
  const { currentOrganization } = useOrganization();

  return useQuery({
    queryKey: ['attendance-range', currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from('attendance_records')
        .select(`
          *,
          employee:employees(name, employee_number, department)
        `)
        .eq('organization_id', currentOrganization.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date');

      if (error) throw error;
      return data as AttendanceRecord[];
    },
    enabled: !!currentOrganization?.id,
  });
}
