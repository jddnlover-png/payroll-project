
-- Table to store monthly variable allowances for monthly-pay employees
CREATE TABLE public.monthly_variable_allowances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_year integer NOT NULL,
  period_month integer NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  memo text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(organization_id, employee_id, period_year, period_month)
);

ALTER TABLE public.monthly_variable_allowances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view monthly variable allowances"
ON public.monthly_variable_allowances FOR SELECT
TO authenticated
USING (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can insert monthly variable allowances"
ON public.monthly_variable_allowances FOR INSERT
TO authenticated
WITH CHECK (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update monthly variable allowances"
ON public.monthly_variable_allowances FOR UPDATE
TO authenticated
USING (is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete monthly variable allowances"
ON public.monthly_variable_allowances FOR DELETE
TO authenticated
USING (is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER update_monthly_variable_allowances_updated_at
BEFORE UPDATE ON public.monthly_variable_allowances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
