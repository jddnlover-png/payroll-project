-- Add unique constraint for upsert on attendance_records
-- This ensures only one attendance record per employee per date per organization
ALTER TABLE public.attendance_records
ADD CONSTRAINT attendance_records_org_employee_date_unique 
UNIQUE (organization_id, employee_id, date);