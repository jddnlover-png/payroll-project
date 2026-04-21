-- Add tier4 columns to organization_settings
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS shift_tier4_multiplier numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS shift_tier4_break_minutes integer NOT NULL DEFAULT 0;

-- Add shift_pay_4 to salary_details
ALTER TABLE public.salary_details
  ADD COLUMN IF NOT EXISTS shift_pay_4 numeric NOT NULL DEFAULT 0;

-- Add tier4 columns to daily_wage_snapshots
ALTER TABLE public.daily_wage_snapshots
  ADD COLUMN IF NOT EXISTS tier4_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier4_pay integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier4_multiplier numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS tier4_break_minutes integer NOT NULL DEFAULT 0;