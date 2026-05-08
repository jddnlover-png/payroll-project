import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WorkerInsuranceReviewLogInput {
  organization_id: string;
  worker_key: string;
  worker_name: string;
  review_month: string;
  insurance_type: "pension" | "health" | "conversion";
  review_message: string;
  work_days?: number | null;
  total_income?: number | null;
  status?: "confirmed";
}

export interface WorkerInsuranceReviewLog {
  id: string;
  organization_id: string;
  worker_key: string;
  worker_name: string;
  review_month: string;
  insurance_type: "pension" | "health" | "conversion";
  review_message: string;
  work_days: number | null;
  total_income: number | null;
  status: string;
  reviewed_at: string;
  reviewed_by: string | null;
  created_at: string;
}

export function useWorkerInsuranceReviewLogs(
  organizationId?: string,
  reviewMonth?: string,
) {
  const [logs, setLogs] = useState<WorkerInsuranceReviewLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!organizationId || !reviewMonth) {
      setLogs([]);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("worker_insurance_review_logs" as any)
      .select("*")
      .eq("organization_id", organizationId)
      .eq("review_month", reviewMonth)
      .order("reviewed_at", { ascending: false });

    if (error) {
      console.error("insurance review logs fetch error:", error);
      setLogs([]);
      setLoading(false);
      return;
    }

    setLogs((data ?? []) as WorkerInsuranceReviewLog[]);
    setLoading(false);
  }, [organizationId, reviewMonth]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const insertReviewLog = useCallback(async (input: WorkerInsuranceReviewLogInput) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("worker_insurance_review_logs" as any).insert({
      organization_id: input.organization_id,
      worker_key: input.worker_key,
      worker_name: input.worker_name,
      review_month: input.review_month,
      insurance_type: input.insurance_type,
      review_message: input.review_message,
      work_days: input.work_days ?? null,
      total_income: input.total_income ?? null,
      status: input.status ?? "confirmed",
      reviewed_by: user?.id ?? null,
    });

    if (!error) {
      await fetchLogs();
    }

    return error;
  }, [fetchLogs]);

  return {
    logs,
    loading,
    fetchLogs,
    insertReviewLog,
  };
}