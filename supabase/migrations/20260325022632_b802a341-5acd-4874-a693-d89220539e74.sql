
-- 1. construction_sites 테이블
CREATE TABLE public.construction_sites (
  site_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  site_name VARCHAR NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (organization_id, site_name)
);

ALTER TABLE public.construction_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view construction sites" ON public.construction_sites
  FOR SELECT TO authenticated USING (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can insert construction sites" ON public.construction_sites
  FOR INSERT TO authenticated WITH CHECK (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can update construction sites" ON public.construction_sites
  FOR UPDATE TO authenticated USING (is_org_admin(auth.uid(), organization_id));

-- 2. daily_attendance 테이블
CREATE TABLE public.daily_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.construction_sites(site_id),
  worker_name VARCHAR NOT NULL,
  ssn_encrypted TEXT,
  ssn_masked VARCHAR,
  ssn_last4 VARCHAR(4),
  phone VARCHAR,
  work_date DATE NOT NULL,
  work_type TEXT NOT NULL DEFAULT 'fixed',
  start_time TIME,
  end_time TIME,
  work_hours NUMERIC,
  work_minutes INTEGER NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  daily_wage INTEGER NOT NULL,
  calculated_pay INTEGER NOT NULL,
  final_pay INTEGER NOT NULL,
  adjustment_memo TEXT DEFAULT '',
  regular_hours NUMERIC DEFAULT 0,
  overtime_hours NUMERIC DEFAULT 0,
  night_hours NUMERIC DEFAULT 0,
  overtime_pay INTEGER DEFAULT 0,
  night_pay INTEGER DEFAULT 0,
  fingerprint VARCHAR NOT NULL,
  calculation_snapshot JSONB NOT NULL,
  memo TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (organization_id, fingerprint)
);

ALTER TABLE public.daily_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view daily attendance" ON public.daily_attendance
  FOR SELECT TO authenticated USING (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can insert daily attendance" ON public.daily_attendance
  FOR INSERT TO authenticated WITH CHECK (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can update daily attendance" ON public.daily_attendance
  FOR UPDATE TO authenticated USING (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can delete daily attendance" ON public.daily_attendance
  FOR DELETE TO authenticated USING (is_org_admin(auth.uid(), organization_id));

-- 3. 인덱스
CREATE INDEX idx_daily_attendance_site_date ON public.daily_attendance (site_id, work_date);
CREATE INDEX idx_daily_attendance_worker_date ON public.daily_attendance (worker_name, work_date);
CREATE INDEX idx_daily_attendance_ssn_org ON public.daily_attendance (ssn_last4, organization_id);
