export type LeavePolicyMode = "legal" | "company";

export type CarryOverMode = "none" | "limited" | "unlimited";

export type LedgerEntryType =
  | "grant"
  | "adjustment"
  | "initial_adjustment"
  | "extra_grant"
  | "carryover"
  | "advance_use";

export interface AnnualLeaveEmployee {
  id: string;
  hire_date?: string | null;
}

export interface AnnualLeavePolicy {
  policyMode?: LeavePolicyMode;

  generationType?: "yearly" | "monthly";
  baseAnnualLeave?: number;
  monthlyLeaveAmount?: number;

  carryOverMode?: CarryOverMode;
  maxCarryOver?: number;

  allowAdvanceUse?: boolean;
  maxAdvanceUse?: number;
}

export interface AnnualLeaveLedgerEntry {
  employee_id: string;
  ledger_year: number;
  entry_type: LedgerEntryType;
  days: number;
}

export interface AnnualLeaveUsage {
  employee_id: string;
  days: number;
}

export interface AnnualLeavePayout {
  employee_id: string;
  days: number;
}

export interface AnnualLeaveBalanceResult {
  employeeId: string;
  year: number;

  legalGrantedDays: number;
  companyGrantedDays: number;
  baseGrantedDays: number;

  initialAdjustmentDays: number;
  adjustmentDays: number;
  extraGrantDays: number;
  carryOverDays: number;
  advanceUseDays: number;

  usedLeaveDays: number;
  payoutDays: number;

  totalAvailableDays: number;
  remainingDays: number;
}

const diffInFullYears = (fromDate: string, targetYear: number): number => {
  const hire = new Date(`${fromDate}T00:00:00`);
  const target = new Date(`${targetYear}-01-01T00:00:00`);

  let years = target.getFullYear() - hire.getFullYear();

  const anniversaryThisYear = new Date(
    target.getFullYear(),
    hire.getMonth(),
    hire.getDate(),
  );

  if (target < anniversaryThisYear) {
    years -= 1;
  }

  return Math.max(0, years);
};

export const calculateLegalAnnualLeaveDays = (
  hireDate: string | null | undefined,
  year: number,
): number => {
  if (!hireDate) return 0;

  const fullYears = diffInFullYears(hireDate, year);

  if (fullYears < 1) {
    return 11;
  }

  const additionalDays = Math.floor(Math.max(0, fullYears - 1) / 2);
  return Math.min(15 + additionalDays, 25);
};

export const calculateCompanyAnnualLeaveDays = (
  policy: AnnualLeavePolicy,
): number => {
  if (policy.generationType === "monthly") {
    return Number(policy.monthlyLeaveAmount || 0) * 12;
  }

  return Number(policy.baseAnnualLeave || 0);
};

const sumLedgerDays = (
  entries: AnnualLeaveLedgerEntry[],
  type: LedgerEntryType,
): number => {
  return entries
    .filter((entry) => entry.entry_type === type)
    .reduce((sum, entry) => sum + Number(entry.days || 0), 0);
};

const sumDays = <T extends { days: number }>(items: T[]): number => {
  return items.reduce((sum, item) => sum + Number(item.days || 0), 0);
};

export const calculateAnnualLeaveBalance = ({
  employee,
  year,
  policy,
  ledgerEntries,
  leaveUsages,
  payouts,
}: {
  employee: AnnualLeaveEmployee;
  year: number;
  policy: AnnualLeavePolicy;
  ledgerEntries: AnnualLeaveLedgerEntry[];
  leaveUsages: AnnualLeaveUsage[];
  payouts: AnnualLeavePayout[];
}): AnnualLeaveBalanceResult => {
  const employeeLedgerEntries = ledgerEntries.filter(
    (entry) => entry.employee_id === employee.id && entry.ledger_year === year,
  );

  const employeeLeaveUsages = leaveUsages.filter(
    (usage) => usage.employee_id === employee.id,
  );

  const employeePayouts = payouts.filter(
    (payout) => payout.employee_id === employee.id,
  );

  const legalGrantedDays = calculateLegalAnnualLeaveDays(employee.hire_date, year);

  const companyGrantedDays =
    policy.policyMode === "company"
      ? calculateCompanyAnnualLeaveDays(policy)
      : 0;

  const baseGrantedDays =
    policy.policyMode === "company" ? companyGrantedDays : legalGrantedDays;

  const initialAdjustmentDays = sumLedgerDays(
    employeeLedgerEntries,
    "initial_adjustment",
  );

  const adjustmentDays = sumLedgerDays(employeeLedgerEntries, "adjustment");
  const extraGrantDays = sumLedgerDays(employeeLedgerEntries, "extra_grant");
  const rawCarryOverDays = sumLedgerDays(employeeLedgerEntries, "carryover");
  const advanceUseDays = sumLedgerDays(employeeLedgerEntries, "advance_use");

  const carryOverDays =
    policy.carryOverMode === "none"
      ? 0
      : policy.carryOverMode === "limited"
        ? Math.min(rawCarryOverDays, Number(policy.maxCarryOver || 0))
        : rawCarryOverDays;

  const usedLeaveDays = sumDays(employeeLeaveUsages);
  const payoutDays = sumDays(employeePayouts);

  const totalAvailableDays =
    baseGrantedDays +
    initialAdjustmentDays +
    adjustmentDays +
    extraGrantDays +
    carryOverDays -
    advanceUseDays;

  const remainingDays = totalAvailableDays - usedLeaveDays - payoutDays;

  return {
    employeeId: employee.id,
    year,
    legalGrantedDays,
    companyGrantedDays,
    baseGrantedDays,
    initialAdjustmentDays,
    adjustmentDays,
    extraGrantDays,
    carryOverDays,
    advanceUseDays,
    usedLeaveDays,
    payoutDays,
    totalAvailableDays,
    remainingDays,
  };
};