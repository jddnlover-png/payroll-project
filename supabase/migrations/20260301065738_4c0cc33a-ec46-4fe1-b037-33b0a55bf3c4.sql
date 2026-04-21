
ALTER TABLE public.organization_settings
ADD COLUMN shift_late_threshold integer NOT NULL DEFAULT 20,
ADD COLUMN shift_checkout_threshold integer NOT NULL DEFAULT 20;

COMMENT ON COLUMN public.organization_settings.shift_late_threshold IS '야간 교대근무 지각 기준 (분)';
COMMENT ON COLUMN public.organization_settings.shift_checkout_threshold IS '야간 교대근무 퇴근 기준 (분)';
