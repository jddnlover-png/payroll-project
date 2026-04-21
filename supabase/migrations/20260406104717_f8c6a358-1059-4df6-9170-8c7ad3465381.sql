
ALTER TABLE public.weekly_holiday_pay_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view weekly holiday pay records"
ON public.weekly_holiday_pay_records
FOR SELECT
TO authenticated
USING (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can insert weekly holiday pay records"
ON public.weekly_holiday_pay_records
FOR INSERT
TO authenticated
WITH CHECK (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update weekly holiday pay records"
ON public.weekly_holiday_pay_records
FOR UPDATE
TO authenticated
USING (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete weekly holiday pay records"
ON public.weekly_holiday_pay_records
FOR DELETE
TO authenticated
USING (is_org_admin(auth.uid(), organization_id));
