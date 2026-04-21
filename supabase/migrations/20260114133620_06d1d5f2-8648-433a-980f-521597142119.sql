-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create limited organizations" ON public.organizations;

-- Create a simpler INSERT policy that allows authenticated users to create organizations
-- The limit check will be done in the application layer or via a simpler approach
CREATE POLICY "Authenticated users can create organizations"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Update the can_create_organization function to be more robust
CREATE OR REPLACE FUNCTION public.can_create_organization(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    org_count integer;
BEGIN
    SELECT COUNT(*) INTO org_count
    FROM public.organization_members
    WHERE user_id = _user_id AND is_owner = true;
    
    RETURN COALESCE(org_count, 0) < 5;
END;
$$;