import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

export interface OrganizationFeatureFlags {
  regular_payroll_enabled: boolean;
  construction_daily_enabled: boolean;
  attendance_enabled: boolean;
  reports_enabled: boolean;
  payslip_enabled: boolean;
  settings_enabled: boolean;
}

type FeatureFlagDbRow = {
  regular_payroll_enabled: boolean | null;
  construction_daily_enabled: boolean | null;
};

const defaultFeatureFlags: OrganizationFeatureFlags = {
  regular_payroll_enabled: true,
  construction_daily_enabled: true,
  attendance_enabled: true,
  reports_enabled: true,
  payslip_enabled: true,
  settings_enabled: true,
};

const safeFallbackFeatureFlags: OrganizationFeatureFlags = {
  regular_payroll_enabled: true,
  construction_daily_enabled: false,
  attendance_enabled: true,
  reports_enabled: true,
  payslip_enabled: true,
  settings_enabled: true,
};

export function useOrganizationFeatureFlags() {
  const { currentOrganization } = useOrganization();

  const query = useQuery<OrganizationFeatureFlags>({
    queryKey: ["organization-feature-flags", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) {
        return defaultFeatureFlags;
      }

      const { data, error } = await (supabase as any)
        .from("organization_feature_flags")
        .select("regular_payroll_enabled, construction_daily_enabled")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      if (error) {
        console.error("feature flags fetch error:", error);
        return safeFallbackFeatureFlags;
      }

      const row = data as FeatureFlagDbRow | null;

      if (!row) {
        return defaultFeatureFlags;
      }

      return {
        regular_payroll_enabled: row.regular_payroll_enabled ?? true,
        construction_daily_enabled: row.construction_daily_enabled ?? false,
        attendance_enabled: true,
        reports_enabled: true,
        payslip_enabled: true,
        settings_enabled: true,
      };
    },
    enabled: !!currentOrganization?.id,
  });

  return {
    featureFlags: query.data ?? defaultFeatureFlags,
    isLoading: query.isLoading,
  };
}