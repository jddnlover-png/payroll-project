
-- 1. organization_settings에 신규 컬럼 2개 추가
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS company_size text NOT NULL DEFAULT 'over5',
  ADD COLUMN IF NOT EXISTS holiday_substitute boolean NOT NULL DEFAULT false;

-- 2. salary_details 테이블 신규 생성
CREATE TABLE public.salary_details (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  pay_year_month text NOT NULL,
  site_id uuid NULL,
  regular_pay numeric NOT NULL DEFAULT 0,
  overtime_pay numeric NOT NULL DEFAULT 0,
  night_pay numeric NOT NULL DEFAULT 0,
  shift_pay_1 numeric NOT NULL DEFAULT 0,
  shift_pay_2 numeric NOT NULL DEFAULT 0,
  shift_pay_3 numeric NOT NULL DEFAULT 0,
  holiday_work_pay numeric NOT NULL DEFAULT 0,
  holiday_work_overtime_pay numeric NOT NULL DEFAULT 0,
  public_holiday_pay numeric NOT NULL DEFAULT 0,
  public_holiday_work_pay numeric NOT NULL DEFAULT 0,
  weekly_holiday_pay numeric NOT NULL DEFAULT 0,
  is_tax_exempt boolean NOT NULL DEFAULT false,
  tax_exempt_amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(organization_id, employee_id, pay_year_month)
);

-- Enable RLS
ALTER TABLE public.salary_details ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can view salary details"
  ON public.salary_details FOR SELECT
  TO authenticated
  USING (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can insert salary details"
  ON public.salary_details FOR INSERT
  TO authenticated
  WITH CHECK (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update salary details"
  ON public.salary_details FOR UPDATE
  TO authenticated
  USING (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete salary details"
  ON public.salary_details FOR DELETE
  TO authenticated
  USING (is_org_admin(auth.uid(), organization_id));

-- Trigger for updated_at
CREATE TRIGGER update_salary_details_updated_at
  BEFORE UPDATE ON public.salary_details
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
