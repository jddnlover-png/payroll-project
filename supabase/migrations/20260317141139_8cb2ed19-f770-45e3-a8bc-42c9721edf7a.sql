
-- Add holiday premium and weekly holiday pay settings
ALTER TABLE public.organization_settings
  ADD COLUMN holiday_alpha_8h numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN holiday_alpha_ot numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN weekly_hol_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN weekly_hol_hours integer NOT NULL DEFAULT 8,
  ADD COLUMN weekly_hol_rate numeric NOT NULL DEFAULT 1.0;
