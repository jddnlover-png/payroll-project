
ALTER TABLE public.organization_settings 
ADD COLUMN IF NOT EXISTS work_day_list text[] NOT NULL DEFAULT ARRAY['MON','TUE','WED','THU','FRI'];

-- Backfill existing 6-day work settings
UPDATE public.organization_settings 
SET work_day_list = ARRAY['MON','TUE','WED','THU','FRI','SAT']
WHERE work_days = 6;
