-- 직원별 급여항목 오버라이드 테이블 생성
CREATE TABLE public.employee_payroll_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    payment_items jsonb DEFAULT '[]'::jsonb,
    deduction_items jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (organization_id, employee_id)
);

-- 인덱스 생성
CREATE INDEX idx_employee_payroll_settings_employee ON public.employee_payroll_settings(employee_id);
CREATE INDEX idx_employee_payroll_settings_org ON public.employee_payroll_settings(organization_id);

-- RLS 활성화
ALTER TABLE public.employee_payroll_settings ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 조직 관리자만 CRUD 가능
CREATE POLICY "Admins can view employee payroll settings"
ON public.employee_payroll_settings
FOR SELECT
USING (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can insert employee payroll settings"
ON public.employee_payroll_settings
FOR INSERT
WITH CHECK (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update employee payroll settings"
ON public.employee_payroll_settings
FOR UPDATE
USING (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete employee payroll settings"
ON public.employee_payroll_settings
FOR DELETE
USING (is_org_admin(auth.uid(), organization_id));

-- updated_at 자동 업데이트 트리거
CREATE TRIGGER update_employee_payroll_settings_updated_at
BEFORE UPDATE ON public.employee_payroll_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 테이블 코멘트
COMMENT ON TABLE public.employee_payroll_settings IS '직원별 급여항목 오버라이드 설정 (조직 기본값 대신 사용)';
COMMENT ON COLUMN public.employee_payroll_settings.payment_items IS '직원별 지급항목 오버라이드 (JSON 배열)';
COMMENT ON COLUMN public.employee_payroll_settings.deduction_items IS '직원별 공제항목 오버라이드 (JSON 배열)';