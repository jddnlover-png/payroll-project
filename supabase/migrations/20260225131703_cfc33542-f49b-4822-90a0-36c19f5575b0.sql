
ALTER TABLE public.organization_settings 
ADD COLUMN checkout_threshold integer NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.organization_settings.checkout_threshold IS 'Minutes after standard end time that still count as on-time checkout';
