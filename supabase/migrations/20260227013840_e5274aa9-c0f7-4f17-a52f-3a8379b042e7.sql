
ALTER TABLE public.organization_settings
ADD COLUMN shift_tier1_multiplier numeric NOT NULL DEFAULT 1.5,
ADD COLUMN shift_tier1_start text NOT NULL DEFAULT '22:00',
ADD COLUMN shift_tier1_end text NOT NULL DEFAULT '06:00',
ADD COLUMN shift_tier2_multiplier numeric NOT NULL DEFAULT 2.0,
ADD COLUMN shift_tier2_start text NOT NULL DEFAULT '00:00',
ADD COLUMN shift_tier2_end text NOT NULL DEFAULT '04:00',
ADD COLUMN shift_tier3_multiplier numeric NOT NULL DEFAULT 2.5,
ADD COLUMN shift_tier3_start text NOT NULL DEFAULT '04:00',
ADD COLUMN shift_tier3_end text NOT NULL DEFAULT '06:00';
