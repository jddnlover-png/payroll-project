
-- Add settlement_type to employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS settlement_type text NOT NULL DEFAULT 'employment_income';

-- Daily payroll settings (per organization)
CREATE TABLE public.daily_payroll_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  wage_calc_method text NOT NULL DEFAULT 'fixed',
  tax_exempt_limit numeric NOT NULL DEFAULT 150000,
  default_settlement_type text NOT NULL DEFAULT 'employment_income',
  apply_employment_insurance boolean NOT NULL DEFAULT true,
  apply_industrial_accident_insurance boolean NOT NULL DEFAULT true,
  apply_national_pension boolean NOT NULL DEFAULT false,
  apply_health_insurance boolean NOT NULL DEFAULT false,
  monthly_workday_warning numeric NOT NULL DEFAULT 8,
  employment_insurance_rate numeric NOT NULL DEFAULT 0.9,
  national_pension_rate numeric NOT NULL DEFAULT 4.5,
  health_insurance_rate numeric NOT NULL DEFAULT 3.545,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Daily payroll records
CREATE TABLE public.daily_payroll_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_record_id uuid REFERENCES public.attendance_records(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  work_minutes numeric NOT NULL DEFAULT 0,
  stay_minutes numeric NOT NULL DEFAULT 0,
  break_minutes numeric NOT NULL DEFAULT 0,
  policy_deduction_minutes numeric NOT NULL DEFAULT 0,
  overtime_minutes numeric NOT NULL DEFAULT 0,
  night_minutes numeric NOT NULL DEFAULT 0,
  base_daily_wage numeric NOT NULL DEFAULT 0,
  overtime_pay numeric NOT NULL DEFAULT 0,
  night_pay numeric NOT NULL DEFAULT 0,
  total_wage numeric NOT NULL DEFAULT 0,
  settlement_type text NOT NULL DEFAULT 'employment_income',
  income_tax numeric NOT NULL DEFAULT 0,
  local_income_tax numeric NOT NULL DEFAULT 0,
  employment_insurance numeric NOT NULL DEFAULT 0,
  national_pension numeric NOT NULL DEFAULT 0,
  health_insurance numeric NOT NULL DEFAULT 0,
  total_deductions numeric NOT NULL DEFAULT 0,
  net_pay numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'auto_generated',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(employee_id, work_date)
);

-- RLS
ALTER TABLE public.daily_payroll_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_payroll_records ENABLE ROW LEVEL SECURITY;

-- Policies for daily_payroll_settings
CREATE POLICY "Members can view daily payroll settings" ON public.daily_payroll_settings
  FOR SELECT TO authenticated USING (is_organization_member(auth.uid(), organization_id));
CREATE POLICY "Admins can insert daily payroll settings" ON public.daily_payroll_settings
  FOR INSERT TO authenticated WITH CHECK (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can update daily payroll settings" ON public.daily_payroll_settings
  FOR UPDATE TO authenticated USING (is_org_admin(auth.uid(), organization_id));

-- Policies for daily_payroll_records
CREATE POLICY "Admins can view daily payroll records" ON public.daily_payroll_records
  FOR SELECT TO authenticated USING (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can insert daily payroll records" ON public.daily_payroll_records
  FOR INSERT TO authenticated WITH CHECK (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can update daily payroll records" ON public.daily_payroll_records
  FOR UPDATE TO authenticated USING (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can delete daily payroll records" ON public.daily_payroll_records
  FOR DELETE TO authenticated USING (is_org_admin(auth.uid(), organization_id));
