-- 조직 생성 RPC 함수 생성 (SECURITY DEFINER로 모든 작업 수행)
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
    _name text,
    _business_number text DEFAULT NULL,
    _representative text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _org_id uuid;
    _user_id uuid;
BEGIN
    -- 현재 사용자 ID 가져오기
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
    
    RETURN _org_id;
END;
$$;