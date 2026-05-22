import { useEmployeeStore } from "@/store/employeeStore";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { PayrollItemsSettings } from "@/components/settings/PayrollItemsSettings";
import { CompanyInfoSettings } from "@/components/settings/CompanyInfoSettings";
import { EmployeePayrollSettings } from "@/components/settings/EmployeePayrollSettings";
import { WorkHoursSettings } from "@/components/settings/WorkHoursSettings";
import { AllowanceSettings } from "@/components/settings/AllowanceSettings";
import { PayrollCalcSettings } from "@/components/settings/PayrollCalcSettings";
import { LeaveRulesSettings } from "@/components/settings/LeaveRulesSettings";
import { AutomationSettings } from "@/components/settings/AutomationSettings";
import { NightShiftSettings } from "@/components/settings/NightShiftSettings";
import { DepartmentPositionSettings } from "@/components/settings/DepartmentPositionSettings";

import { SalaryWorkStandardsSettings } from "@/components/settings/SalaryWorkStandardsSettings";
import { Skeleton } from "@/components/ui/skeleton";

interface SettingsTabProps {
  section?: string;
}

export function SettingsTab({ section = "payroll-items" }: SettingsTabProps = {}) {
  const { employees } = useEmployeeStore();
  const { settings, loading, saving, saveSettings } = useOrganizationSettings();

  if (loading || !settings) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  const hourlyEmployees = (employees ?? []).filter((emp) => emp.payType === "hourly");

    return (
    <div className="space-y-6 max-w-4xl">
      {section === "payroll-items" && <PayrollItemsSettings />}

      {section === "employee-payroll" && <EmployeePayrollSettings />}

      {section === "dept-position" && <DepartmentPositionSettings />}

      {section === "company-info" && <CompanyInfoSettings />}

      {section === "work-hours" && (
  <WorkHoursSettings
    workStartTime={settings.work_start_time}
    workEndTime={settings.work_end_time}
    breakStartTime={settings.break_start_time}
    breakEndTime={settings.break_end_time}
    lateThreshold={settings.late_threshold}
    checkoutThreshold={settings.checkout_threshold}
    salaryCalcStartDay={settings.salary_calc_start_day}
    salaryCalcEndDay={settings.salary_calc_end_day}
    salaryPaymentMonth={settings.salary_payment_month}
    salaryPaymentDay={settings.salary_payment_day}
    saving={saving}
    onSave={saveSettings}
  />
)}

      {section === "allowance" && (
        <AllowanceSettings
          overtimeMultiplier={settings.overtime_multiplier}
          nightShiftMultiplier={settings.night_shift_multiplier}
          nightShiftStartTime={settings.night_shift_start_time}
          workEndTime={settings.work_end_time}
          overtimeBreak2h={settings.overtime_break_2h}
          overtimeBreak4h={settings.overtime_break_4h}
          nightBreakMinutes={settings.night_break_minutes}
          overtimeCheckoutThreshold={settings.overtime_checkout_threshold}
          nightCheckoutThreshold={settings.night_checkout_threshold}
          overtimeEndTime={settings.overtime_end_time}
          nightShiftEndTime={settings.night_shift_end_time}
          hourlyEmployees={hourlyEmployees}
          holidayAlpha8h={settings.holiday_alpha_8h}
          holidayAlphaOt={settings.holiday_alpha_ot}
          weeklyHolEnabled={settings.weekly_hol_enabled}
          weeklyHolHours={settings.weekly_hol_hours}
          weeklyHolRate={settings.weekly_hol_rate}
          saving={saving}
          onSave={saveSettings}
        />
      )}

      {section === "payroll-calc" && (
        <PayrollCalcSettings
          overtimeRate={settings.overtime_rate}
          standardWorkHours={settings.standard_work_hours}
          lateDeductionRate={settings.late_deduction_rate}
          absentDeductionRate={settings.absent_deduction_rate}
          insuranceDeductionRate={settings.insurance_deduction_rate}
          saving={saving}
          onSave={saveSettings}
        />
      )}

      {section === "leave-rules" && (
        <LeaveRulesSettings
          generationType={settings.leave_generation_type}
          baseAnnualLeave={settings.base_annual_leave}
          monthlyLeaveAmount={settings.monthly_leave_amount}
          maxCarryOver={settings.max_carry_over}
          additionalLeavePerYear={settings.additional_leave_per_year}
          maxAdditionalLeave={settings.max_additional_leave}
          saving={saving}
          onSave={saveSettings}
        />
      )}

      {section === "night-shift" && (
        <NightShiftSettings
          tier1={{
            multiplier: settings.shift_tier1_multiplier,
            start: settings.shift_tier1_start,
            end: settings.shift_tier1_end,
            breakMinutes: settings.shift_tier1_break_minutes,
            enabled: true,
          }}
          tier2={{
            multiplier: settings.shift_tier2_multiplier,
            start: settings.shift_tier2_start,
            end: settings.shift_tier2_end,
            breakMinutes: settings.shift_tier2_break_minutes,
            enabled: true,
          }}
          tier3={{
            multiplier: settings.shift_tier3_multiplier,
            start: settings.shift_tier3_start,
            end: settings.shift_tier3_end,
            breakMinutes: settings.shift_tier3_break_minutes,
            enabled: true,
          }}
          tier4={{
            multiplier: settings.shift_tier4_multiplier,
            breakMinutes: settings.shift_tier4_break_minutes,
            enabled: true,
          }}
          shiftLateThreshold={settings.shift_late_threshold}
          shiftCheckoutThreshold={settings.shift_checkout_threshold}
          saving={saving}
          onSave={saveSettings}
        />
      )}

      {section === "automation" && (
        <AutomationSettings
          autoCheckout={settings.auto_checkout}
          emailNotification={settings.email_notification}
          slackNotification={settings.slack_notification}
          saving={saving}
          onSave={saveSettings}
        />
      )}

      {section === "salary-work-standards" && (
        <SalaryWorkStandardsSettings
          salaryCalcStartDay={settings.salary_calc_start_day}
          salaryCalcEndDay={settings.salary_calc_end_day}
          salaryPaymentMonth={settings.salary_payment_month}
          salaryPaymentDay={settings.salary_payment_day}
          workDays={settings.work_days}
          workDayList={settings.work_day_list}
          weeklyHoliday={settings.weekly_holiday}
          weeklyWorkHours={settings.weekly_work_hours}
          workStartTime={settings.work_start_time}
          workEndTime={settings.work_end_time}
          breakStartTime={settings.break_start_time}
          breakEndTime={settings.break_end_time}
          applyPublicHoliday={settings.apply_public_holiday}
          companySize={settings.company_size}
          holidaySubstitute={settings.holiday_substitute}
          payrollStartMonth={settings.payroll_start_month}
          nonWorkDayDefaultType={settings.non_work_day_default_type ?? "REST_DAY"}
          saving={saving}
          onSave={saveSettings}
        />
      )}
    </div>
  );
}
