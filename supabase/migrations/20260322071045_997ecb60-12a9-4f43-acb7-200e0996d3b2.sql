
-- 주휴수당 이월 테이블
CREATE TABLE public.weekly_holiday_carry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL,
  carry_days INT NOT NULL DEFAULT 0,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(organization_id, employee_id, year, month)
);

ALTER TABLE public.weekly_holiday_carry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view weekly_holiday_carry" ON public.weekly_holiday_carry
  FOR SELECT TO authenticated USING (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can insert weekly_holiday_carry" ON public.weekly_holiday_carry
  FOR INSERT TO authenticated WITH CHECK (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can update weekly_holiday_carry" ON public.weekly_holiday_carry
  FOR UPDATE TO authenticated USING (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can delete weekly_holiday_carry" ON public.weekly_holiday_carry
  FOR DELETE TO authenticated USING (is_org_admin(auth.uid(), organization_id));

-- 직원 테이블에 초기 이월 컬럼 추가
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS initial_carry_weeks INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_carry_month TEXT;
