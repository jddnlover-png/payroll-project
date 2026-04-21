import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from 'sonner';

export interface DailyPayrollRecord {
  id: string;
  organization_id: string;
  employee_id: string;
  attendance_record_id: string | null;
  work_date: string;
  work_minutes: number;
  stay_minutes: number;
  break_minutes: number;
  policy_deduction_minutes: number;
  overtime_minutes: number;
  night_minutes: number;
  base_daily_wage: number;
  overtime_pay: number;
  night_pay: number;
  total_wage: number;
  settlement_type: string;
  income_tax: number;
  local_income_tax: number;
  employment_insurance: number;
  national_pension: number;
  health_insurance: number;
  total_deductions: number;
  net_pay: number;
  status: string;
  created_at: string;
  updated_at: string;
  employee?: {
    name: string;
    employee_number: string;
    department: string | null;
    daily_rate: number | null;
    hourly_rate: number | null;
    pay_type: string;
    settlement_type: string;
  };
}

export function useDailyPayrollRecords(startDate: string, endDate: string) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const queryKey = ['daily-payroll-records', currentOrganization?.id, startDate, endDate];

  const { data: records = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!currentOrganization) return [];
      const { data, error } = await supabase
        .from('daily_payroll_records')
        .select('*, employee:employees(name, employee_number, department, daily_rate, hourly_rate, pay_type, settlement_type)')
        .eq('organization_id', currentOrganization.id)
        .gte('work_date', startDate)
        .lte('work_date', endDate)
        .order('work_date', { ascending: false });

      if (error) throw error;
      return (data || []) as DailyPayrollRecord[];
    },
    enabled: !!currentOrganization,
  });

  const upsertRecords = useMutation({
    mutationFn: async (recordsToUpsert: Omit<DailyPayrollRecord, 'id' | 'created_at' | 'updated_at' | 'employee'>[]) => {
      const { error } = await supabase
        .from('daily_payroll_records')
        .upsert(
          recordsToUpsert.map(r => ({ ...r, updated_at: new Date().toISOString() })),
          { onConflict: 'employee_id,work_date' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('일용직 급여가 생성되었습니다');
    },
    onError: () => {
      toast.error('급여 생성에 실패했습니다');
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { error } = await supabase
        .from('daily_payroll_records')
        .update({ status, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteRecords = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('daily_payroll_records')
        .delete()
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('삭제되었습니다');
    },
    onError: () => {
      toast.error('삭제에 실패했습니다');
    },
  });

  return { records, isLoading, upsertRecords, updateStatus, deleteRecords };
}
