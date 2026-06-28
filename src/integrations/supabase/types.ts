export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      annual_leave_payouts: {
  Row: {
    created_at: string
    days: number
    employee_id: string
    id: string
    note: string | null
    organization_id: string
    settlement_month: string
    updated_at: string
  }
  Insert: {
    created_at?: string
    days?: number
    employee_id: string
    id?: string
    note?: string | null
    organization_id: string
    settlement_month: string
    updated_at?: string
  }
  Update: {
    created_at?: string
    days?: number
    employee_id?: string
    id?: string
    note?: string | null
    organization_id?: string
    settlement_month?: string
    updated_at?: string
  }
  Relationships: [
    {
      foreignKeyName: "annual_leave_payouts_employee_id_fkey"
      columns: ["employee_id"]
      isOneToOne: false
      referencedRelation: "employees"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "annual_leave_payouts_organization_id_fkey"
      columns: ["organization_id"]
      isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },
  ]
}
      attendance_edit_logs: {
        Row: {
          attendance_record_id: string
          created_at: string
          edited_at: string
          edited_by: string
          employee_id: string
          id: string
          new_check_in: string | null
          new_check_out: string | null
          new_status: string | null
          organization_id: string
          previous_check_in: string | null
          previous_check_out: string | null
          previous_status: string | null
          reason: string
        }
        Insert: {
          attendance_record_id: string
          created_at?: string
          edited_at?: string
          edited_by: string
          employee_id: string
          id?: string
          new_check_in?: string | null
          new_check_out?: string | null
          new_status?: string | null
          organization_id: string
          previous_check_in?: string | null
          previous_check_out?: string | null
          previous_status?: string | null
          reason: string
        }
        Update: {
          attendance_record_id?: string
          created_at?: string
          edited_at?: string
          edited_by?: string
          employee_id?: string
          id?: string
          new_check_in?: string | null
          new_check_out?: string | null
          new_status?: string | null
          organization_id?: string
          previous_check_in?: string | null
          previous_check_out?: string | null
          previous_status?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_edit_logs_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_edit_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_edit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_lock: {
        Row: {
          created_at: string | null
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          site_id: string
          unlocked_at: string | null
          unlocked_by: string | null
          year_month: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          site_id: string
          unlocked_at?: string | null
          unlocked_by?: string | null
          year_month: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          site_id?: string
          unlocked_at?: string | null
          unlocked_by?: string | null
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_lock_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "construction_sites"
            referencedColumns: ["site_id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          actual_work_hours: number | null
          break_minutes: number | null
          check_in: string | null
          check_out: string | null
          created_at: string
          date: string
          employee_id: string
          id: string
          is_holiday: boolean | null
          night_hours: number | null
          notes: string | null
          organization_id: string
          overtime_hours: number | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
          work_type: string | null
        }
        Insert: {
          actual_work_hours?: number | null
          break_minutes?: number | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          date: string
          employee_id: string
          id?: string
          is_holiday?: boolean | null
          night_hours?: number | null
          notes?: string | null
          organization_id: string
          overtime_hours?: number | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          actual_work_hours?: number | null
          break_minutes?: number | null
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          is_holiday?: boolean | null
          night_hours?: number | null
          notes?: string | null
          organization_id?: string
          overtime_hours?: number | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_sites: {
        Row: {
          created_at: string | null
          end_date: string | null
          organization_id: string
          site_id: string
          site_name: string
          start_date: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          organization_id: string
          site_id?: string
          site_name: string
          start_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          organization_id?: string
          site_id?: string
          site_name?: string
          start_date?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "construction_sites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_attendance: {
        Row: {
          adjustment_memo: string | null
          break_minutes: number
          calculated_pay: number
          calculation_snapshot: Json
          created_at: string | null
          daily_wage: number
          employment_insurance: number | null
          end_time: string | null
          extra_non_taxable_allowance_amount: number
          extra_non_taxable_allowance_name: string | null
          final_pay: number
          fingerprint: string
          health_insurance: number | null
          holiday_hours: number | null
          holiday_pay: number | null
          id: string
          income_tax: number | null
          industrial_accident: number | null
          job_type: string | null
          local_income_tax: number | null
          long_term_care_insurance: number | null
          meal_allowance_amount: number
          memo: string | null
          national_pension: number | null
          net_pay: number | null
          night_hours: number | null
          night_pay: number | null
          organization_id: string
          overtime_hours: number | null
          overtime_pay: number | null
          phone: string | null
          regular_hours: number | null
          site_id: string
          ssn_encrypted: string | null
          ssn_last4: string | null
          ssn_masked: string | null
          start_time: string | null
          total_deductions: number | null
          vehicle_allowance_amount: number
          work_date: string
          work_hours: number | null
          work_minutes: number
          work_type: string
          worker_name: string
        }
        Insert: {
          adjustment_memo?: string | null
          break_minutes?: number
          calculated_pay: number
          calculation_snapshot: Json
          created_at?: string | null
          daily_wage: number
          employment_insurance?: number | null
          end_time?: string | null
          extra_non_taxable_allowance_amount?: number
          extra_non_taxable_allowance_name?: string | null
          final_pay: number
          fingerprint: string
          health_insurance?: number | null
          holiday_hours?: number | null
          holiday_pay?: number | null
          id?: string
          income_tax?: number | null
          industrial_accident?: number | null
          job_type?: string | null
          local_income_tax?: number | null
          long_term_care_insurance?: number | null
          meal_allowance_amount?: number
          memo?: string | null
          national_pension?: number | null
          net_pay?: number | null
          night_hours?: number | null
          night_pay?: number | null
          organization_id: string
          overtime_hours?: number | null
          overtime_pay?: number | null
          phone?: string | null
          regular_hours?: number | null
          site_id: string
          ssn_encrypted?: string | null
          ssn_last4?: string | null
          ssn_masked?: string | null
          start_time?: string | null
          total_deductions?: number | null
          vehicle_allowance_amount?: number
          work_date: string
          work_hours?: number | null
          work_minutes: number
          work_type?: string
          worker_name: string
        }
        Update: {
          adjustment_memo?: string | null
          break_minutes?: number
          calculated_pay?: number
          calculation_snapshot?: Json
          created_at?: string | null
          daily_wage?: number
          employment_insurance?: number | null
          end_time?: string | null
          extra_non_taxable_allowance_amount?: number
          extra_non_taxable_allowance_name?: string | null
          final_pay?: number
          fingerprint?: string
          health_insurance?: number | null
          holiday_hours?: number | null
          holiday_pay?: number | null
          id?: string
          income_tax?: number | null
          industrial_accident?: number | null
          job_type?: string | null
          local_income_tax?: number | null
          long_term_care_insurance?: number | null
          meal_allowance_amount?: number
          memo?: string | null
          national_pension?: number | null
          net_pay?: number | null
          night_hours?: number | null
          night_pay?: number | null
          organization_id?: string
          overtime_hours?: number | null
          overtime_pay?: number | null
          phone?: string | null
          regular_hours?: number | null
          site_id?: string
          ssn_encrypted?: string | null
          ssn_last4?: string | null
          ssn_masked?: string | null
          start_time?: string | null
          total_deductions?: number | null
          vehicle_allowance_amount?: number
          work_date?: string
          work_hours?: number | null
          work_minutes?: number
          work_type?: string
          worker_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "construction_sites"
            referencedColumns: ["site_id"]
          },
        ]
      }
      daily_payroll_records: {
        Row: {
          attendance_record_id: string | null
          base_daily_wage: number
          break_minutes: number
          created_at: string
          employee_id: string
          employment_insurance: number
          health_insurance: number
          id: string
          income_tax: number
          local_income_tax: number
          national_pension: number
          net_pay: number
          night_minutes: number
          night_pay: number
          organization_id: string
          overtime_minutes: number
          overtime_pay: number
          policy_deduction_minutes: number
          settlement_type: string
          status: string
          stay_minutes: number
          total_deductions: number
          total_wage: number
          updated_at: string
          work_date: string
          work_minutes: number
        }
        Insert: {
          attendance_record_id?: string | null
          base_daily_wage?: number
          break_minutes?: number
          created_at?: string
          employee_id: string
          employment_insurance?: number
          health_insurance?: number
          id?: string
          income_tax?: number
          local_income_tax?: number
          national_pension?: number
          net_pay?: number
          night_minutes?: number
          night_pay?: number
          organization_id: string
          overtime_minutes?: number
          overtime_pay?: number
          policy_deduction_minutes?: number
          settlement_type?: string
          status?: string
          stay_minutes?: number
          total_deductions?: number
          total_wage?: number
          updated_at?: string
          work_date: string
          work_minutes?: number
        }
        Update: {
          attendance_record_id?: string | null
          base_daily_wage?: number
          break_minutes?: number
          created_at?: string
          employee_id?: string
          employment_insurance?: number
          health_insurance?: number
          id?: string
          income_tax?: number
          local_income_tax?: number
          national_pension?: number
          net_pay?: number
          night_minutes?: number
          night_pay?: number
          organization_id?: string
          overtime_minutes?: number
          overtime_pay?: number
          policy_deduction_minutes?: number
          settlement_type?: string
          status?: string
          stay_minutes?: number
          total_deductions?: number
          total_wage?: number
          updated_at?: string
          work_date?: string
          work_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_payroll_records_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_payroll_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_payroll_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_payroll_settings: {
        Row: {
          apply_employment_insurance: boolean
          apply_health_insurance: boolean
          apply_industrial_accident_insurance: boolean
          apply_national_pension: boolean
          created_at: string
          default_settlement_type: string
          employment_insurance_rate: number
          enable_extra_non_taxable: boolean
          enable_meal_allowance: boolean
          enable_vehicle_allowance: boolean
          extra_non_taxable_name: string
          fixed_holiday_daily_wage: number | null
          health_insurance_rate: number
          holiday_minimum_enforce: boolean | null
          holiday_work_policy: string | null
          id: string
          industrial_accident_rate: number | null
          long_term_care_rate: number | null
          monthly_workday_warning: number
          national_pension_rate: number
          non_work_day_default_type: string
          organization_id: string
          payment_day: number | null
          production_worker_tax_exempt: boolean
          tax_exempt_limit: number
          updated_at: string
          wage_calc_method: string
          weekly_holiday: string | null
          weekly_work_day_list: string[] | null
          weekly_work_days: number | null
          weekly_work_hours: number | null
        }
        Insert: {
          apply_employment_insurance?: boolean
          apply_health_insurance?: boolean
          apply_industrial_accident_insurance?: boolean
          apply_national_pension?: boolean
          created_at?: string
          default_settlement_type?: string
          employment_insurance_rate?: number
          enable_extra_non_taxable?: boolean
          enable_meal_allowance?: boolean
          enable_vehicle_allowance?: boolean
          extra_non_taxable_name?: string
          fixed_holiday_daily_wage?: number | null
          health_insurance_rate?: number
          holiday_minimum_enforce?: boolean | null
          holiday_work_policy?: string | null
          id?: string
          industrial_accident_rate?: number | null
          long_term_care_rate?: number | null
          monthly_workday_warning?: number
          national_pension_rate?: number
          non_work_day_default_type?: string
          organization_id: string
          payment_day?: number | null
          production_worker_tax_exempt?: boolean
          tax_exempt_limit?: number
          updated_at?: string
          wage_calc_method?: string
          weekly_holiday?: string | null
          weekly_work_day_list?: string[] | null
          weekly_work_days?: number | null
          weekly_work_hours?: number | null
        }
        Update: {
          apply_employment_insurance?: boolean
          apply_health_insurance?: boolean
          apply_industrial_accident_insurance?: boolean
          apply_national_pension?: boolean
          created_at?: string
          default_settlement_type?: string
          employment_insurance_rate?: number
          enable_extra_non_taxable?: boolean
          enable_meal_allowance?: boolean
          enable_vehicle_allowance?: boolean
          extra_non_taxable_name?: string
          fixed_holiday_daily_wage?: number | null
          health_insurance_rate?: number
          holiday_minimum_enforce?: boolean | null
          holiday_work_policy?: string | null
          id?: string
          industrial_accident_rate?: number | null
          long_term_care_rate?: number | null
          monthly_workday_warning?: number
          national_pension_rate?: number
          non_work_day_default_type?: string
          organization_id?: string
          payment_day?: number | null
          production_worker_tax_exempt?: boolean
          tax_exempt_limit?: number
          updated_at?: string
          wage_calc_method?: string
          weekly_holiday?: string | null
          weekly_work_day_list?: string[] | null
          weekly_work_days?: number | null
          weekly_work_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_payroll_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_wage_snapshots: {
        Row: {
          attendance_record_id: string | null
          base_wage: number
          created_at: string
          daily_rate: number | null
          employee_id: string
          hourly_rate: number | null
          id: string
          night_minutes: number
          night_pay: number
          night_shift_minutes: number
          night_shift_multiplier: number
          organization_id: string
          overtime_minutes: number
          overtime_multiplier: number
          overtime_pay: number
          pay_type: string
          regular_minutes: number
          standard_work_hours: number
          tier1_break_minutes: number
          tier1_minutes: number
          tier1_multiplier: number
          tier1_pay: number
          tier2_break_minutes: number
          tier2_minutes: number
          tier2_multiplier: number
          tier2_pay: number
          tier3_break_minutes: number
          tier3_minutes: number
          tier3_multiplier: number
          tier3_pay: number
          tier4_break_minutes: number
          tier4_minutes: number
          tier4_multiplier: number
          tier4_pay: number
          total_wage: number
          updated_at: string
          work_date: string
        }
        Insert: {
          attendance_record_id?: string | null
          base_wage?: number
          created_at?: string
          daily_rate?: number | null
          employee_id: string
          hourly_rate?: number | null
          id?: string
          night_minutes?: number
          night_pay?: number
          night_shift_minutes?: number
          night_shift_multiplier?: number
          organization_id: string
          overtime_minutes?: number
          overtime_multiplier?: number
          overtime_pay?: number
          pay_type?: string
          regular_minutes?: number
          standard_work_hours?: number
          tier1_break_minutes?: number
          tier1_minutes?: number
          tier1_multiplier?: number
          tier1_pay?: number
          tier2_break_minutes?: number
          tier2_minutes?: number
          tier2_multiplier?: number
          tier2_pay?: number
          tier3_break_minutes?: number
          tier3_minutes?: number
          tier3_multiplier?: number
          tier3_pay?: number
          tier4_break_minutes?: number
          tier4_minutes?: number
          tier4_multiplier?: number
          tier4_pay?: number
          total_wage?: number
          updated_at?: string
          work_date: string
        }
        Update: {
          attendance_record_id?: string | null
          base_wage?: number
          created_at?: string
          daily_rate?: number | null
          employee_id?: string
          hourly_rate?: number | null
          id?: string
          night_minutes?: number
          night_pay?: number
          night_shift_minutes?: number
          night_shift_multiplier?: number
          organization_id?: string
          overtime_minutes?: number
          overtime_multiplier?: number
          overtime_pay?: number
          pay_type?: string
          regular_minutes?: number
          standard_work_hours?: number
          tier1_break_minutes?: number
          tier1_minutes?: number
          tier1_multiplier?: number
          tier1_pay?: number
          tier2_break_minutes?: number
          tier2_minutes?: number
          tier2_multiplier?: number
          tier2_pay?: number
          tier3_break_minutes?: number
          tier3_minutes?: number
          tier3_multiplier?: number
          tier3_pay?: number
          tier4_break_minutes?: number
          tier4_minutes?: number
          tier4_multiplier?: number
          tier4_pay?: number
          total_wage?: number
          updated_at?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_wage_snapshots_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_wage_snapshots_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_wage_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          organization_id: string
          parent_id: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          parent_id?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          parent_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payroll_settings: {
        Row: {
          created_at: string
          deduction_items: Json | null
          employee_id: string
          id: string
          organization_id: string
          payment_items: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deduction_items?: Json | null
          employee_id: string
          id?: string
          organization_id: string
          payment_items?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deduction_items?: Json | null
          employee_id?: string
          id?: string
          organization_id?: string
          payment_items?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_settings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
  Row: {
    account_number: string | null
    annual_leave_daily_amount: number
    bank_name: string | null
    base_salary: number
          children_aged_8_to_20: number | null
          created_at: string
          daily_rate: number | null
          department: string | null
          dependents: number | null
          email: string | null
          employee_number: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          hire_date: string
          hourly_rate: number | null
          id: string
          initial_carry_month: string | null
          initial_carry_weeks: number | null
          is_active: boolean | null
          job_category: string
          name: string
          organization_id: string
          pay_type: Database["public"]["Enums"]["pay_type"]
          phone: string | null
          position: string | null
          resident_number: string | null
resignation_date: string | null
settlement_type: string
long_term_care_reduction: boolean
updated_at: string
        }
        Insert: {
  account_number?: string | null
  annual_leave_daily_amount?: number
  bank_name?: string | null
  base_salary?: number
          children_aged_8_to_20?: number | null
          created_at?: string
          daily_rate?: number | null
          department?: string | null
          dependents?: number | null
          email?: string | null
          employee_number: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          hire_date?: string
          hourly_rate?: number | null
          id?: string
          initial_carry_month?: string | null
          initial_carry_weeks?: number | null
          is_active?: boolean | null
          job_category?: string
          name: string
          organization_id: string
          pay_type?: Database["public"]["Enums"]["pay_type"]
          phone?: string | null
          position?: string | null
          resident_number?: string | null
resignation_date?: string | null
settlement_type?: string
long_term_care_reduction?: boolean
updated_at?: string
        }
        Update: {
  account_number?: string | null
  annual_leave_daily_amount?: number
  bank_name?: string | null
  base_salary?: number
          children_aged_8_to_20?: number | null
          created_at?: string
          daily_rate?: number | null
          department?: string | null
          dependents?: number | null
          email?: string | null
          employee_number?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          hire_date?: string
          hourly_rate?: number | null
          id?: string
          initial_carry_month?: string | null
          initial_carry_weeks?: number | null
          is_active?: boolean | null
          job_category?: string
          name?: string
          organization_id?: string
          pay_type?: Database["public"]["Enums"]["pay_type"]
          phone?: string | null
          position?: string | null
          resident_number?: string | null
resignation_date?: string | null
settlement_type?: string
long_term_care_reduction?: boolean
updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_types: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_records: {
        Row: {
          created_at: string
          days: number
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          organization_id: string
          reason: string | null
          start_date: string
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          days: number
          employee_id: string
          end_date: string
          id?: string
          leave_type: string
          organization_id: string
          reason?: string | null
          start_date: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          days?: number
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          organization_id?: string
          reason?: string | null
          start_date?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_variable_allowances: {
        Row: {
          amount: number
          created_at: string
          employee_id: string
          id: string
          memo: string | null
          organization_id: string
          period_month: number
          period_year: number
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          employee_id: string
          id?: string
          memo?: string | null
          organization_id: string
          period_month: number
          period_year: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          employee_id?: string
          id?: string
          memo?: string | null
          organization_id?: string
          period_month?: number
          period_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_variable_allowances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_variable_allowances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          is_owner: boolean | null
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_owner?: boolean | null
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_owner?: boolean | null
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          absent_deduction_rate: number
          additional_leave_per_year: number
          apply_public_holiday: boolean
          auto_checkout: boolean
          base_annual_leave: number
          break_end_time: string
          break_start_time: string
          checkout_threshold: number
          company_size: string
          created_at: string
          email_notification: boolean
          holiday_alpha_8h: number
          holiday_alpha_ot: number
          holiday_substitute: boolean
          id: string
          insurance_deduction_rate: number
          late_deduction_rate: number
          late_threshold: number
          leave_generation_type: string
          max_additional_leave: number
          max_carry_over: number
          monthly_leave_amount: number
          night_break_minutes: number
          night_checkout_threshold: number
          night_shift_end_time: string
          night_shift_multiplier: number
          night_shift_start_time: string
          non_work_day_default_type: string | null
          organization_id: string
          overtime_break_2h: number
          overtime_break_4h: number
          overtime_checkout_threshold: number
          overtime_end_time: string
          overtime_multiplier: number
          overtime_rate: number
          payroll_start_month: string | null
          salary_calc_end_day: number
          salary_calc_start_day: number
          salary_payment_day: number
          salary_payment_month: string
          shift_break_minutes: number
          shift_checkout_threshold: number
          shift_late_threshold: number
          shift_tier1_break_minutes: number
          shift_tier1_end: string
          shift_tier1_multiplier: number
          shift_tier1_start: string
          shift_tier2_break_minutes: number
          shift_tier2_end: string
          shift_tier2_multiplier: number
          shift_tier2_start: string
          shift_tier3_break_minutes: number
          shift_tier3_end: string
          shift_tier3_multiplier: number
          shift_tier3_start: string
          shift_tier4_break_minutes: number
          shift_tier4_multiplier: number
          slack_notification: boolean
          standard_work_hours: number
          updated_at: string
          weekly_hol_enabled: boolean
          weekly_hol_hours: number
          weekly_hol_rate: number
          weekly_holiday: string
          weekly_work_hours: number
          work_day_list: string[]
          work_days: number
          work_end_time: string
          work_start_time: string
        }
        Insert: {
          absent_deduction_rate?: number
          additional_leave_per_year?: number
          apply_public_holiday?: boolean
          auto_checkout?: boolean
          base_annual_leave?: number
          break_end_time?: string
          break_start_time?: string
          checkout_threshold?: number
          company_size?: string
          created_at?: string
          email_notification?: boolean
          holiday_alpha_8h?: number
          holiday_alpha_ot?: number
          holiday_substitute?: boolean
          id?: string
          insurance_deduction_rate?: number
          late_deduction_rate?: number
          late_threshold?: number
          leave_generation_type?: string
          max_additional_leave?: number
          max_carry_over?: number
          monthly_leave_amount?: number
          night_break_minutes?: number
          night_checkout_threshold?: number
          night_shift_end_time?: string
          night_shift_multiplier?: number
          night_shift_start_time?: string
          non_work_day_default_type?: string | null
          organization_id: string
          overtime_break_2h?: number
          overtime_break_4h?: number
          overtime_checkout_threshold?: number
          overtime_end_time?: string
          overtime_multiplier?: number
          overtime_rate?: number
          payroll_start_month?: string | null
          salary_calc_end_day?: number
          salary_calc_start_day?: number
          salary_payment_day?: number
          salary_payment_month?: string
          shift_break_minutes?: number
          shift_checkout_threshold?: number
          shift_late_threshold?: number
          shift_tier1_break_minutes?: number
          shift_tier1_end?: string
          shift_tier1_multiplier?: number
          shift_tier1_start?: string
          shift_tier2_break_minutes?: number
          shift_tier2_end?: string
          shift_tier2_multiplier?: number
          shift_tier2_start?: string
          shift_tier3_break_minutes?: number
          shift_tier3_end?: string
          shift_tier3_multiplier?: number
          shift_tier3_start?: string
          shift_tier4_break_minutes?: number
          shift_tier4_multiplier?: number
          slack_notification?: boolean
          standard_work_hours?: number
          updated_at?: string
          weekly_hol_enabled?: boolean
          weekly_hol_hours?: number
          weekly_hol_rate?: number
          weekly_holiday?: string
          weekly_work_hours?: number
          work_day_list?: string[]
          work_days?: number
          work_end_time?: string
          work_start_time?: string
        }
        Update: {
          absent_deduction_rate?: number
          additional_leave_per_year?: number
          apply_public_holiday?: boolean
          auto_checkout?: boolean
          base_annual_leave?: number
          break_end_time?: string
          break_start_time?: string
          checkout_threshold?: number
          company_size?: string
          created_at?: string
          email_notification?: boolean
          holiday_alpha_8h?: number
          holiday_alpha_ot?: number
          holiday_substitute?: boolean
          id?: string
          insurance_deduction_rate?: number
          late_deduction_rate?: number
          late_threshold?: number
          leave_generation_type?: string
          max_additional_leave?: number
          max_carry_over?: number
          monthly_leave_amount?: number
          night_break_minutes?: number
          night_checkout_threshold?: number
          night_shift_end_time?: string
          night_shift_multiplier?: number
          night_shift_start_time?: string
          non_work_day_default_type?: string | null
          organization_id?: string
          overtime_break_2h?: number
          overtime_break_4h?: number
          overtime_checkout_threshold?: number
          overtime_end_time?: string
          overtime_multiplier?: number
          overtime_rate?: number
          payroll_start_month?: string | null
          salary_calc_end_day?: number
          salary_calc_start_day?: number
          salary_payment_day?: number
          salary_payment_month?: string
          shift_break_minutes?: number
          shift_checkout_threshold?: number
          shift_late_threshold?: number
          shift_tier1_break_minutes?: number
          shift_tier1_end?: string
          shift_tier1_multiplier?: number
          shift_tier1_start?: string
          shift_tier2_break_minutes?: number
          shift_tier2_end?: string
          shift_tier2_multiplier?: number
          shift_tier2_start?: string
          shift_tier3_break_minutes?: number
          shift_tier3_end?: string
          shift_tier3_multiplier?: number
          shift_tier3_start?: string
          shift_tier4_break_minutes?: number
          shift_tier4_multiplier?: number
          slack_notification?: boolean
          standard_work_hours?: number
          updated_at?: string
          weekly_hol_enabled?: boolean
          weekly_hol_hours?: number
          weekly_hol_rate?: number
          weekly_holiday?: string
          weekly_work_hours?: number
          work_day_list?: string[]
          work_days?: number
          work_end_time?: string
          work_start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          business_number: string | null
          created_at: string
          email: string | null
          employee_size: string | null
          id: string
          name: string
          phone: string | null
          phone_number: string | null
          representative: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_number?: string | null
          created_at?: string
          email?: string | null
          employee_size?: string | null
          id?: string
          name: string
          phone?: string | null
          phone_number?: string | null
          representative?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_number?: string | null
          created_at?: string
          email?: string | null
          employee_size?: string | null
          id?: string
          name?: string
          phone?: string | null
          phone_number?: string | null
          representative?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payroll_records: {
        Row: {
          base_salary: number
          created_at: string
          deduction_items: Json | null
          employee_id: string
          id: string
          net_salary: number
          night_shift_minutes: number | null
          night_work_minutes: number | null
          organization_id: string
          overtime_hours: number | null
          overtime_minutes: number | null
          paid_at: string | null
          payment_items: Json | null
          period_month: number
          period_year: number
          regular_work_minutes: number | null
          status: string | null
          total_deductions: number
          total_payments: number
          total_work_minutes: number | null
          updated_at: string
          working_days: number | null
        }
        Insert: {
          base_salary?: number
          created_at?: string
          deduction_items?: Json | null
          employee_id: string
          id?: string
          net_salary?: number
          night_shift_minutes?: number | null
          night_work_minutes?: number | null
          organization_id: string
          overtime_hours?: number | null
          overtime_minutes?: number | null
          paid_at?: string | null
          payment_items?: Json | null
          period_month: number
          period_year: number
          regular_work_minutes?: number | null
          status?: string | null
          total_deductions?: number
          total_payments?: number
          total_work_minutes?: number | null
          updated_at?: string
          working_days?: number | null
        }
        Update: {
          base_salary?: number
          created_at?: string
          deduction_items?: Json | null
          employee_id?: string
          id?: string
          net_salary?: number
          night_shift_minutes?: number | null
          night_work_minutes?: number | null
          organization_id?: string
          overtime_hours?: number | null
          overtime_minutes?: number | null
          paid_at?: string | null
          payment_items?: Json | null
          period_month?: number
          period_year?: number
          regular_work_minutes?: number | null
          status?: string | null
          total_deductions?: number
          total_payments?: number
          total_work_minutes?: number | null
          updated_at?: string
          working_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_settings: {
        Row: {
          created_at: string
          deduction_items: Json | null
          id: string
          organization_id: string
          payment_items: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deduction_items?: Json | null
          id?: string
          organization_id: string
          payment_items?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deduction_items?: Json | null
          id?: string
          organization_id?: string
          payment_items?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payslip_tokens: {
        Row: {
          created_at: string
          employee_id: string
          expires_at: string
          id: string
          organization_id: string
          payroll_record_id: string
          token: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          expires_at?: string
          id?: string
          organization_id: string
          payroll_record_id: string
          token?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          expires_at?: string
          id?: string
          organization_id?: string
          payroll_record_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "payslip_tokens_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_tokens_payroll_record_id_fkey"
            columns: ["payroll_record_id"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          organization_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "positions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      production_tax_exempt_records: {
        Row: {
          apply_month: number
          apply_year: number
          created_at: string | null
          employee_id: string
          exempt_amount: number | null
          id: string
          is_eligible_month: boolean | null
          monthly_salary: number | null
          organization_id: string
          taxable_amount: number | null
        }
        Insert: {
          apply_month: number
          apply_year: number
          created_at?: string | null
          employee_id: string
          exempt_amount?: number | null
          id?: string
          is_eligible_month?: boolean | null
          monthly_salary?: number | null
          organization_id: string
          taxable_amount?: number | null
        }
        Update: {
          apply_month?: number
          apply_year?: number
          created_at?: string | null
          employee_id?: string
          exempt_amount?: number | null
          id?: string
          is_eligible_month?: boolean | null
          monthly_salary?: number | null
          organization_id?: string
          taxable_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_tax_exempt_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_tax_exempt_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      production_tax_exempt_settings: {
        Row: {
          apply_year: number
          created_at: string | null
          employee_id: string
          id: string
          is_eligible: boolean | null
          organization_id: string
          prior_year_total_salary: number | null
          updated_at: string | null
        }
        Insert: {
          apply_year: number
          created_at?: string | null
          employee_id: string
          id?: string
          is_eligible?: boolean | null
          organization_id: string
          prior_year_total_salary?: number | null
          updated_at?: string | null
        }
        Update: {
          apply_year?: number
          created_at?: string | null
          employee_id?: string
          id?: string
          is_eligible?: boolean | null
          organization_id?: string
          prior_year_total_salary?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_tax_exempt_settings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_tax_exempt_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      salary_details: {
        Row: {
          created_at: string
          employee_id: string
          hol_shift_t1_pay: number
          hol_shift_t2_pay: number
          hol_shift_t3_pay: number
          hol_shift_t4_pay: number
          holiday_work_overtime_pay: number
          holiday_work_pay: number
          id: string
          is_tax_exempt: boolean
          night_pay: number
          organization_id: string
          overtime_pay: number
          pay_year_month: string
          public_holiday_pay: number
          public_holiday_work_pay: number
          regular_pay: number
          shift_pay_1: number
          shift_pay_2: number
          shift_pay_3: number
          shift_pay_4: number
          site_id: string | null
          tax_exempt_amount: number
          updated_at: string
          weekly_holiday_pay: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          hol_shift_t1_pay?: number
          hol_shift_t2_pay?: number
          hol_shift_t3_pay?: number
          hol_shift_t4_pay?: number
          holiday_work_overtime_pay?: number
          holiday_work_pay?: number
          id?: string
          is_tax_exempt?: boolean
          night_pay?: number
          organization_id: string
          overtime_pay?: number
          pay_year_month: string
          public_holiday_pay?: number
          public_holiday_work_pay?: number
          regular_pay?: number
          shift_pay_1?: number
          shift_pay_2?: number
          shift_pay_3?: number
          shift_pay_4?: number
          site_id?: string | null
          tax_exempt_amount?: number
          updated_at?: string
          weekly_holiday_pay?: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          hol_shift_t1_pay?: number
          hol_shift_t2_pay?: number
          hol_shift_t3_pay?: number
          hol_shift_t4_pay?: number
          holiday_work_overtime_pay?: number
          holiday_work_pay?: number
          id?: string
          is_tax_exempt?: boolean
          night_pay?: number
          organization_id?: string
          overtime_pay?: number
          pay_year_month?: string
          public_holiday_pay?: number
          public_holiday_work_pay?: number
          regular_pay?: number
          shift_pay_1?: number
          shift_pay_2?: number
          shift_pay_3?: number
          shift_pay_4?: number
          site_id?: string | null
          tax_exempt_amount?: number
          updated_at?: string
          weekly_holiday_pay?: number
        }
        Relationships: [
          {
            foreignKeyName: "salary_details_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_details_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_send_logs: {
        Row: {
          content: string
          employee_id: string
          error_message: string | null
          id: string
          message_type: string
          organization_id: string
          phone_number: string
          sent_at: string
          sent_by: string
          status: string
        }
        Insert: {
          content: string
          employee_id: string
          error_message?: string | null
          id?: string
          message_type: string
          organization_id: string
          phone_number: string
          sent_at?: string
          sent_by: string
          status: string
        }
        Update: {
          content?: string
          employee_id?: string
          error_message?: string | null
          id?: string
          message_type?: string
          organization_id?: string
          phone_number?: string
          sent_at?: string
          sent_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_send_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_send_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_table_versions: {
        Row: {
          created_at: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string | null
          source_note: string | null
        }
        Insert: {
          created_at?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          source_note?: string | null
        }
        Update: {
          created_at?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          source_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_table_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_holiday_carry: {
        Row: {
          carry_days: number
          confirmed_at: string | null
          created_at: string | null
          employee_id: string
          id: string
          month: number
          organization_id: string
          updated_at: string | null
          year: number
        }
        Insert: {
          carry_days?: number
          confirmed_at?: string | null
          created_at?: string | null
          employee_id: string
          id?: string
          month: number
          organization_id: string
          updated_at?: string | null
          year: number
        }
        Update: {
          carry_days?: number
          confirmed_at?: string | null
          created_at?: string | null
          employee_id?: string
          id?: string
          month?: number
          organization_id?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_holiday_carry_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_holiday_carry_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_holiday_pay_records: {
        Row: {
          applied_hourly_rate: number
          calculated_at: string
          created_at: string
          has_mixed_hourly_rate: boolean
          id: string
          is_eligible: boolean
          organization_id: string
          prescribed_dates: string[]
          rate_source: string
          reason: string
          total_work_minutes: number
          updated_at: string
          week_end: string
          week_start: string
          weekly_holiday: string
          weekly_holiday_pay: number
          weekly_work_day_list: string[]
          weekly_work_hours: number
          worked_dates: string[]
          worked_site_ids: string[]
          worker_key: string
          worker_name: string
        }
        Insert: {
          applied_hourly_rate?: number
          calculated_at?: string
          created_at?: string
          has_mixed_hourly_rate?: boolean
          id?: string
          is_eligible?: boolean
          organization_id: string
          prescribed_dates?: string[]
          rate_source?: string
          reason?: string
          total_work_minutes?: number
          updated_at?: string
          week_end: string
          week_start: string
          weekly_holiday: string
          weekly_holiday_pay?: number
          weekly_work_day_list?: string[]
          weekly_work_hours?: number
          worked_dates?: string[]
          worked_site_ids?: string[]
          worker_key: string
          worker_name: string
        }
        Update: {
          applied_hourly_rate?: number
          calculated_at?: string
          created_at?: string
          has_mixed_hourly_rate?: boolean
          id?: string
          is_eligible?: boolean
          organization_id?: string
          prescribed_dates?: string[]
          rate_source?: string
          reason?: string
          total_work_minutes?: number
          updated_at?: string
          week_end?: string
          week_start?: string
          weekly_holiday?: string
          weekly_holiday_pay?: number
          weekly_work_day_list?: string[]
          weekly_work_hours?: number
          worked_dates?: string[]
          worked_site_ids?: string[]
          worker_key?: string
          worker_name?: string
        }
        Relationships: []
      }
      withholding_tax_rows: {
        Row: {
          created_at: string | null
          d1: number | null
          d10: number | null
          d11: number | null
          d2: number | null
          d3: number | null
          d4: number | null
          d5: number | null
          d6: number | null
          d7: number | null
          d8: number | null
          d9: number | null
          id: string
          pay_from: number
          pay_to: number
          version_id: string | null
        }
        Insert: {
          created_at?: string | null
          d1?: number | null
          d10?: number | null
          d11?: number | null
          d2?: number | null
          d3?: number | null
          d4?: number | null
          d5?: number | null
          d6?: number | null
          d7?: number | null
          d8?: number | null
          d9?: number | null
          id?: string
          pay_from: number
          pay_to: number
          version_id?: string | null
        }
        Update: {
          created_at?: string | null
          d1?: number | null
          d10?: number | null
          d11?: number | null
          d2?: number | null
          d3?: number | null
          d4?: number | null
          d5?: number | null
          d6?: number | null
          d7?: number | null
          d8?: number | null
          d9?: number | null
          id?: string
          pay_from?: number
          pay_to?: number
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "withholding_tax_rows_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "tax_table_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_insurance_settings: {
        Row: {
          apply_employment_insurance: boolean
          apply_health_insurance: boolean
          apply_national_pension: boolean
          birth_day: number | null
          birth_month: number | null
          birth_year: number | null
          health_confirmed: boolean | null
          health_confirmed_months: string[] | null
          id: string
          is_age_warning: boolean | null
          organization_id: string
          pension_confirmed: boolean | null
          pension_confirmed_months: string[] | null
          updated_at: string | null
          worker_key: string
          worker_name: string
        }
        Insert: {
          apply_employment_insurance?: boolean
          apply_health_insurance?: boolean
          apply_national_pension?: boolean
          birth_day?: number | null
          birth_month?: number | null
          birth_year?: number | null
          health_confirmed?: boolean | null
          health_confirmed_months?: string[] | null
          id?: string
          is_age_warning?: boolean | null
          organization_id: string
          pension_confirmed?: boolean | null
          pension_confirmed_months?: string[] | null
          updated_at?: string | null
          worker_key: string
          worker_name: string
        }
        Update: {
          apply_employment_insurance?: boolean
          apply_health_insurance?: boolean
          apply_national_pension?: boolean
          birth_day?: number | null
          birth_month?: number | null
          birth_year?: number | null
          health_confirmed?: boolean | null
          health_confirmed_months?: string[] | null
          id?: string
          is_age_warning?: boolean | null
          organization_id?: string
          pension_confirmed?: boolean | null
          pension_confirmed_months?: string[] | null
          updated_at?: string | null
          worker_key?: string
          worker_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_create_organization: { Args: { _user_id: string }; Returns: boolean }
      create_organization_with_owner: {
        Args: {
          _business_number?: string
          _name: string
          _representative?: string
        }
        Returns: string
      }
      has_role_in_org: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_organization_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "member"
      attendance_status: "present" | "late" | "absent" | "leave" | "half_day"
      employment_type: "regular" | "contract" | "daily" | "freelancer"
      pay_type: "monthly" | "hourly" | "daily"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "member"],
      attendance_status: ["present", "late", "absent", "leave", "half_day"],
      employment_type: ["regular", "contract", "daily", "freelancer"],
      pay_type: ["monthly", "hourly", "daily"],
    },
  },
} as const
