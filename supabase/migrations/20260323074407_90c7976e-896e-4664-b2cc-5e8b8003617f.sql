
ALTER TABLE public.salary_details
  ADD COLUMN IF NOT EXISTS hol_shift_t1_pay numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hol_shift_t2_pay numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hol_shift_t3_pay numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hol_shift_t4_pay numeric NOT NULL DEFAULT 0;
