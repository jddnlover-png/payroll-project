
-- 일일 급여 스냅샷 테이블: 계산 시점의 시급/배율을 함께 저장
CREATE TABLE public.daily_wage_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_record_id uuid REFERENCES public.attendance_records(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  -- 스냅샷: 계산 당시의 시급/일급/급여유형
  hourly_rate numeric DEFAULT 0,
  daily_rate numeric DEFAULT 0,
  pay_type text NOT NULL DEFAULT 'hourly',
  -- 스냅샷: 계산 당시의 배율 설정
  overtime_multiplier numeric NOT NULL DEFAULT 1.5,
  night_shift_multiplier numeric NOT NULL DEFAULT 0.5,
  standard_work_hours integer NOT NULL DEFAULT 8,
  -- 근무시간 세부 (분 단위)
  regular_minutes integer NOT NULL DEFAULT 0,
  overtime_minutes integer NOT NULL DEFAULT 0,
  night_minutes integer NOT NULL DEFAULT 0,
  night_shift_minutes integer NOT NULL DEFAULT 0,
  -- 산출 금액
  base_wage numeric NOT NULL DEFAULT 0,
  overtime_pay numeric NOT NULL DEFAULT 0,
  night_pay numeric NOT NULL DEFAULT 0,
  total_wage numeric NOT NULL DEFAULT 0,
  -- 메타
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, employee_id, work_date)
);

-- RLS 활성화
ALTER TABLE public.daily_wage_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS 정책
CREATE POLICY "Admins can view daily wage snapshots"
  ON public.daily_wage_snapshots FOR SELECT TO authenticated
  USING (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can insert daily wage snapshots"
  ON public.daily_wage_snapshots FOR INSERT TO authenticated
  WITH CHECK (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update daily wage snapshots"
  ON public.daily_wage_snapshots FOR UPDATE TO authenticated
  USING (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete daily wage snapshots"
  ON public.daily_wage_snapshots FOR DELETE TO authenticated
  USING (is_org_admin(auth.uid(), organization_id));
