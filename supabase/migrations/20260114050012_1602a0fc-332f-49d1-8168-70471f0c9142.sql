-- ========================================
-- SaaS Multi-tenant 구조 데이터베이스 스키마
-- ========================================

-- 1. 역할 Enum 생성
CREATE TYPE public.app_role AS ENUM ('admin', 'member');

-- 2. 고용형태 Enum 생성
CREATE TYPE public.employment_type AS ENUM ('regular', 'contract', 'daily');

-- 3. 급여타입 Enum 생성
CREATE TYPE public.pay_type AS ENUM ('monthly', 'hourly', 'daily');

-- 4. 근태상태 Enum 생성
CREATE TYPE public.attendance_status AS ENUM ('present', 'late', 'absent', 'leave', 'half_day');

-- ========================================
-- 조직(테넌트) 테이블
-- ========================================
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    business_number TEXT,
    representative TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 조직 RLS 활성화
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 사용자 프로필 테이블
-- ========================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 프로필 RLS 활성화
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 조직 멤버십 테이블 (다중 조직 지원)
-- ========================================
CREATE TABLE public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_owner BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

-- 멤버십 RLS 활성화
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 사용자 역할 테이블 (조직별 역할)
-- ========================================
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role public.app_role NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, organization_id)
);

-- 역할 RLS 활성화
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 직원 테이블 (조직별)
-- ========================================
CREATE TABLE public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_number TEXT NOT NULL,
    name TEXT NOT NULL,
    department TEXT,
    position TEXT,
    email TEXT,
    phone TEXT,
    resident_number TEXT,
    employment_type public.employment_type NOT NULL DEFAULT 'regular',
    hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
    base_salary NUMERIC(12, 0) NOT NULL DEFAULT 0,
    pay_type public.pay_type NOT NULL DEFAULT 'monthly',
    hourly_rate NUMERIC(10, 0),
    daily_rate NUMERIC(10, 0),
    bank_name TEXT,
    account_number TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id, employee_number)
);

-- 직원 RLS 활성화
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 근태 기록 테이블 (조직별)
-- ========================================
CREATE TABLE public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    check_in TIMESTAMPTZ,
    check_out TIMESTAMPTZ,
    status public.attendance_status NOT NULL DEFAULT 'present',
    overtime_hours NUMERIC(4, 1) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(employee_id, date)
);

-- 근태 RLS 활성화
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 휴가 기록 테이블 (조직별)
-- ========================================
CREATE TABLE public.leave_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days NUMERIC(4, 1) NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'approved',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 휴가 RLS 활성화
ALTER TABLE public.leave_records ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 급여 기록 테이블 (조직별)
-- ========================================
CREATE TABLE public.payroll_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    base_salary NUMERIC(12, 0) NOT NULL DEFAULT 0,
    total_payments NUMERIC(12, 0) NOT NULL DEFAULT 0,
    total_deductions NUMERIC(12, 0) NOT NULL DEFAULT 0,
    net_salary NUMERIC(12, 0) NOT NULL DEFAULT 0,
    payment_items JSONB DEFAULT '[]'::jsonb,
    deduction_items JSONB DEFAULT '[]'::jsonb,
    working_days INTEGER DEFAULT 0,
    overtime_hours NUMERIC(5, 1) DEFAULT 0,
    status TEXT DEFAULT 'draft',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(employee_id, period_year, period_month)
);

-- 급여 RLS 활성화
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 급여 설정 테이블 (조직별)
-- ========================================
CREATE TABLE public.payroll_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
    payment_items JSONB DEFAULT '[]'::jsonb,
    deduction_items JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 급여설정 RLS 활성화
ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;

-- ========================================
-- Security Definer 함수들
-- ========================================

-- 사용자가 조직의 멤버인지 확인
CREATE OR REPLACE FUNCTION public.is_organization_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = _user_id AND organization_id = _org_id
    )
$$;

-- 사용자가 조직에서 특정 역할을 가지는지 확인
CREATE OR REPLACE FUNCTION public.has_role_in_org(_user_id UUID, _org_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id 
          AND organization_id = _org_id 
          AND role = _role
    )
$$;

-- 사용자가 조직의 관리자인지 확인
CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id 
          AND organization_id = _org_id 
          AND role = 'admin'
    )
$$;

-- ========================================
-- RLS 정책들
-- ========================================

-- 프로필: 자기 프로필만 CRUD
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 조직: 멤버만 조회, 관리자만 수정
CREATE POLICY "Members can view their organizations"
ON public.organizations FOR SELECT
TO authenticated
USING (public.is_organization_member(auth.uid(), id));

CREATE POLICY "Admins can update their organizations"
ON public.organizations FOR UPDATE
TO authenticated
USING (public.is_org_admin(auth.uid(), id));

CREATE POLICY "Authenticated users can create organizations"
ON public.organizations FOR INSERT
TO authenticated
WITH CHECK (true);

-- 멤버십: 같은 조직 멤버만 조회, 관리자만 관리
CREATE POLICY "Members can view organization members"
ON public.organization_members FOR SELECT
TO authenticated
USING (public.is_organization_member(auth.uid(), organization_id));

CREATE POLICY "Admins can manage organization members"
ON public.organization_members FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR user_id = auth.uid());

CREATE POLICY "Admins can delete organization members"
ON public.organization_members FOR DELETE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

-- 역할: 같은 조직 멤버만 조회, 관리자만 관리
CREATE POLICY "Members can view roles in their org"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.is_organization_member(auth.uid(), organization_id));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR user_id = auth.uid());

CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

-- 직원: 같은 조직 멤버만 조회, 관리자만 수정/삭제
CREATE POLICY "Members can view employees"
ON public.employees FOR SELECT
TO authenticated
USING (public.is_organization_member(auth.uid(), organization_id));

CREATE POLICY "Admins can insert employees"
ON public.employees FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update employees"
ON public.employees FOR UPDATE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete employees"
ON public.employees FOR DELETE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

-- 근태: 같은 조직 멤버만 조회, 관리자만 수정
CREATE POLICY "Members can view attendance"
ON public.attendance_records FOR SELECT
TO authenticated
USING (public.is_organization_member(auth.uid(), organization_id));

CREATE POLICY "Admins can insert attendance"
ON public.attendance_records FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update attendance"
ON public.attendance_records FOR UPDATE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete attendance"
ON public.attendance_records FOR DELETE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

-- 휴가: 같은 조직 멤버만 조회, 관리자만 수정
CREATE POLICY "Members can view leave records"
ON public.leave_records FOR SELECT
TO authenticated
USING (public.is_organization_member(auth.uid(), organization_id));

CREATE POLICY "Admins can insert leave records"
ON public.leave_records FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update leave records"
ON public.leave_records FOR UPDATE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete leave records"
ON public.leave_records FOR DELETE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

-- 급여: 같은 조직 멤버만 조회, 관리자만 수정
CREATE POLICY "Members can view payroll"
ON public.payroll_records FOR SELECT
TO authenticated
USING (public.is_organization_member(auth.uid(), organization_id));

CREATE POLICY "Admins can insert payroll"
ON public.payroll_records FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update payroll"
ON public.payroll_records FOR UPDATE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete payroll"
ON public.payroll_records FOR DELETE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

-- 급여설정: 같은 조직 멤버만 조회, 관리자만 수정
CREATE POLICY "Members can view payroll settings"
ON public.payroll_settings FOR SELECT
TO authenticated
USING (public.is_organization_member(auth.uid(), organization_id));

CREATE POLICY "Admins can insert payroll settings"
ON public.payroll_settings FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update payroll settings"
ON public.payroll_settings FOR UPDATE
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id));

-- ========================================
-- 트리거: updated_at 자동 갱신
-- ========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_attendance_updated_at
BEFORE UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leave_updated_at
BEFORE UPDATE ON public.leave_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payroll_updated_at
BEFORE UPDATE ON public.payroll_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payroll_settings_updated_at
BEFORE UPDATE ON public.payroll_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========================================
-- 트리거: 새 사용자 프로필 자동 생성
-- ========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================
-- 트리거: 조직 생성 시 멤버십과 역할 자동 설정
-- ========================================
CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS TRIGGER AS $$
BEGIN
    -- 생성자를 멤버로 추가 (owner)
    INSERT INTO public.organization_members (organization_id, user_id, is_owner)
    VALUES (NEW.id, auth.uid(), true);
    
    -- 생성자에게 admin 역할 부여
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (auth.uid(), NEW.id, 'admin');
    
    -- 기본 급여설정 생성
    INSERT INTO public.payroll_settings (organization_id, payment_items, deduction_items)
    VALUES (NEW.id, 
        '[{"id":"base","name":"기본급","type":"fixed","isActive":true},{"id":"overtime","name":"연장근로수당","type":"calculated","isActive":true},{"id":"bonus","name":"상여금","type":"variable","isActive":true}]'::jsonb,
        '[{"id":"income_tax","name":"소득세","type":"calculated","isActive":true},{"id":"local_tax","name":"지방소득세","type":"calculated","isActive":true},{"id":"national_pension","name":"국민연금","type":"calculated","isActive":true},{"id":"health_insurance","name":"건강보험","type":"calculated","isActive":true},{"id":"employment_insurance","name":"고용보험","type":"calculated","isActive":true}]'::jsonb
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_organization_created
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization();