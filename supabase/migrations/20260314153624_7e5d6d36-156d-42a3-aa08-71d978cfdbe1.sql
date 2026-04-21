
ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS regular_work_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_work_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_shift_minutes integer DEFAULT 0;
