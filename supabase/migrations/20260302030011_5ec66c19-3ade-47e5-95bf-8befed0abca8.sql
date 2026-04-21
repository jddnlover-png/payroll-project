
-- 부서 관리 테이블
CREATE TABLE public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view departments" ON public.departments FOR SELECT USING (is_organization_member(auth.uid(), organization_id));
CREATE POLICY "Admins can insert departments" ON public.departments FOR INSERT WITH CHECK (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can update departments" ON public.departments FOR UPDATE USING (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can delete departments" ON public.departments FOR DELETE USING (is_org_admin(auth.uid(), organization_id));

CREATE UNIQUE INDEX idx_departments_org_name ON public.departments(organization_id, name);

-- 직급 관리 테이블
CREATE TABLE public.positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view positions" ON public.positions FOR SELECT USING (is_organization_member(auth.uid(), organization_id));
CREATE POLICY "Admins can insert positions" ON public.positions FOR INSERT WITH CHECK (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can update positions" ON public.positions FOR UPDATE USING (is_org_admin(auth.uid(), organization_id));
CREATE POLICY "Admins can delete positions" ON public.positions FOR DELETE USING (is_org_admin(auth.uid(), organization_id));

CREATE UNIQUE INDEX idx_positions_org_name ON public.positions(organization_id, name);
