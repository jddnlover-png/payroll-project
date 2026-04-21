
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS shift_tier1_break_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift_tier2_break_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift_tier3_break_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE public.daily_wage_snapshots
  ADD COLUMN IF NOT EXISTS tier1_break_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier2_break_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier3_break_minutes integer NOT NULL DEFAULT 0;
