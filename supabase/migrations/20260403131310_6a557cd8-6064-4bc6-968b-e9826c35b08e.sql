ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS holiday_hours numeric DEFAULT 0;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS holiday_pay integer DEFAULT 0;