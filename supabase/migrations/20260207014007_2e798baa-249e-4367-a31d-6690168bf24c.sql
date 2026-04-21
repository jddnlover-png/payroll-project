
-- 근태 수정 이력 테이블 생성
CREATE TABLE public.attendance_edit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attendance_record_id UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  edited_by UUID NOT NULL,
  edited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- 변경 전 값
  previous_check_in TIMESTAMP WITH TIME ZONE,
  previous_check_out TIMESTAMP WITH TIME ZONE,
  previous_status TEXT,
  -- 변경 후 값
  new_check_in TIMESTAMP WITH TIME ZONE,
  new_check_out TIMESTAMP WITH TIME ZONE,
  new_status TEXT,
  -- 수정 사유 (필수)
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS 활성화
ALTER TABLE public.attendance_edit_logs ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 관리자만 조회 가능
CREATE POLICY "Admins can view edit logs"
ON public.attendance_edit_logs
FOR SELECT
USING (is_org_admin(auth.uid(), organization_id));

-- RLS 정책: 관리자만 삽입 가능
CREATE POLICY "Admins can insert edit logs"
ON public.attendance_edit_logs
FOR INSERT
WITH CHECK (is_org_admin(auth.uid(), organization_id));

-- 인덱스 생성
CREATE INDEX idx_attendance_edit_logs_record ON public.attendance_edit_logs(attendance_record_id);
CREATE INDEX idx_attendance_edit_logs_employee ON public.attendance_edit_logs(employee_id);
CREATE INDEX idx_attendance_edit_logs_org ON public.attendance_edit_logs(organization_id);
