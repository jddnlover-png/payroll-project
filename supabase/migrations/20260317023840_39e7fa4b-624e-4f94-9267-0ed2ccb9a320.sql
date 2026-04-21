
-- Add salary and work schedule settings to organization_settings
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS salary_calc_start_day integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS salary_calc_end_day integer NOT NULL DEFAULT 31,
  ADD COLUMN IF NOT EXISTS salary_payment_month text NOT NULL DEFAULT 'current_month',
  ADD COLUMN IF NOT EXISTS salary_payment_day integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS work_days integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS weekly_holiday text NOT NULL DEFAULT 'sun',
  ADD COLUMN IF NOT EXISTS weekly_work_hours integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS apply_public_holiday boolean NOT NULL DEFAULT true;
