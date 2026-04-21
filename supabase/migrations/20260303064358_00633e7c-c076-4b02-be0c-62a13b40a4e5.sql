
-- Add is_default column to departments and positions
ALTER TABLE public.departments ADD COLUMN is_default boolean NOT NULL DEFAULT false;
ALTER TABLE public.positions ADD COLUMN is_default boolean NOT NULL DEFAULT false;

-- Insert default dept/position for all existing organizations that don't have one
INSERT INTO public.departments (organization_id, name, sort_order, is_default)
SELECT o.id, '기본부서', 0, true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.departments d WHERE d.organization_id = o.id AND d.is_default = true
);

INSERT INTO public.positions (organization_id, name, sort_order, is_default)
SELECT o.id, '미지정', 0, true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.positions p WHERE p.organization_id = o.id AND p.is_default = true
);

-- Prevent deletion of default departments
CREATE OR REPLACE FUNCTION public.prevent_default_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_default = true THEN
    RAISE EXCEPTION 'Cannot delete default item';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER prevent_default_department_delete
BEFORE DELETE ON public.departments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_default_delete();

CREATE TRIGGER prevent_default_position_delete
BEFORE DELETE ON public.positions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_default_delete();

-- Update create_organization_with_owner to also create defaults
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(_name text, _business_number text DEFAULT NULL::text, _representative text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _org_id uuid;
    _user_id uuid;
BEGIN
    _user_id := auth.uid();
    
    IF _user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- 1. 조직 생성
    INSERT INTO public.organizations (name, business_number, representative)
    VALUES (_name, _business_number, _representative)
    RETURNING id INTO _org_id;
    
    -- 2. 조직 멤버로 등록 (owner)
    INSERT INTO public.organization_members (organization_id, user_id, is_owner)
    VALUES (_org_id, _user_id, true);
    
    -- 3. 관리자 역할 부여
    INSERT INTO public.user_roles (organization_id, user_id, role)
    VALUES (_org_id, _user_id, 'admin');
    
    -- 4. 기본 급여 설정 생성
    INSERT INTO public.payroll_settings (organization_id, payment_items, deduction_items)
    VALUES (
        _org_id,
        '[{"id":"base","name":"기본급","type":"fixed","isActive":true},{"id":"overtime","name":"연장근로수당","type":"calculated","isActive":true},{"id":"bonus","name":"상여금","type":"variable","isActive":true}]'::jsonb,
        '[{"id":"income_tax","name":"소득세","type":"calculated","isActive":true},{"id":"local_tax","name":"지방소득세","type":"calculated","isActive":true},{"id":"national_pension","name":"국민연금","type":"calculated","isActive":true},{"id":"health_insurance","name":"건강보험","type":"calculated","isActive":true},{"id":"employment_insurance","name":"고용보험","type":"calculated","isActive":true}]'::jsonb
    );
    
    -- 5. 기본 부서 생성
    INSERT INTO public.departments (organization_id, name, sort_order, is_default)
    VALUES (_org_id, '기본부서', 0, true);
    
    -- 6. 기본 직급 생성
    INSERT INTO public.positions (organization_id, name, sort_order, is_default)
    VALUES (_org_id, '미지정', 0, true);
    
    RETURN _org_id;
END;
$function$;
