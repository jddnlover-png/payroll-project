import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

export type AnnualLeaveLedgerEntryType =
  | "grant"
  | "adjustment"
  | "initial_adjustment"
  | "extra_grant"
  | "carryover"
  | "advance_use";

export interface AnnualLeaveLedger {
  id: string;
  organization_id: string;
  employee_id: string;
  ledger_year: number;
  ledger_date: string;
  entry_type: AnnualLeaveLedgerEntryType;
  days: number;
  reason: string;
  source_type: string | null;
  source_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnualLeaveLedgerInsert {
  employee_id: string;
  ledger_year: number;
  ledger_date?: string;
  entry_type: AnnualLeaveLedgerEntryType;
  days: number;
  reason: string;
  source_type?: string | null;
  source_id?: string | null;
}

export interface AnnualLeaveLedgerUpdate {
  ledger_date?: string;
  entry_type?: AnnualLeaveLedgerEntryType;
  days?: number;
  reason?: string;
  source_type?: string | null;
  source_id?: string | null;
}

export function useAnnualLeaveLedger(year?: number) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const queryKey = [
    "annual-leave-ledger",
    currentOrganization?.id,
    year ?? "all",
  ];

  const { data: ledgerEntries = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      let query = (supabase as any)
        .from("annual_leave_ledger")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("ledger_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (year) {
        query = query.eq("ledger_year", year);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []) as AnnualLeaveLedger[];
    },
    enabled: !!currentOrganization?.id,
  });

  const addLedgerEntry = useMutation({
    mutationFn: async (entry: AnnualLeaveLedgerInsert) => {
      if (!currentOrganization?.id) {
        throw new Error("조직 정보가 없습니다.");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await (supabase as any)
        .from("annual_leave_ledger")
        .insert({
          organization_id: currentOrganization.id,
          employee_id: entry.employee_id,
          ledger_year: entry.ledger_year,
          ledger_date:
            entry.ledger_date || new Date().toISOString().split("T")[0],
          entry_type: entry.entry_type,
          days: entry.days,
          reason: entry.reason,
          source_type: entry.source_type || null,
          source_id: entry.source_id || null,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;

      return data as AnnualLeaveLedger;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["annual-leave-ledger", currentOrganization?.id],
      });
      toast.success("연차 원장 내역이 등록되었습니다.");
    },
    onError: (error: any) => {
      toast.error("연차 원장 등록 중 오류가 발생했습니다: " + error.message);
    },
  });

  const updateLedgerEntry = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: AnnualLeaveLedgerUpdate & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("annual_leave_ledger")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      return data as AnnualLeaveLedger;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["annual-leave-ledger", currentOrganization?.id],
      });
      toast.success("연차 원장 내역이 수정되었습니다.");
    },
    onError: (error: any) => {
      toast.error("연차 원장 수정 중 오류가 발생했습니다: " + error.message);
    },
  });

  const deleteLedgerEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("annual_leave_ledger")
        .delete()
        .eq("id", id);

      if (error) throw error;

      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["annual-leave-ledger", currentOrganization?.id],
      });
      toast.success("연차 원장 내역이 삭제되었습니다.");
    },
    onError: (error: any) => {
      toast.error("연차 원장 삭제 중 오류가 발생했습니다: " + error.message);
    },
  });

  return {
    ledgerEntries,
    isLoading,
    addLedgerEntry,
    updateLedgerEntry,
    deleteLedgerEntry,
  };
}