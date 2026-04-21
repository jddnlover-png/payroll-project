
DROP POLICY "Anyone can read payslip tokens by token value" ON public.payslip_tokens;
DROP POLICY "Admins can manage payslip tokens" ON public.payslip_tokens;

CREATE POLICY "Admins can manage payslip tokens"
ON public.payslip_tokens
FOR ALL
TO authenticated
USING (public.is_org_admin(auth.uid(), organization_id))
WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Anyone can read payslip tokens by token value"
ON public.payslip_tokens
FOR SELECT
TO anon, authenticated
USING (true);
