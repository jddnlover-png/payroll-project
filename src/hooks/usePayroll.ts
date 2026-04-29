import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

export interface PayrollRecord {
  id: string;
  organization_id: string;
  employee_id: string;
  period_year: number;
  period_month: number;
  base_salary: number;
  total_payments: number;
  total_deductions: number;
  net_salary: number;
  payment_items: any[];
  deduction_items: any[];
  working_days: number;
  overtime_hours: number;

  actual_late_minutes?: number;
  actual_early_leave_minutes?: number;
  actualLateMinutes?: number;
  actualEarlyLeaveMinutes?: number;

  status: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;

  employee?: {
    name: string;
    employee_number: string;
    department: string | null;
    employment_type: string;
  };
}

export function usePayroll(year: number, month: number) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const {
    data: payroll = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["payroll", currentOrganization?.id, year, month],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("payroll_records")
        .select(
          `
          *,
          employee:employees(name, employee_number, department, employment_type)
        `,
        )
        .eq("organization_id", currentOrganization.id)
        .eq("period_year", year)
        .eq("period_month", month)
        .order("created_at");

      if (error) throw error;
      return (data || []).map((row: any) => ({
        ...row,
        actualLateMinutes: row.actual_late_minutes ?? 0,
        actualEarlyLeaveMinutes: row.actual_early_leave_minutes ?? 0,
      })) as PayrollRecord[];
    },
    enabled: !!currentOrganization?.id,
  });

  const createPayroll = useMutation({
    mutationFn: async (records: Omit<PayrollRecord, "id" | "created_at" | "updated_at" | "employee">[]) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");

      // Delete existing records for this period first
      await supabase
        .from("payroll_records")
        .delete()
        .eq("organization_id", currentOrganization.id)
        .eq("period_year", year)
        .eq("period_month", month);

      const { data, error } = await supabase.from("payroll_records").insert(records).select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", currentOrganization?.id, year, month] });
      toast.success("급여가 계산되었습니다");
    },
    onError: (error) => {
      console.error("Error creating payroll:", error);
      toast.error("급여 계산 중 오류가 발생했습니다");
    },
  });

  const updatePayroll = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from("payroll_records").update(updates).eq("id", id).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", currentOrganization?.id, year, month] });
      toast.success("급여 정보가 수정되었습니다");
    },
    onError: (error) => {
      console.error("Error updating payroll:", error);
      toast.error("급여 수정 중 오류가 발생했습니다");
    },
  });

  const markAsPaid = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("payroll_records")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .in("id", ids);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", currentOrganization?.id, year, month] });
      toast.success("지급 완료 처리되었습니다");
    },
    onError: (error) => {
      console.error("Error marking as paid:", error);
      toast.error("지급 처리 중 오류가 발생했습니다");
    },
  });

  const markAsConfirmedPaid = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("payroll_records")
        .update({ status: "confirmed_paid", paid_at: new Date().toISOString() })
        .in("id", ids);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", currentOrganization?.id, year, month] });
      toast.success("확정 및 지급완료 처리되었습니다");
    },
    onError: (error) => {
      console.error("Error marking as confirmed paid:", error);
      toast.error("확정 및 지급완료 처리 중 오류가 발생했습니다");
    },
  });

  const confirmPayroll = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("payroll_records").update({ status: "confirmed" }).in("id", ids);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", currentOrganization?.id, year, month] });
      toast.success("급여가 확정되었습니다");
    },
    onError: (error) => {
      console.error("Error confirming payroll:", error);
      toast.error("급여 확정 중 오류가 발생했습니다");
    },
  });

  const unconfirmPayroll = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("payroll_records").update({ status: "pending" }).in("id", ids);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll", currentOrganization?.id, year, month] });
      toast.success("급여 확정이 취소되었습니다");
    },
    onError: (error) => {
      console.error("Error unconfirming payroll:", error);
      toast.error("급여 확정 취소 중 오류가 발생했습니다");
    },
  });

  return {
    payroll,
    isLoading,
    error,
    createPayroll,
    updatePayroll,
    markAsPaid,
    markAsConfirmedPaid,
    confirmPayroll,
    unconfirmPayroll,
  };
}
