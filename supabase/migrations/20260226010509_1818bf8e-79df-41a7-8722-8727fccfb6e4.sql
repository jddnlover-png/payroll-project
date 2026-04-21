
ALTER TABLE public.organization_settings
ADD COLUMN overtime_break_2h integer NOT NULL DEFAULT 30,
ADD COLUMN overtime_break_4h integer NOT NULL DEFAULT 60;
