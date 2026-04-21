-- Fix: Restrict employee SELECT to admins only (PII protection)
DROP POLICY IF EXISTS "Members can view employees" ON public.employees;

CREATE POLICY "Admins can view employees"
ON public.employees FOR SELECT
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));