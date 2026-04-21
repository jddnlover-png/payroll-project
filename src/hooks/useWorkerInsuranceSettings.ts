import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WorkerInsuranceSetting {
  worker_key: string;
  worker_name: string;
  apply_employment_insurance: boolean;
  apply_national_pension: boolean;
  apply_health_insurance: boolean;
  pension_confirmed: boolean;
  health_confirmed: boolean;
  pension_confirmed_months: string[];
  health_confirmed_months: string[];
}

export function useWorkerInsuranceSettings(organizationId: string | undefined) {
  const [settings, setSettings] = useState<WorkerInsuranceSetting[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("worker_insurance_settings")
      .select("*")
      .eq("organization_id", organizationId);
    if (!error && data) {
      setSettings(
        data.map((d) => ({
          worker_key: d.worker_key,
          worker_name: d.worker_name,
          apply_employment_insurance: d.apply_employment_insurance,
          apply_national_pension: d.apply_national_pension,
          apply_health_insurance: d.apply_health_insurance,
          pension_confirmed: (d as any).pension_confirmed ?? false,
          health_confirmed: (d as any).health_confirmed ?? false,
          pension_confirmed_months: (d as any).pension_confirmed_months ?? [],
          health_confirmed_months: (d as any).health_confirmed_months ?? [],
        })),
      );
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const upsert = useCallback(
    async (setting: WorkerInsuranceSetting) => {
      if (!organizationId) return;
      const { error } = await supabase.from("worker_insurance_settings").upsert(
        {
          organization_id: organizationId,
          worker_key: setting.worker_key,
          worker_name: setting.worker_name,
          apply_employment_insurance: setting.apply_employment_insurance,
          apply_national_pension: setting.apply_national_pension,
          apply_health_insurance: setting.apply_health_insurance,
          pension_confirmed: setting.pension_confirmed,
          health_confirmed: setting.health_confirmed,
          pension_confirmed_months: setting.pension_confirmed_months,
          health_confirmed_months: setting.health_confirmed_months,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,worker_key" },
      );
      if (!error) {
        setSettings((prev) => {
          const exists = prev.find((s) => s.worker_key === setting.worker_key);
          if (exists) {
            return prev.map((s) => (s.worker_key === setting.worker_key ? setting : s));
          }
          return [...prev, setting];
        });
      }
      return error;
    },
    [organizationId],
  );

  const getSetting = useCallback(
    (workerKey: string): WorkerInsuranceSetting | undefined => {
      return settings.find((s) => s.worker_key === workerKey);
    },
    [settings],
  );

  // 특정 월에 확인 완료 여부 체크
  const isPensionConfirmedForMonth = useCallback(
    (workerKey: string, yearMonth: string): boolean => {
      const setting = settings.find((s) => s.worker_key === workerKey);
      if (!setting) return false;
      return setting.pension_confirmed_months.includes(yearMonth);
    },
    [settings],
  );

  const isHealthConfirmedForMonth = useCallback(
    (workerKey: string, yearMonth: string): boolean => {
      const setting = settings.find((s) => s.worker_key === workerKey);
      if (!setting) return false;
      return setting.health_confirmed_months.includes(yearMonth);
    },
    [settings],
  );

  return {
    settings,
    loading,
    fetch,
    upsert,
    getSetting,
    isPensionConfirmedForMonth,
    isHealthConfirmedForMonth,
  };
}
