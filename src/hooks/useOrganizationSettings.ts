import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

export interface OrganizationSettings {
  // 근무시간 설정
  work_start_time: string;
  work_end_time: string;
  break_start_time: string;
  break_end_time: string;
  late_threshold: number;
  checkout_threshold: number;
  // 수당 설정
  overtime_multiplier: number;
  night_shift_multiplier: number;
  night_shift_start_time: string;
  // 급여계산 설정
  overtime_rate: number;
  standard_work_hours: number;
  late_deduction_rate: number;
  absent_deduction_rate: number;
  insurance_deduction_rate: number;
  // 연차발생 설정
  leave_generation_type: string;
  base_annual_leave: number;
  monthly_leave_amount: number;
  max_carry_over: number;
  additional_leave_per_year: number;
  max_additional_leave: number;
  // 연장근무 휴게시간
  overtime_break_2h: number;
  overtime_break_4h: number;
  // 야간근무 휴게시간
  night_break_minutes: number;
  // 야간 교대근무 설정
  shift_tier1_multiplier: number;
  shift_tier1_start: string;
  shift_tier1_end: string;
  shift_tier2_multiplier: number;
  shift_tier2_start: string;
  shift_tier2_end: string;
  shift_tier3_multiplier: number;
  shift_tier3_start: string;
  shift_tier3_end: string;
  // 연장/야간 수당 퇴근 기준
  overtime_checkout_threshold: number;
  night_checkout_threshold: number;
  // 야간 교대근무 휴게시간 (통합 - 레거시)
  shift_break_minutes: number;
  // 야간 교대근무 단계별 휴게시간
  shift_tier1_break_minutes: number;
  shift_tier2_break_minutes: number;
  shift_tier3_break_minutes: number;
  // 야간 교대근무 4단계
  shift_tier4_multiplier: number;
  shift_tier4_break_minutes: number;
  // 야간 교대근무 지각/퇴근 기준
  shift_late_threshold: number;
  shift_checkout_threshold: number;
  // 연장/야간 수당 종료시간
  overtime_end_time: string;
  night_shift_end_time: string;
  // 자동화 설정
  auto_checkout: boolean;
  email_notification: boolean;
  slack_notification: boolean;
  // 급여/근무 기준 설정
  salary_calc_start_day: number;
  salary_calc_end_day: number;
  salary_payment_month: string;
  salary_payment_day: number;
  work_days: number;
  work_day_list: string[];
  weekly_holiday: string;
  weekly_work_hours: number;
  apply_public_holiday: boolean;
  // 사업장 규모 및 휴일대체
  company_size: string;
  holiday_substitute: boolean;
  // 휴일가산 설정
  holiday_alpha_8h: number;
  holiday_alpha_ot: number;
  // 주휴수당 설정
  weekly_hol_enabled: boolean;
  weekly_hol_hours: number;
  weekly_hol_rate: number;
  payroll_start_month: string | null;
  non_work_day_default_type: string;
}

const defaultSettings: OrganizationSettings = {
  work_start_time: "09:00",
  work_end_time: "17:00",
  break_start_time: "12:00",
  break_end_time: "13:00",
  late_threshold: 10,
  checkout_threshold: 10,
  overtime_multiplier: 1.5,
  night_shift_multiplier: 1.5,
  night_shift_start_time: "22:00",
  overtime_rate: 1.5,
  standard_work_hours: 8,
  late_deduction_rate: 0.1,
  absent_deduction_rate: 1,
  insurance_deduction_rate: 0.1,
  leave_generation_type: "yearly",
  base_annual_leave: 15,
  monthly_leave_amount: 1,
  max_carry_over: 5,
  additional_leave_per_year: 1,
  max_additional_leave: 10,
  overtime_break_2h: 30,
  overtime_break_4h: 60,
  night_break_minutes: 30,
  shift_tier1_multiplier: 1.0,
  shift_tier1_start: "18:00",
  shift_tier1_end: "22:00",
  shift_tier2_multiplier: 1.5,
  shift_tier2_start: "22:00",
  shift_tier2_end: "06:00",
  shift_tier3_multiplier: 2.0,
  shift_tier3_start: "06:00",
  shift_tier3_end: "06:00",
  overtime_checkout_threshold: 10,
  night_checkout_threshold: 10,
  shift_break_minutes: 30,
  shift_tier1_break_minutes: 60,
  shift_tier2_break_minutes: 0,
  shift_tier3_break_minutes: 0,
  shift_tier4_multiplier: 1.5,
  shift_tier4_break_minutes: 0,
  shift_late_threshold: 20,
  shift_checkout_threshold: 20,
  overtime_end_time: "22:00",
  night_shift_end_time: "06:00",
  auto_checkout: true,
  email_notification: true,
  slack_notification: false,
  salary_calc_start_day: 1,
  salary_calc_end_day: 31,
  salary_payment_month: "current_month",
  salary_payment_day: 25,
  work_days: 5,
  work_day_list: ["MON", "TUE", "WED", "THU", "FRI"],
  weekly_holiday: "sun",
  weekly_work_hours: 40,
  apply_public_holiday: true,
  company_size: "over5",
  holiday_substitute: false,
  holiday_alpha_8h: 0.5,
  holiday_alpha_ot: 1.0,
  weekly_hol_enabled: true,
  weekly_hol_hours: 8,
  weekly_hol_rate: 1.0,
  payroll_start_month: null,
  non_work_day_default_type: "REST_DAY",
};

export function useOrganizationSettings() {
  const { currentOrganization } = useOrganization();
  const [settings, setSettings] = useState<OrganizationSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!currentOrganization) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("organization_settings")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          work_start_time: data.work_start_time,
          work_end_time: data.work_end_time,
          break_start_time: data.break_start_time,
          break_end_time: data.break_end_time,
          late_threshold: data.late_threshold,
          checkout_threshold: data.checkout_threshold,
          overtime_multiplier: Number(data.overtime_multiplier),
          night_shift_multiplier: Number(data.night_shift_multiplier),
          night_shift_start_time: data.night_shift_start_time,
          overtime_rate: Number(data.overtime_rate),
          standard_work_hours: data.standard_work_hours,
          late_deduction_rate: Number(data.late_deduction_rate),
          absent_deduction_rate: Number(data.absent_deduction_rate),
          insurance_deduction_rate: Number(data.insurance_deduction_rate),
          leave_generation_type: data.leave_generation_type,
          base_annual_leave: data.base_annual_leave,
          monthly_leave_amount: Number(data.monthly_leave_amount),
          max_carry_over: data.max_carry_over,
          additional_leave_per_year: data.additional_leave_per_year,
          max_additional_leave: data.max_additional_leave,
          overtime_break_2h: data.overtime_break_2h,
          overtime_break_4h: data.overtime_break_4h,
          night_break_minutes: data.night_break_minutes,
          shift_tier1_multiplier: Number(data.shift_tier1_multiplier),
          shift_tier1_start: data.shift_tier1_start,
          shift_tier1_end: data.shift_tier1_end,
          shift_tier2_multiplier: Number(data.shift_tier2_multiplier),
          shift_tier2_start: data.shift_tier2_start,
          shift_tier2_end: data.shift_tier2_end,
          shift_tier3_multiplier: Number(data.shift_tier3_multiplier),
          shift_tier3_start: data.shift_tier3_start,
          shift_tier3_end: data.shift_tier3_end,
          overtime_checkout_threshold: (data as any).overtime_checkout_threshold ?? 10,
          night_checkout_threshold: (data as any).night_checkout_threshold ?? 10,
          shift_break_minutes: data.shift_break_minutes,
          shift_tier1_break_minutes: (data as any).shift_tier1_break_minutes ?? 0,
          shift_tier2_break_minutes: (data as any).shift_tier2_break_minutes ?? 0,
          shift_tier3_break_minutes: (data as any).shift_tier3_break_minutes ?? 0,
          shift_tier4_multiplier: Number((data as any).shift_tier4_multiplier ?? 1.5),
          shift_tier4_break_minutes: (data as any).shift_tier4_break_minutes ?? 0,
          shift_late_threshold: (data as any).shift_late_threshold ?? 20,
          shift_checkout_threshold: (data as any).shift_checkout_threshold ?? 20,
          overtime_end_time: (data as any).overtime_end_time ?? "22:00",
          night_shift_end_time: (data as any).night_shift_end_time ?? "06:00",
          auto_checkout: data.auto_checkout,
          email_notification: data.email_notification,
          slack_notification: data.slack_notification,
          salary_calc_start_day: (data as any).salary_calc_start_day ?? 1,
          salary_calc_end_day: (data as any).salary_calc_end_day ?? 31,
          salary_payment_month: (data as any).salary_payment_month ?? "current_month",
          salary_payment_day: (data as any).salary_payment_day ?? 25,
          work_days: (data as any).work_days ?? 5,
          work_day_list: (data as any).work_day_list ?? ["MON", "TUE", "WED", "THU", "FRI"],
          weekly_holiday: (data as any).weekly_holiday ?? "sun",
          weekly_work_hours: (data as any).weekly_work_hours ?? 40,
          apply_public_holiday: (data as any).apply_public_holiday ?? true,
          company_size: (data as any).company_size ?? "over5",
          holiday_substitute: (data as any).holiday_substitute ?? false,
          holiday_alpha_8h: Number((data as any).holiday_alpha_8h ?? 0.5),
          holiday_alpha_ot: Number((data as any).holiday_alpha_ot ?? 0.5),
          weekly_hol_enabled: (data as any).weekly_hol_enabled ?? true,
          weekly_hol_hours: (data as any).weekly_hol_hours ?? 8,
          weekly_hol_rate: Number((data as any).weekly_hol_rate ?? 1.0),
          payroll_start_month: (data as any).payroll_start_month ?? null,
          non_work_day_default_type: (data as any).non_work_day_default_type ?? "REST_DAY",
        });
      }
    } catch (error) {
      console.error("Error fetching organization settings:", error);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async (partial: Partial<OrganizationSettings>) => {
    if (!currentOrganization) return false;
    setSaving(true);
    try {
      // Check if settings exist
      const { data: existing } = await supabase
        .from("organization_settings")
        .select("id")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      const updatedSettings = { ...settings, ...partial };

      if (existing) {
        const { error } = await supabase
          .from("organization_settings")
          .update(partial)
          .eq("organization_id", currentOrganization.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("organization_settings").insert({
          organization_id: currentOrganization.id,
          ...updatedSettings,
        });
        if (error) throw error;
      }

      setSettings(updatedSettings);
      return true;
    } catch (error) {
      console.error("Error saving organization settings:", error);
      toast.error("설정 저장에 실패했습니다.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { settings, loading, saving, saveSettings, refetch: fetchSettings };
}
