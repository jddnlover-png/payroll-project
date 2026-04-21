
-- 1. daily_payroll_settings: 비과세 항목 활성/비활성 설정 + 생산직 비과세 여부
ALTER TABLE public.daily_payroll_settings
  ADD COLUMN IF NOT EXISTS enable_meal_allowance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_vehicle_allowance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_extra_non_taxable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_non_taxable_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS production_worker_tax_exempt boolean NOT NULL DEFAULT true;

-- 2. daily_attendance: 비과세 수당 금액 저장 컬럼
ALTER TABLE public.daily_attendance
  ADD COLUMN IF NOT EXISTS meal_allowance_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vehicle_allowance_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_non_taxable_allowance_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_non_taxable_allowance_name text;
