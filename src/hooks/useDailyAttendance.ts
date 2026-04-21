import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from 'sonner';

export interface DailyAttendanceRecord {
  id: string;
  organization_id: string;
  site_id: string;
  worker_name: string;
  ssn_encrypted: string | null;
  ssn_masked: string | null;
  ssn_last4: string | null;
  phone: string | null;
  work_date: string;
  work_type: string;
  start_time: string | null;
  end_time: string | null;
  work_hours: number | null;
  work_minutes: number;
  break_minutes: number;
  daily_wage: number;
  calculated_pay: number;
  final_pay: number;
  adjustment_memo: string;
  regular_hours: number;
  overtime_hours: number;
  night_hours: number;
  overtime_pay: number;
  night_pay: number;
  holiday_hours: number;
  holiday_pay: number;
  income_tax: number;
  local_income_tax: number;
  employment_insurance: number;
  national_pension: number;
  health_insurance: number;
  long_term_care_insurance: number;
  industrial_accident: number;
  total_deductions: number;
  net_pay: number;
  fingerprint: string;
  calculation_snapshot: any;
  memo: string;
  job_type: string;
  created_at: string;
}

export function useDailyAttendance(siteId: string | null, yearMonth: string) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const [year, month] = yearMonth.split('-').map(Number);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const queryKey = ['daily_attendance', orgId, siteId, yearMonth];

  const { data: records = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!orgId || !siteId) return [];
      const { data, error } = await supabase
        .from('daily_attendance')
        .select('*')
        .eq('organization_id', orgId)
        .eq('site_id', siteId)
        .gte('work_date', startDate)
        .lte('work_date', endDate)
        .order('work_date')
        .order('worker_name');
      if (error) throw error;
      return data as DailyAttendanceRecord[];
    },
    enabled: !!orgId && !!siteId,
  });

  const insertRecord = useMutation({
    mutationFn: async (record: Omit<DailyAttendanceRecord, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('daily_attendance')
        .insert(record)
        .select()
        .single();
      if (error) {
        if (error.code === '23505') throw new Error('이미 저장된 데이터입니다.');
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('근태가 저장되었습니다');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRecord = useMutation({
    mutationFn: async (params: { id: string; updates: Partial<DailyAttendanceRecord> }) => {
      const { error } = await supabase
        .from('daily_attendance')
        .update(params.updates)
        .eq('id', params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('근태가 수정되었습니다');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRecord = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('daily_attendance')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('근태가 삭제되었습니다');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { records, isLoading, insertRecord, updateRecord, deleteRecord, startDate, endDate };
}
