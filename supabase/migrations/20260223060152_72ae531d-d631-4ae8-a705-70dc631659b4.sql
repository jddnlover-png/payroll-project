
ALTER TABLE public.organization_settings
ADD COLUMN break_start_time text NOT NULL DEFAULT '12:00',
ADD COLUMN break_end_time text NOT NULL DEFAULT '13:00';
