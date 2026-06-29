import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";
import { DailyPayrollSettings } from "@/utils/dailyPayrollCalculation";

const DEFAULT_SETTINGS: DailyPayrollSettings = {
  wage_calc_method: "fixed",
  payment_day: 25,
  tax_exempt_limit: 150000,
  default_settlement_type: "employment_income",
  apply_employment_insurance: true,
  apply_industrial_accident_insurance: true,
  apply_national_pension: false,
  apply_health_insurance: false,
  monthly_workday_warning: 8,
  employment_insurance_rate: 0.9,
national_pension_rate: 4.75,
health_insurance_rate: 3.595,
long_term_care_rate: 13.14,
industrial_accident_rate: 3.7,
  weekly_work_hours: 40,
  weekly_work_day_list: ["MON", "TUE", "WED", "THU", "FRI"],
  weekly_work_days: 5,
  weekly_holiday: "sun",
  holiday_work_policy: "REFERENCE_ONLY",
  fixed_holiday_daily_wage: null,
  holiday_minimum_enforce: true,
  enable_meal_allowance: false,
  enable_vehicle_allowance: false,
  enable_extra_non_taxable: false,
  extra_non_taxable_name: "",
  production_worker_tax_exempt: true,
  non_work_day_default_type: "REST_DAY",
};

export function useDailyPayrollSettings() {
  const { currentOrganization } = useOrganization();
  const [settings, setSettings] = useState<DailyPayrollSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => setFetchKey((k) => k + 1), []);

  useEffect(() => {
    if (!currentOrganization) return;
    setLoading(true);
    supabase
      .from("daily_payroll_settings")
      .select("*")
      .eq("organization_id", currentOrganization.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (data) {
          setSettings({
            wage_calc_method: data.wage_calc_method as "fixed" | "hourly",
            tax_exempt_limit: data.tax_exempt_limit,
            default_settlement_type: data.default_settlement_type as any,
            apply_employment_insurance: data.apply_employment_insurance,
            apply_industrial_accident_insurance: data.apply_industrial_accident_insurance,
            apply_national_pension: data.apply_national_pension,
            apply_health_insurance: data.apply_health_insurance,
            monthly_workday_warning: data.monthly_workday_warning,
            employment_insurance_rate: data.employment_insurance_rate,
            national_pension_rate: data.national_pension_rate,
            health_insurance_rate: data.health_insurance_rate,
            long_term_care_rate: data.long_term_care_rate ?? 13.14,
industrial_accident_rate: data.industrial_accident_rate ?? 3.7,
            weekly_work_hours: data.weekly_work_hours ?? 40,
            weekly_work_day_list: data.weekly_work_day_list ?? ["MON", "TUE", "WED", "THU", "FRI"],
            weekly_work_days: data.weekly_work_days ?? 5,
            weekly_holiday: data.weekly_holiday ?? "sun",
            holiday_work_policy: (data as any).holiday_work_policy ?? "REFERENCE_ONLY",
            fixed_holiday_daily_wage: (data as any).fixed_holiday_daily_wage ?? null,
            holiday_minimum_enforce: (data as any).holiday_minimum_enforce ?? true,
            enable_meal_allowance: (data as any).enable_meal_allowance ?? false,
            enable_vehicle_allowance: (data as any).enable_vehicle_allowance ?? false,
            enable_extra_non_taxable: (data as any).enable_extra_non_taxable ?? false,
            extra_non_taxable_name: (data as any).extra_non_taxable_name ?? "",
            production_worker_tax_exempt: (data as any).production_worker_tax_exempt ?? false,
            non_work_day_default_type: (data as any).non_work_day_default_type ?? "REST_DAY",
            payment_day: (data as any).payment_day ?? 25,
          });
        }
        setLoading(false);
      });
  }, [currentOrganization, fetchKey]);

  const saveSettings = useCallback(
    async (newSettings: Partial<DailyPayrollSettings>) => {
      if (!currentOrganization) return;
      setSaving(true);
      const merged = { ...settings, ...newSettings };

      const { error } = await supabase.from("daily_payroll_settings").upsert(
        {
          organization_id: currentOrganization.id,
          ...merged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" },
      );

      if (error) {
        toast.error("설정 저장에 실패했습니다");
      } else {
        setSettings(merged);
        toast.success("일용직 급여 설정이 저장되었습니다");
      }
      setSaving(false);
    },
    [currentOrganization, settings],
  );

  return { settings, loading, saving, saveSettings, refetch };
}
