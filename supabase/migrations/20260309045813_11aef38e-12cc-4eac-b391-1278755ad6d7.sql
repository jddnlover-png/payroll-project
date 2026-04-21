
-- Add employee_size and phone_number to organizations
ALTER TABLE public.organizations
ADD COLUMN employee_size text,
ADD COLUMN phone_number text;
