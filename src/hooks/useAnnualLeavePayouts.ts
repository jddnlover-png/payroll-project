import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

export interface AnnualLeavePayout {
  id: string;
  organization_id: string;
  employee_id: string;
  settlement_month: string;
  days: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export type AnnualLeavePayoutInsert = Omit<
  AnnualLeavePayout,
  "id" | "organization_id" | "created_at" | "updated_at"
>;

export type AnnualLeavePayoutUpdate = Partial<
  Omit<
    AnnualLeavePayout,
    "id" | "organization_id" | "employee_id" | "created_at" | "updated_at"
  >
>;

export function useAnnualLeavePayouts() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const {
    data: annualLeavePayouts = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["annual_leave_payouts", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
  .from("annual_leave_payouts")
  .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("settlement_month", { ascending: false });

      if (error) throw error;

      return data as AnnualLeavePayout[];
    },
    enabled: !!currentOrganization?.id,
  });

  const addAnnualLeavePayout = useMutation({
    mutationFn: async (record: AnnualLeavePayoutInsert) => {
      if (!currentOrganization?.id) {
        throw new Error("No organization selected");
      }

      const { data, error } = await supabase
  .from("annual_leave_payouts")
  .insert({
          ...record,
          organization_id: currentOrganization.id,
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["annual_leave_payouts", currentOrganization?.id],
      });

      toast.success("연차수당이 등록되었습니다");
    },

    onError: (error) => {
      console.error(error);
      toast.error("연차수당 등록 중 오류가 발생했습니다");
    },
  });

  const updateAnnualLeavePayout = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: { id: string } & AnnualLeavePayoutUpdate) => {
      const { data, error } = await supabase
  .from("annual_leave_payouts")
  .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      return data;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["annual_leave_payouts", currentOrganization?.id],
      });

      toast.success("연차수당 정보가 수정되었습니다");
    },

    onError: (error) => {
      console.error(error);
      toast.error("연차수당 수정 중 오류가 발생했습니다");
    },
  });

  const deleteAnnualLeavePayout = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
  .from("annual_leave_payouts")
  .delete()
        .eq("id", id);

      if (error) throw error;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["annual_leave_payouts", currentOrganization?.id],
      });

      toast.success("연차수당 기록이 삭제되었습니다");
    },

    onError: (error) => {
      console.error(error);
      toast.error("연차수당 삭제 중 오류가 발생했습니다");
    },
  });

  return {
    annualLeavePayouts,
    isLoading,
    error,
    addAnnualLeavePayout,
    updateAnnualLeavePayout,
    deleteAnnualLeavePayout,
  };
}