
-- 조직별 설정 테이블 생성
CREATE TABLE public.organization_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- 근무시간 설정
  work_start_time TEXT NOT NULL DEFAULT '09:00',
  work_end_time TEXT NOT NULL DEFAULT '17:00',
  late_threshold INTEGER NOT NULL DEFAULT 10,
  
  -- 수당 설정
  overtime_multiplier NUMERIC NOT NULL DEFAULT 1.5,
  night_shift_multiplier NUMERIC NOT NULL DEFAULT 2.0,
  night_shift_start_time TEXT NOT NULL DEFAULT '22:00',
  
  -- 급여계산 설정
  overtime_rate NUMERIC NOT NULL DEFAULT 1.5,
  standard_work_hours INTEGER NOT NULL DEFAULT 8,
  late_deduction_rate NUMERIC NOT NULL DEFAULT 0.1,
  absent_deduction_rate NUMERIC NOT NULL DEFAULT 1,
  insurance_deduction_rate NUMERIC NOT NULL DEFAULT 0.1,
  
  -- 연차발생 설정
  leave_generation_type TEXT NOT NULL DEFAULT 'yearly',
  base_annual_leave INTEGER NOT NULL DEFAULT 15,
  monthly_leave_amount NUMERIC NOT NULL DEFAULT 1,
  max_carry_over INTEGER NOT NULL DEFAULT 5,
  additional_leave_per_year INTEGER NOT NULL DEFAULT 1,
  max_additional_leave INTEGER NOT NULL DEFAULT 10,
  
  -- 자동화 설정
  auto_checkout BOOLEAN NOT NULL DEFAULT true,
  email_notification BOOLEAN NOT NULL DEFAULT true,
  slack_notification BOOLEAN NOT NULL DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT unique_org_settings UNIQUE (organization_id)
);

-- RLS 활성화
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

-- RLS 정책
CREATE POLICY "Members can view org settings"
ON public.organization_settings FOR SELECT
USING (is_organization_member(auth.uid(), organization_id));

CREATE POLICY "Admins can insert org settings"
ON public.organization_settings FOR INSERT
WITH CHECK (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update org settings"
ON public.organization_settings FOR UPDATE
USING (is_org_admin(auth.uid(), organization_id));

-- updated_at 트리거
CREATE TRIGGER update_organization_settings_updated_at
BEFORE UPDATE ON public.organization_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
