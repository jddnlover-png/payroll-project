-- 트리거 제거 (auth.uid()가 트리거 컨텍스트에서 null을 반환하기 때문)
DROP TRIGGER IF EXISTS on_organization_created ON public.organizations;

-- organization_members INSERT 정책 업데이트: 자기 자신을 멤버로 추가할 수 있도록 허용
DROP POLICY IF EXISTS "Admins can manage organization members" ON public.organization_members;
CREATE POLICY "Users can add themselves as members"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- user_roles INSERT 정책 업데이트: 자기 자신에게 역할을 부여할 수 있도록 허용 (조직 생성 시)
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Users can add their own roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- payroll_settings INSERT 정책 업데이트: 조직 멤버도 기본 설정을 생성할 수 있도록
DROP POLICY IF EXISTS "Admins can insert payroll settings" ON public.payroll_settings;
CREATE POLICY "Members can insert payroll settings"
ON public.payroll_settings
FOR INSERT
TO authenticated
WITH CHECK (is_organization_member(auth.uid(), organization_id));