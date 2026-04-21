/**
 * 생산직 비과세 설정 및 누적 기록 관리 훅
 * DB 테이블: production_tax_exempt_settings, production_tax_exempt_records
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

export interface ProductionTaxExemptSetting {
  id?: string;
  organization_id: string;
  employee_id: string;
  apply_year: number;
  is_eligible: boolean;
  prior_year_total_salary: number;
}

export interface ProductionTaxExemptRecord {
  id?: string;
  organization_id: string;
  employee_id: string;
  apply_year: number;
  apply_month: number;
  monthly_salary: number;
  is_eligible_month: boolean;
  exempt_amount: number;
  taxable_amount: number;
}

export function useProductionTaxExempt(year: number) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  // ── 설정 조회 ──
  const { data: settings = [] } = useQuery({
    queryKey: ["production_tax_exempt_settings", orgId, year],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("production_tax_exempt_settings")
        .select("*")
        .eq("organization_id", orgId)
        .eq("apply_year", year);
      if (error) throw error;
      return data as ProductionTaxExemptSetting[];
    },
    enabled: !!orgId,
  });

  // ── 누적 기록 조회 ──
  const { data: records = [] } = useQuery({
    queryKey: ["production_tax_exempt_records", orgId, year],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("production_tax_exempt_records")
        .select("*")
        .eq("organization_id", orgId)
        .eq("apply_year", year)
        .order("apply_month");
      if (error) throw error;
      return data as ProductionTaxExemptRecord[];
    },
    enabled: !!orgId,
  });

  // ── 직원별 설정 조회 ──
  const getSettingByEmployee = (employeeId: string): ProductionTaxExemptSetting | null => {
    return settings.find((s) => s.employee_id === employeeId) ?? null;
  };

  // ── 직원별 특정 월까지 누적 비과세액 조회 ──
  const getAccumulatedExempt = (employeeId: string, beforeMonth: number): number => {
    return records
      .filter((r) => r.employee_id === employeeId && r.apply_month < beforeMonth)
      .reduce((sum, r) => sum + r.exempt_amount, 0);
  };

  // ── 직원별 연간 누적 비과세액 조회 ──
  const getYearlyExempt = (
    employeeId: string,
  ): {
    totalExempt: number;
    monthlyBreakdown: { month: number; exemptAmount: number; taxableAmount: number; isEligible: boolean }[];
  } => {
    const empRecords = records.filter((r) => r.employee_id === employeeId);
    return {
      totalExempt: empRecords.reduce((sum, r) => sum + r.exempt_amount, 0),
      monthlyBreakdown: empRecords.map((r) => ({
        month: r.apply_month,
        exemptAmount: r.exempt_amount,
        taxableAmount: r.taxable_amount,
        isEligible: r.is_eligible_month,
      })),
    };
  };

  // ── 설정 저장/수정 ──
  const upsertSetting = useMutation({
    mutationFn: async (setting: Omit<ProductionTaxExemptSetting, "id">) => {
      if (!orgId) throw new Error("No organization");
      const { error } = await supabase
        .from("production_tax_exempt_settings")
        .upsert(
          { ...setting, organization_id: orgId, updated_at: new Date().toISOString() },
          { onConflict: "organization_id,employee_id,apply_year" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production_tax_exempt_settings", orgId, year] });
      toast.success("생산직 비과세 설정이 저장되었습니다");
    },
    onError: () => {
      toast.error("설정 저장 중 오류가 발생했습니다");
    },
  });

  // ── 월별 비과세 기록 저장 ──
  const upsertRecord = useMutation({
    mutationFn: async (record: Omit<ProductionTaxExemptRecord, "id">) => {
      if (!orgId) throw new Error("No organization");
      const { error } = await supabase
        .from("production_tax_exempt_records")
        .upsert(
          { ...record, organization_id: orgId },
          { onConflict: "organization_id,employee_id,apply_year,apply_month" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production_tax_exempt_records", orgId, year] });
    },
  });

  return {
    settings,
    records,
    getSettingByEmployee,
    getAccumulatedExempt,
    getYearlyExempt,
    upsertSetting,
    upsertRecord,
  };
}
