-- Update the can_create_organization function to properly handle new users
CREATE OR REPLACE FUNCTION public.can_create_organization(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT COUNT(*) 
            FROM public.organization_members
            WHERE user_id = _user_id AND is_owner = true
        ),
        0
    ) < 5
$$;