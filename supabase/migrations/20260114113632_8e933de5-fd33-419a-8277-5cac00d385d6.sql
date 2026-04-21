-- Fix 1: Limit organization creation (addresses SUPA_rls_policy_always_true and org_creation_permissive)
-- Create function to check if user can create more organizations
CREATE OR REPLACE FUNCTION public.can_create_organization(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (
        SELECT COUNT(*) 
        FROM public.organization_members
        WHERE user_id = _user_id AND is_owner = true
    ) < 5  -- Max 5 organizations per user
$$;

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;

-- Create new rate-limited policy
CREATE POLICY "Authenticated users can create limited organizations"
ON public.organizations FOR INSERT
TO authenticated
WITH CHECK (public.can_create_organization(auth.uid()));

-- Fix 2: Restrict attendance records to admin-only view (addresses attendance_member_access)
DROP POLICY IF EXISTS "Members can view attendance" ON public.attendance_records;

CREATE POLICY "Only admins can view attendance"
ON public.attendance_records FOR SELECT
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

-- Fix 3: Restrict leave records to admin-only view (addresses attendance_member_access)
DROP POLICY IF EXISTS "Members can view leave records" ON public.leave_records;

CREATE POLICY "Only admins can view leave records"
ON public.leave_records FOR SELECT
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));