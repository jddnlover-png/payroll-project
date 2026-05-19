// 아래 코드는 src/components/payroll/PayrollTab.tsx 전체 교체본입니다.
// 기존 일괄 출력/PDF 전용 HTML과 batchPrintStyles를 제거하고,
// PaySlip.tsx와 동일한 generatePayslipHtml() 양식을 일괄 출력/PDF에서도 사용하도록 정리했습니다.

import { useState, useMemo, useEffect } from "react";
import { ConstructionSiteManager } from "@/components/construction/ConstructionSiteManager";
import ExcelJS from "exceljs";
import html2pdf from "html2pdf.js";
import { useEmployeeStore } from "@/store/employeeStore";
import { useEmployees } from "@/hooks/useEmployees";
import { usePayroll } from "@/hooks/usePayroll";
import { usePayrollCalculation } from "@/hooks/usePayrollCalculation";
import { useSalaryDetails } from "@/hooks/useSalaryDetails";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Download,
  AlertCircle,
  CheckCircle2,
  Calculator,
  ClipboardList,
  Eye,
  Edit,
  History,
  Loader2,
  Mail,
  Printer,
  Lock,
  Unlock,
  ShieldCheck,
  FileSpreadsheet,
  ChevronDown,
  Search,
  FileDown,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import { FilterSidebar } from "@/components/filters/FilterSidebar";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useWeeklyHolidayCarry } from "@/hooks/useWeeklyHolidayCarry";
import { toast } from "sonner";
import { PayrollLedger } from "@/components/payroll/PayrollLedger";
import { PaySlip } from "@/components/payroll/PaySlip";
import { generatePayslipHtml } from "@/components/payroll/payslipHtml";
import { PayrollItemEditor } from "@/components/payroll/PayrollItemEditor";
import { PayrollHistory } from "@/components/payroll/PayrollHistory";
import { EmployeeCombobox } from "@/components/employee/EmployeeCombobox";
import { usePayrollSettingsStore } from "@/store/payrollSettingsStore";
import { PayrollItemValue, Employee } from "@/types/employee";
import { exportPayrollLedger, exportPayslips } from "@/components/payroll/PayrollExcelExport";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { useProductionTaxExempt } from "@/hooks/useProductionTaxExempt";
import { ANNUAL_EXEMPT_LIMIT, PRIOR_YEAR_INCOME_LIMIT } from "@/utils/productionTaxExemption";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(amount);

const formatWorkTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}시간 ${mins}분`;
};

interface PayrollTabProps {
  activeTab?: string;
}

export function PayrollTab({ activeTab = "regular" }: PayrollTabProps) {
  if (activeTab === "construction") {
    return <ConstructionSiteManager />;
  }

  return <RegularPayrollContent />;
}

function RegularPayrollContent() {
  const { currentOrganization } = useOrganization();
  const { employees: storeEmployees, payroll: storePayroll, calculatePayrollFromAttendance } = useEmployeeStore();
  const { employees: dbEmployees } = useEmployees();

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const [selectedYearState, setSelectedYearState] = useState(currentYear);
  const [selectedMonthState, setSelectedMonthState] = useState(currentMonth);

  const selectedMonth = `${selectedYearState}-${String(selectedMonthState).padStart(2, "0")}`;

  const [selectedYear, selectedMonthNum] = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return [y, m];
  }, [selectedMonth]);

  const yearOptions = Array.from({ length: currentYear - 2020 + 1 }, (_, i) => currentYear - i);

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1).filter(
    (m) => selectedYearState < currentYear || m <= currentMonth,
  );

  const handleYearChange = (year: string) => {
    const y = Number(year);
    setSelectedYearState(y);
    if (y === currentYear && selectedMonthState > currentMonth) {
      setSelectedMonthState(currentMonth);
    }
  };

  const {
    payroll: dbPayroll,
    updatePayroll: updateDbPayroll,
    markAsPaid,
    markAsConfirmedPaid,
    confirmPayroll,
    unconfirmPayroll,
  } = usePayroll(selectedYear, selectedMonthNum);
  const { calculatePayroll } = usePayrollCalculation(selectedYear, selectedMonthNum);
  const { salaryDetails, calculateAll: calculateSalaryDetails } = useSalaryDetails(selectedYear, selectedMonthNum);
  const { saveCarryDays, deleteCarryDaysBatch, getEffectiveCarryDaysBatch } = useWeeklyHolidayCarry();

  const [payrollDialogOpen, setPayrollDialogOpen] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [paySlipOpen, setPaySlipOpen] = useState(false);
  const [selectedPayrollIndex, setSelectedPayrollIndex] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEmployee, setHistoryEmployee] = useState<Employee | null>(null);
  const [payTypeFilter, setPayTypeFilter] = useState<"all" | "monthly" | "daily" | "hourly">("all");
  const [isCalculating, setIsCalculating] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [highlightedRecordId, setHighlightedRecordId] = useState<string | null>(null);
  const [searchEmployeeId, setSearchEmployeeId] = useState("");
  const [isBatchSending, setIsBatchSending] = useState(false);
  const [batchSendProgress, setBatchSendProgress] = useState({ current: 0, total: 0 });
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedEmploymentType, setSelectedEmploymentType] = useState<string | null>(null);
  const [selectedPayType, setSelectedPayType] = useState<string | null>(null);
  const [selectedJobCategory, setSelectedJobCategory] = useState<string | null>(null);
  const { paymentItems, deductionItems: settingsDeductionItems } = usePayrollSettingsStore();
  const { settings: orgSettings } = useOrganizationSettings();
  const [productionExemptOpen, setProductionExemptOpen] = useState(false);
  const {
    settings: exemptSettings,
    upsertSetting,
    getYearlyExempt,
    getAccumulatedExempt,
  } = useProductionTaxExempt(selectedYear);
  const [dailyPayrollSummaries, setDailyPayrollSummaries] = useState<
    {
      employeeId: string;
      employeeName: string;
      employeeNumber: string;
      department: string;
      totalWage: number;
      totalDeductions: number;
      netPay: number;
      workDays: number;
    }[]
  >([]);

  const [dbDeptTree, setDbDeptTree] = useState<
    { id: string; name: string; parent_id: string | null; sort_order: number }[]
  >([]);
  const [dbDepartments, setDbDepartments] = useState<string[]>([]);

  useEffect(() => {
    if (!currentOrganization) return;
    const fetchDepartments = async () => {
      const { data } = await supabase
        .from("departments")
        .select("id, name, parent_id, sort_order")
        .eq("organization_id", currentOrganization.id)
        .order("sort_order");
      const depts = (data || []) as { id: string; name: string; parent_id: string | null; sort_order: number }[];
      setDbDeptTree(depts);
      setDbDepartments(depts.map((d) => d.name));
    };
    fetchDepartments();
  }, [currentOrganization]);

  useEffect(() => {
    if (!currentOrganization) return;
    const fetchDailySummaries = async () => {
      const [y, m] = selectedMonth.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
      const endDate = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const { data } = await supabase
        .from("daily_payroll_records")
        .select("employee_id, total_wage, total_deductions, net_pay, employees(name, employee_number, department)")
        .eq("organization_id", currentOrganization.id)
        .eq("status", "confirmed")
        .gte("work_date", startDate)
        .lte("work_date", endDate);

      if (!data) {
        setDailyPayrollSummaries([]);
        return;
      }

      const byEmp = new Map<
        string,
        { totalWage: number; totalDeductions: number; netPay: number; workDays: number; emp: any }
      >();
      data.forEach((r: any) => {
        const existing = byEmp.get(r.employee_id) || {
          totalWage: 0,
          totalDeductions: 0,
          netPay: 0,
          workDays: 0,
          emp: r.employees,
        };
        existing.totalWage += r.total_wage;
        existing.totalDeductions += r.total_deductions;
        existing.netPay += r.net_pay;
        existing.workDays += 1;
        byEmp.set(r.employee_id, existing);
      });

      setDailyPayrollSummaries(
        Array.from(byEmp.entries()).map(([empId, v]) => ({
          employeeId: empId,
          employeeName: v.emp?.name || "-",
          employeeNumber: v.emp?.employee_number || "-",
          department: v.emp?.department || "-",
          totalWage: v.totalWage,
          totalDeductions: v.totalDeductions,
          netPay: v.netPay,
          workDays: v.workDays,
        })),
      );
    };
    fetchDailySummaries();
  }, [currentOrganization, selectedMonth]);

  const deptTree = useMemo(() => {
    const map = new Map<string | null, typeof dbDeptTree>();
    dbDeptTree.forEach((d) => {
      const key = d.parent_id || null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    });
    const result: { name: string; childNames: string[] }[] = [];
    const getAllChildNames = (parentId: string): string[] => {
      const children = map.get(parentId) || [];
      const names: string[] = [];
      children.forEach((c) => {
        names.push(c.name);
        names.push(...getAllChildNames(c.id));
      });
      return names;
    };
    const walk = (parentId: string | null) => {
      (map.get(parentId) || []).forEach((d) => {
        const allChildNames = getAllChildNames(d.id);
        result.push({ name: d.name, childNames: [d.name, ...allChildNames] });
        walk(d.id);
      });
    };
    walk(null);
    return result;
  }, [dbDeptTree]);

  const convertedDbEmployees: Employee[] = useMemo(() => {
    return dbEmployees.map((emp) => ({
      id: emp.id,
      employeeNumber: emp.employee_number,
      name: emp.name,
      residentNumber: emp.resident_number || undefined,
      department: emp.department || "",
      position: emp.position || "",
      email: emp.email || "",
      phone: emp.phone || "",
      hireDate: emp.hire_date,
      baseSalary: emp.base_salary,
      payType: emp.pay_type,
      dailyRate: emp.daily_rate || undefined,
      hourlyRate: emp.hourly_rate || undefined,
      employmentType: emp.employment_type,
      status: emp.is_active ? "active" : "inactive",
      bankName: emp.bank_name || undefined,
      accountNumber: emp.account_number || undefined,
      jobCategory: emp.job_category || "office",
    }));
  }, [dbEmployees]);

  const convertedEmployees: Employee[] = useMemo(() => {
    if (convertedDbEmployees.length > 0) {
      return convertedDbEmployees;
    }
    return storeEmployees;
  }, [convertedDbEmployees, storeEmployees]);

  const dbPayrollData = useMemo(() => {
    return dbPayroll.map((record) => ({
      id: record.id,
      employeeId: record.employee_id,
      employeeNumber: record.employee?.employee_number || "",
      employeeName: record.employee?.name || "",
      department: record.employee?.department || "",
      month: selectedMonth,
      baseSalary: record.base_salary,
      overtime: (record.payment_items as any[])?.find((i: any) => i.itemId === "overtime")?.amount || 0,
      overtimeHours: record.overtime_hours || 0,
      bonus: (record.payment_items as any[])?.find((i: any) => i.itemId === "bonus")?.amount || 0,
      deductions: record.total_deductions,
      netSalary: record.net_salary,
      status: record.status as "pending" | "paid" | "confirmed" | "confirmed_paid",
      presentDays: record.working_days || 0,
      lateDays: 0,
      absentDays: 0,
      leaveDays: 0,
      actualLateMinutes: (record as any).actualLateMinutes ?? (record as any).actual_late_minutes ?? 0,
      actualEarlyLeaveMinutes:
        (record as any).actualEarlyLeaveMinutes ?? (record as any).actual_early_leave_minutes ?? 0,
      totalWorkMinutes: (record as any).total_work_minutes || 0,
      regularWorkMinutes: (record as any).regular_work_minutes || 0,
      overtimeMinutes: (record as any).overtime_minutes || 0,
      nightWorkMinutes: (record as any).night_work_minutes || 0,
      nightShiftMinutes: (record as any).night_shift_minutes || 0,
      holidayWorkMinutes: (() => {
        const items = (record.payment_items as any[]) || [];

        const paymentItemMinutes = items.reduce((sum, item) => {
          if (item.itemId === "holiday-work-allowance") {
            return (
              sum +
              (item.holidayWork8hMinutes || 0) +
              (item.holidayWorkOver8hMinutes || 0) +
              (item.holidayNightMinutes || 0)
            );
          }

          if (item.itemId === "public-holiday-work-pay") {
            return sum + (item.publicHolidayWorkMinutes || item.minutes || 0);
          }

          if (item.itemId?.startsWith("hol-shift-tier")) {
            return sum + (item.shiftTierMinutes || 0);
          }

          return sum;
        }, 0);

        if (paymentItemMinutes > 0) return paymentItemMinutes;

        const detail = salaryDetails.find((d) => d.employee_id === record.employee_id);
        const meta = (detail as any)?.meta || {};

        return (
          (meta.holidayWork8hMinutes || 0) +
          (meta.holidayWorkOver8hMinutes || 0) +
          (meta.holidayNightMinutes || 0) +
          (meta.publicHolidayWorkMinutes || 0) +
          (meta.holShiftTier1Minutes || 0) +
          (meta.holShiftTier2Minutes || 0) +
          (meta.holShiftTier3Minutes || 0) +
          (meta.holShiftTier4Minutes || 0)
        );
      })(),
      calculatedAt: record.created_at,
      paymentItems: record.payment_items || [],
      deductionItems: record.deduction_items || [],
    }));
  }, [dbPayroll, selectedMonth, salaryDetails]);

  const storePayrollData = useMemo(() => {
    return storePayroll.filter((p) => p.month === selectedMonth);
  }, [storePayroll, selectedMonth]);

  const payrollData = useMemo(() => {
    if (dbPayrollData.length > 0) {
      return dbPayrollData;
    }
    return storePayrollData;
  }, [dbPayrollData, storePayrollData]);

  const hasCalculatedData = payrollData.length > 0;

  const filteredPayrollData = useMemo(() => {
    let filtered = payrollData;

    if (selectedDepartment) {
      if (selectedDepartment === "미분류") {
        filtered = filtered.filter((r) => !r.department || !dbDepartments.includes(r.department));
      } else {
        const node = deptTree.find((d) => d.name === selectedDepartment);
        if (node) {
          filtered = filtered.filter((r) => node.childNames.includes(r.department || ""));
        } else {
          filtered = filtered.filter((r) => r.department === selectedDepartment);
        }
      }
    }

    if (selectedEmploymentType) {
      filtered = filtered.filter((r) => {
        const emp = convertedEmployees.find((e) => e.id === r.employeeId);
        return emp?.employmentType === selectedEmploymentType;
      });
    }

    if (selectedPayType) {
      filtered = filtered.filter((r) => {
        const emp = convertedEmployees.find((e) => e.id === r.employeeId);
        return emp?.payType === selectedPayType;
      });
    }

    if (selectedJobCategory) {
      filtered = filtered.filter((r) => {
        const dbEmp = dbEmployees.find((e) => e.id === r.employeeId);
        return (dbEmp?.job_category || "office") === selectedJobCategory;
      });
    }

    return filtered;
  }, [
    payrollData,
    selectedDepartment,
    selectedEmploymentType,
    selectedPayType,
    selectedJobCategory,
    deptTree,
    dbDepartments,
    convertedEmployees,
    dbEmployees,
  ]);

  const activeEmployees = convertedEmployees.filter((e) => e.status === "active" && e.employmentType !== "daily");

  const filteredEmployees = activeEmployees.filter((emp) => payTypeFilter === "all" || emp.payType === payTypeFilter);

  const handleOpenPayrollDialog = () => {
    setPayTypeFilter("all");
    setSelectedEmployeeIds(activeEmployees.map((e) => e.id));
    setPayrollDialogOpen(true);
  };

  const handleSelectRecord = (recordId: string, checked: boolean) => {
    if (checked) {
      setSelectedRecordIds((prev) => [...prev, recordId]);
    } else {
      setSelectedRecordIds((prev) => prev.filter((id) => id !== recordId));
    }
  };

  const handleSelectAllRecords = (checked: boolean) => {
    if (checked) {
      setSelectedRecordIds(payrollData.map((r) => r.id));
    } else {
      setSelectedRecordIds([]);
    }
  };

  const getSelectedRecords = () => payrollData.filter((r) => selectedRecordIds.includes(r.id));

  const handleBatchEmail = async (records: typeof payrollData) => {
    const recordsWithEmail = records.filter((record) => {
      const emp = convertedEmployees.find((e) => e.id === record.employeeId);
      return emp?.email?.trim();
    });

    if (recordsWithEmail.length === 0) {
      toast.error("이메일 주소가 등록된 직원이 없습니다.");
      return;
    }

    setIsBatchSending(true);
    setBatchSendProgress({ current: 0, total: recordsWithEmail.length });
    let successCount = 0;
    let failCount = 0;

    const companySettings = useEmployeeStore.getState().companySettings;

    for (let i = 0; i < recordsWithEmail.length; i++) {
      const record = recordsWithEmail[i];
      const emp = convertedEmployees.find((e) => e.id === record.employeeId);
      if (!emp?.email) continue;

      try {
        const { error } = await supabase.functions.invoke("send-document-email", {
  body: {
    type: "payslip",
    organizationId: currentOrganization?.id,
    employeeName: record.employeeName,
    employeeEmail: emp.email,
    companyName: companySettings.companyName || "급여관리시스템",
    month: record.month,
    html: generateFullPaySlipHtml(record),
  },
});
        if (error) {
          failCount++;
        } else {
          successCount++;
        }
      } catch {
        failCount++;
      }
      setBatchSendProgress({ current: i + 1, total: recordsWithEmail.length });
    }

    setIsBatchSending(false);
    setBatchSendProgress({ current: 0, total: 0 });

    if (failCount === 0) toast.success(`${successCount}명에게 급여명세서가 발송되었습니다.`);
    else if (successCount === 0) toast.error("모든 이메일 발송에 실패했습니다.");
    else toast.warning(`${successCount}명 발송 성공, ${failCount}명 발송 실패`);
  };

  const handleBatchSms = async (records: typeof payrollData) => {
    const recordsWithPhone = records.filter((record) => {
      const emp = convertedEmployees.find((e) => e.id === record.employeeId);
      return emp?.phone?.trim();
    });

    if (recordsWithPhone.length === 0) {
      toast.error("전화번호가 등록된 직원이 없습니다.");
      return;
    }

    setIsBatchSending(true);
    setBatchSendProgress({ current: 0, total: recordsWithPhone.length });
    let successCount = 0;
    let failCount = 0;

    const companySettings = useEmployeeStore.getState().companySettings;

    for (let i = 0; i < recordsWithPhone.length; i++) {
      const record = recordsWithPhone[i];
      const emp = convertedEmployees.find((e) => e.id === record.employeeId);
      if (!emp?.phone) continue;

      const totalPayments = record.baseSalary + record.overtime + record.bonus;

      try {
        const { error } = await supabase.functions.invoke("send-payslip-sms", {
          body: {
            organizationId: currentOrganization?.id,
            employeeName: record.employeeName,
            employeePhone: emp.phone,
            employeeId: record.employeeId,
            payrollRecordId: record.id,
            month: record.month,
            baseSalary: record.baseSalary,
            totalPayments,
            deductions: record.deductions,
            netSalary: record.netSalary,
            companyName: companySettings.companyName,
            siteUrl: "https://payroll-project-rho.vercel.app",
          },
        });
        if (error) {
          failCount++;
        } else {
          successCount++;
        }
      } catch {
        failCount++;
      }
      setBatchSendProgress({ current: i + 1, total: recordsWithPhone.length });
    }

    setIsBatchSending(false);
    setBatchSendProgress({ current: 0, total: 0 });

    if (failCount === 0) toast.success(`${successCount}명에게 SMS가 발송되었습니다.`);
    else if (successCount === 0) toast.error("모든 SMS 발송에 실패했습니다.");
    else toast.warning(`${successCount}명 발송 성공, ${failCount}명 발송 실패`);
  };

  const generateFullPaySlipHtml = (record: (typeof payrollData)[0]) => {
    const emp = convertedEmployees.find((e) => e.id === record.employeeId);
    if (!emp) return "";

    const [yearText, monthText] = record.month.split("-");
    const recordYear = Number(yearText || selectedYear);
    const recordMonth = Number(monthText || selectedMonthNum);
    const yearlyExempt = emp.jobCategory === "production" ? getYearlyExempt(emp.id) : null;
    const accumulatedBeforeThisMonth = emp.jobCategory === "production" ? getAccumulatedExempt(emp.id, recordMonth) : 0;

    return generatePayslipHtml({
      record,
      employee: emp,
      companyName: useEmployeeStore.getState().companySettings.companyName || "회사명",
      paymentItems,
      deductionItems: settingsDeductionItems,
      orgSettings,
      yearlyExempt,
      accumulatedBeforeThisMonth,
    });
  };

  const handleBatchPrint = (records: typeof payrollData) => {
    if (records.length === 0) {
      toast.error("출력할 직원을 선택해주세요.");
      return;
    }

    const allSlips = records.map((r) => generateFullPaySlipHtml(r)).join("");
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(allSlips);
    printWindow.document.close();
    printWindow.print();
  };

  const handleBatchPdfExport = (records: typeof payrollData) => {
    if (records.length === 0) {
      toast.error("PDF로 내보낼 직원을 선택해주세요.");
      return;
    }

    const allSlips = records.map((r) => generateFullPaySlipHtml(r)).join("");
    const wrapper = document.createElement("div");
    wrapper.innerHTML = allSlips;

    html2pdf()
      .set({
        margin: 6,
        filename: `급여명세서_${selectedMonth}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(wrapper)
      .save();

    toast.success(`${records.length}명의 급여명세서 PDF가 생성되었습니다.`);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedEmployeeIds((prev) => {
        const filteredIds = filteredEmployees.map((e) => e.id);
        const otherSelected = prev.filter(
          (id) => !activeEmployees.find((e) => e.id === id) || !filteredEmployees.find((e) => e.id === id),
        );
        return [...new Set([...otherSelected, ...filteredIds])];
      });
    } else {
      const filteredIds = filteredEmployees.map((e) => e.id);
      setSelectedEmployeeIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    }
  };

  const handleSelectEmployee = (employeeId: string, checked: boolean) => {
    if (checked) {
      setSelectedEmployeeIds((prev) => [...prev, employeeId]);
    } else {
      setSelectedEmployeeIds((prev) => prev.filter((id) => id !== employeeId));
    }
  };

  const handlePayTypeFilterChange = (value: "all" | "monthly" | "daily" | "hourly") => {
    setPayTypeFilter(value);
  };

  const handleCalculatePayroll = async () => {
    if (selectedEmployeeIds.length === 0) {
      toast.error("급여 계산할 직원을 선택해주세요.");
      return;
    }

    setIsCalculating(true);
    try {
      if (dbEmployees.length > 0) {
        await Promise.all([
          calculatePayroll(selectedEmployeeIds),
          calculateSalaryDetails.mutateAsync(selectedEmployeeIds),
        ]);
      } else {
        calculatePayrollFromAttendance(selectedMonth, selectedEmployeeIds, convertedEmployees);
      }
      setPayrollDialogOpen(false);
      toast.success(`${selectedMonth} 급여계산이 완료되었습니다`, {
        description: `${selectedEmployeeIds.length}명의 급여가 계산되었습니다.`,
      });
    } catch (error) {
      console.error("Payroll calculation failed:", error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleViewPaySlip = (index: number) => {
    setSelectedPayrollIndex(index);
    setPaySlipOpen(true);
  };

  const handleEditPayrollItems = (record: (typeof payrollData)[0]) => {
    setEditingRecord(record);
    setEditorOpen(true);
  };

  const handleViewHistory = (employeeId: string) => {
    const emp = convertedEmployees.find((e) => e.id === employeeId);
    if (emp) {
      setHistoryEmployee(emp);
      setHistoryOpen(true);
    }
  };

  const handleSavePayrollItems = (paymentItems: PayrollItemValue[], deductionItems: PayrollItemValue[]) => {
    if (!editingRecord) return;

    const totalPayments = paymentItems.reduce((sum, item) => sum + item.amount, 0);
    const totalDeductions = deductionItems.reduce((sum, item) => sum + item.amount, 0);

    updateDbPayroll.mutate({
      id: editingRecord.id,
      payment_items: paymentItems,
      deduction_items: deductionItems,
      base_salary: paymentItems.find((i) => i.itemId === "base-salary")?.amount || editingRecord.baseSalary,
      total_payments: totalPayments,
      total_deductions: totalDeductions,
      net_salary: totalPayments - totalDeductions,
    });

    toast.success("급여 항목이 저장되었습니다");
  };

  const selectedPayrollRecord = payrollData[selectedPayrollIndex];
  const selectedEmployee = selectedPayrollRecord
    ? convertedEmployees.find((e) => e.id === selectedPayrollRecord.employeeId)
    : null;

  const totalStats = {
    baseSalary: payrollData.reduce((sum, r) => sum + r.baseSalary, 0),
    overtime: payrollData.reduce((sum, r) => sum + r.overtime, 0),
    totalPayments: payrollData.reduce((sum, r) => {
      const items = r.paymentItems as any[];
      return (
        sum +
        (items && items.length > 0
          ? items.reduce((s: number, i: any) => s + (i.amount || 0), 0)
          : r.baseSalary + r.overtime + r.bonus)
      );
    }, 0),
    deductions: payrollData.reduce((sum, r) => sum + r.deductions, 0),
    netSalary: payrollData.reduce((sum, r) => sum + r.netSalary, 0),
    pendingCount: payrollData.filter((r) => r.status === "pending").length,
    confirmedCount: payrollData.filter((r) => r.status === "confirmed").length,
    confirmedPaidCount: payrollData.filter((r) => r.status === "confirmed_paid").length,
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">급여 관리</h2>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1 items-center">
            <Select value={String(selectedYearState)} onValueChange={handleYearChange}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}년
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(selectedMonthState)} onValueChange={(m) => setSelectedMonthState(Number(m))}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-none">
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m}월
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="default" onClick={handleOpenPayrollDialog}>
            <Calculator className="w-4 h-4 mr-2" />
            급여계산
          </Button>
          <Button
            variant="default"
            className="bg-blue-700 hover:bg-blue-800 text-white"
            disabled={!hasCalculatedData}
            onClick={() => setLedgerOpen(true)}
          >
            <ClipboardList className="w-4 h-4 mr-2" />
            임금대장 출력
          </Button>
          <Button
            variant="outline"
            className="border-amber-400 text-amber-700 hover:bg-amber-50"
            onClick={() => setProductionExemptOpen(true)}
          >
            <ShieldAlert className="w-4 h-4 mr-2" />
            생산직 비과세 설정
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!hasCalculatedData || isBatchSending}>
                {isBatchSending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    발송 중 ({batchSendProgress.current}/{batchSendProgress.total})
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    발송/출력
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleBatchEmail(selectedRecordIds.length > 0 ? getSelectedRecords() : payrollData)}
              >
                <Mail className="w-4 h-4 mr-2" />
                {selectedRecordIds.length > 0 ? `선택 이메일 발송 (${selectedRecordIds.length})` : "일괄 이메일 발송"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleBatchSms(selectedRecordIds.length > 0 ? getSelectedRecords() : payrollData)}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                {selectedRecordIds.length > 0 ? `선택 SMS 발송 (${selectedRecordIds.length})` : "일괄 SMS 발송"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleBatchPrint(selectedRecordIds.length > 0 ? getSelectedRecords() : payrollData)}
              >
                <Printer className="w-4 h-4 mr-2" />
                {selectedRecordIds.length > 0 ? `선택 출력 (${selectedRecordIds.length})` : "일괄 출력"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleBatchPdfExport(selectedRecordIds.length > 0 ? getSelectedRecords() : payrollData)}
              >
                <FileDown className="w-4 h-4 mr-2" />
                {selectedRecordIds.length > 0 ? `선택 PDF 다운로드 (${selectedRecordIds.length})` : "일괄 PDF 다운로드"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                disabled={
                  !hasCalculatedData ||
                  !payrollData.some((r) => r.status === "confirmed" || r.status === "confirmed_paid")
                }
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                엑셀 내보내기
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  const confirmedRecords = payrollData.filter(
                    (r) => r.status === "confirmed" || r.status === "confirmed_paid",
                  );
                  if (confirmedRecords.length === 0) {
                    toast.error("확정된 급여 데이터가 없습니다.");
                    return;
                  }
                  const workbook = new ExcelJS.Workbook();
                  const worksheet = workbook.addWorksheet("급여이체");
                  worksheet.columns = [
                    { header: "이름", key: "name", width: 15 },
                    { header: "사원번호", key: "employeeNumber", width: 15 },
                    { header: "실지급액", key: "netSalary", width: 20 },
                    { header: "은행", key: "bankName", width: 15 },
                    { header: "계좌번호", key: "accountNumber", width: 25 },
                  ];
                  worksheet.getRow(1).font = { bold: true };
                  worksheet.getRow(1).alignment = { horizontal: "center" };
                  confirmedRecords.forEach((record) => {
                    const emp = convertedEmployees.find((e) => e.id === record.employeeId);
                    worksheet.addRow({
                      name: record.employeeName,
                      employeeNumber: record.employeeNumber,
                      netSalary: record.netSalary,
                      bankName: emp?.bankName || "",
                      accountNumber: emp?.accountNumber || "",
                    });
                  });
                  worksheet.getColumn("netSalary").numFmt = "#,##0";
                  workbook.xlsx.writeBuffer().then((buffer: ArrayBuffer) => {
                    const blob = new Blob([buffer], {
                      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `급여이체_${selectedMonth}.xlsx`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success(`${confirmedRecords.length}명의 급여이체 파일이 다운로드되었습니다.`);
                  });
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                이체파일 생성
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  const result = await exportPayrollLedger(
                    payrollData,
                    convertedEmployees,
                    paymentItems,
                    settingsDeductionItems,
                    selectedMonth,
                  );
                  if (result) toast.success("임금대장 엑셀이 다운로드되었습니다.");
                  else toast.error("확정된 급여 데이터가 없습니다.");
                }}
              >
                <ClipboardList className="w-4 h-4 mr-2" />
                임금대장 엑셀
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  const companySettings = useEmployeeStore.getState().companySettings;
                  const result = await exportPayslips(
                    payrollData,
                    convertedEmployees,
                    paymentItems,
                    settingsDeductionItems,
                    selectedMonth,
                    companySettings.companyName || "",
                  );
                  if (result) toast.success("급여명세서 엑셀이 다운로드되었습니다.");
                  else toast.error("확정된 급여 데이터가 없습니다.");
                }}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                급여명세서 엑셀
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!hasCalculatedData}>
                <ShieldCheck className="w-4 h-4 mr-2" />
                확정 관리
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={async () => {
                  const targets = selectedRecordIds.length > 0 ? selectedRecordIds : payrollData.map((r) => r.id);
                  const targetRecords = payrollData.filter((r) => targets.includes(r.id));
                  const allConfirmed = targetRecords.every(
                    (r) => r.status === "confirmed" || r.status === "confirmed_paid",
                  );
                  if (allConfirmed) {
                    const empIds = targetRecords.map((r) => r.employeeId);
                    await deleteCarryDaysBatch(empIds, selectedYear, selectedMonthNum);
                    unconfirmPayroll.mutate(targets);
                  } else {
                    const nonMonthlyRecords = targetRecords.filter((r) => {
                      const emp = convertedEmployees.find((e) => e.id === r.employeeId);
                      return emp && emp.payType !== "monthly";
                    });
                    if (nonMonthlyRecords.length > 0 && currentOrganization) {
                      try {
                        const startDate = `${selectedYear}-${String(selectedMonthNum).padStart(2, "0")}-01`;
                        const lastDay = new Date(selectedYear, selectedMonthNum, 0).getDate();
                        const endDate = `${selectedYear}-${String(selectedMonthNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
                        const priorStart = new Date(selectedYear, selectedMonthNum - 1, 1);
                        priorStart.setDate(priorStart.getDate() - 28);
                        const priorStartDate = `${priorStart.getFullYear()}-${String(priorStart.getMonth() + 1).padStart(2, "0")}-${String(priorStart.getDate()).padStart(2, "0")}`;

                        const { data: allAttData } = await supabase
                          .from("attendance_records")
                          .select("*")
                          .eq("organization_id", currentOrganization.id)
                          .gte("date", priorStartDate)
                          .lte("date", endDate);

                        const { calculateSalaryDetail } = await import("@/utils/salaryDetailCalculation");
                        const carryMap = await getEffectiveCarryDaysBatch(
                          nonMonthlyRecords.map((r) => r.employeeId),
                          selectedYear,
                          selectedMonthNum,
                        );
                        const yearMonth = `${selectedYear}-${String(selectedMonthNum).padStart(2, "0")}`;

                        for (const record of nonMonthlyRecords) {
                          const emp = dbEmployees.find((e) => e.id === record.employeeId);
                          if (!emp) continue;
                          const empMonthAtt = (allAttData || [])
                            .filter((a: any) => a.employee_id === emp.id && a.date >= startDate && a.date <= endDate)
                            .map((a: any) => ({
                              id: a.id,
                              employee_id: a.employee_id,
                              date: a.date,
                              check_in: a.check_in,
                              check_out: a.check_out,
                              status: a.status,
                              break_minutes: a.break_minutes,
                              work_type: a.work_type,
                              is_holiday: a.is_holiday,
                            }));
                          const allAtt = (allAttData || []).map((a: any) => ({
                            id: a.id,
                            employee_id: a.employee_id,
                            date: a.date,
                            check_in: a.check_in,
                            check_out: a.check_out,
                            status: a.status,
                            break_minutes: a.break_minutes,
                            work_type: a.work_type,
                            is_holiday: a.is_holiday,
                          }));
                          const prevCarry = carryMap.get(emp.id) || 0;
                          const result = calculateSalaryDetail(
                            emp,
                            empMonthAtt,
                            allAtt,
                            orgSettings,
                            yearMonth,
                            prevCarry,
                          );
                          await saveCarryDays(emp.id, selectedYear, selectedMonthNum, result.carryDays ?? 0);
                        }
                      } catch (err) {
                        console.error("Failed to save carry days on confirm:", err);
                      }
                    }
                    confirmPayroll.mutate(targets);
                  }
                }}
              >
                {(() => {
                  const targets = selectedRecordIds.length > 0 ? selectedRecordIds : payrollData.map((r) => r.id);
                  const allConfirmed = payrollData
                    .filter((r) => targets.includes(r.id))
                    .every((r) => r.status === "confirmed" || r.status === "confirmed_paid");
                  if (allConfirmed) {
                    return (
                      <>
                        <Unlock className="w-4 h-4 mr-2" />
                        {selectedRecordIds.length > 0 ? `확정취소 (${selectedRecordIds.length})` : "일괄 확정취소"}
                      </>
                    );
                  }
                  return (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      {selectedRecordIds.length > 0 ? `선택 확정 (${selectedRecordIds.length})` : "일괄 확정"}
                    </>
                  );
                })()}
              </DropdownMenuItem>
              {payrollData.some((r) => r.status === "confirmed") && (
                <DropdownMenuItem
                  onClick={() => {
                    const targets =
                      selectedRecordIds.length > 0
                        ? payrollData
                            .filter((r) => selectedRecordIds.includes(r.id) && r.status === "confirmed")
                            .map((r) => r.id)
                        : payrollData.filter((r) => r.status === "confirmed").map((r) => r.id);
                    if (targets.length === 0) {
                      toast.error("확정된 급여 데이터가 없습니다.");
                      return;
                    }
                    markAsConfirmedPaid.mutate(targets);
                  }}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {selectedRecordIds.length > 0
                    ? `선택 지급완료 (${payrollData.filter((r) => selectedRecordIds.includes(r.id) && r.status === "confirmed").length})`
                    : `일괄 지급완료 (${payrollData.filter((r) => r.status === "confirmed").length})`}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!hasCalculatedData ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">급여 데이터가 없습니다</h3>
            <p className="text-muted-foreground text-center max-w-md">
              근태관리 &gt; 근태현황에서 월별 근태 데이터를 확인하고
              <br />
              <strong>'급여계산'</strong> 버튼을 클릭하여 급여를 계산해주세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-4">
          <FilterSidebar
            employees={payrollData.map((r) => ({
              id: r.employeeId,
              department: r.department,
              employment_type: convertedEmployees.find((e) => e.id === r.employeeId)?.employmentType,
              pay_type: convertedEmployees.find((e) => e.id === r.employeeId)?.payType,
              job_category: dbEmployees.find((e) => e.id === r.employeeId)?.job_category || "office",
            }))}
            selectedDepartment={selectedDepartment}
            onDepartmentChange={setSelectedDepartment}
            selectedEmploymentType={selectedEmploymentType}
            onEmploymentTypeChange={setSelectedEmploymentType}
            selectedPayType={selectedPayType}
            onPayTypeChange={setSelectedPayType}
            selectedJobCategory={selectedJobCategory}
            onJobCategoryChange={setSelectedJobCategory}
          />

          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">총 기본급</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">{formatCurrency(totalStats.baseSalary)}</div>
                </CardContent>
              </Card>
              <Card className="status-green">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium opacity-80">총 지급내역</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">{formatCurrency(totalStats.totalPayments)}</div>
                </CardContent>
              </Card>
              <Card className="status-red">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium opacity-80">총 공제내역</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">{formatCurrency(totalStats.deductions)}</div>
                </CardContent>
              </Card>
              <Card className="bg-primary text-primary-foreground">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium opacity-80">총 실지급액</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">{formatCurrency(totalStats.netSalary)}</div>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-lg border bg-card">
              <div className="p-4 border-b">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="w-64">
                    <EmployeeCombobox
                      employees={dbEmployees}
                      value={searchEmployeeId}
                      onValueChange={(empId) => {
                        setSearchEmployeeId(empId);
                        const record = filteredPayrollData.find((r) => r.employeeId === empId);
                        if (record) {
                          setHighlightedRecordId(record.id);
                          setTimeout(() => setHighlightedRecordId(null), 5000);
                          setTimeout(() => {
                            const el = document.getElementById(`payroll-row-${record.id}`);
                            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                          }, 100);
                        } else {
                          toast.info("해당 직원의 급여 데이터가 없습니다.");
                        }
                      }}
                      placeholder="직원 검색..."
                    />
                  </div>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={payrollData.length > 0 && selectedRecordIds.length === payrollData.length}
                        onCheckedChange={(checked) => handleSelectAllRecords(checked as boolean)}
                      />
                    </TableHead>
                    <TableHead>사원번호</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead>고용형태</TableHead>
                    <TableHead>직종</TableHead>
                    <TableHead>급여유형</TableHead>
                    <TableHead>부서</TableHead>
                    <TableHead className="text-center">출근일/지각/결근</TableHead>
                    <TableHead className="text-center">총 근무시간</TableHead>
                    <TableHead className="text-right">기본급</TableHead>
                    <TableHead className="text-right">지급내역</TableHead>
                    <TableHead className="text-right">공제내역</TableHead>
                    <TableHead className="text-right">실지급액</TableHead>
                    <TableHead className="text-center">상태</TableHead>
                    <TableHead className="text-center">편집</TableHead>
                    <TableHead className="text-center">명세서</TableHead>
                    <TableHead className="text-center">히스토리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayrollData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={17} className="text-center py-8 text-muted-foreground">
                        해당 조건에 맞는 급여 데이터가 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPayrollData.map((record) => {
                      const index = payrollData.indexOf(record as any);
                      return (
                        <TableRow
                          key={record.id}
                          id={`payroll-row-${record.id}`}
                          data-highlighted={highlightedRecordId === record.id || undefined}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedRecordIds.includes(record.id)}
                              onCheckedChange={(checked) => handleSelectRecord(record.id, checked as boolean)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{record.employeeNumber}</TableCell>
                          <TableCell>{record.employeeName}</TableCell>
                          <TableCell>
                            {(() => {
                              const empType = convertedEmployees.find(
                                (e) => e.id === record.employeeId,
                              )?.employmentType;
                              const typeMap: Record<string, { label: string; className: string }> = {
                                regular: { label: "정규직", className: "bg-green-50 text-green-700 border-green-200" },
                                contract: { label: "계약직", className: "bg-blue-50 text-blue-700 border-blue-200" },
                                daily: { label: "일용직", className: "bg-orange-50 text-orange-700 border-orange-200" },
                                freelancer: {
                                  label: "프리랜서",
                                  className: "bg-purple-50 text-purple-700 border-purple-200",
                                },
                              };
                              const info = typeMap[empType || ""] || { label: empType || "-", className: "" };
                              return (
                                <Badge variant="outline" className={cn("text-xs font-normal", info.className)}>
                                  {info.label}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const jobCat = dbEmployees.find((e) => e.id === record.employeeId)?.job_category;
                              return (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "text-xs font-normal",
                                    jobCat === "production"
                                      ? "bg-amber-50 text-amber-700 border-amber-200"
                                      : "bg-slate-50 text-slate-700 border-slate-200",
                                  )}
                                >
                                  {jobCat === "production" ? "생산직" : "사무직"}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-medium">
                              {convertedEmployees.find((e) => e.id === record.employeeId)?.payType === "monthly"
                                ? "월급"
                                : convertedEmployees.find((e) => e.id === record.employeeId)?.payType === "daily"
                                  ? "일급"
                                  : "시급"}
                            </Badge>
                          </TableCell>
                          <TableCell>{record.department}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-1">
                              <Badge variant="secondary" className="status-green text-xs" title="출근일수">
  {record.presentDays}
</Badge>
                              <Badge
                                variant="secondary"
                                className={record.lateDays > 0 ? "status-yellow text-xs" : "text-xs"}
                              >
                                {record.lateDays}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className={record.absentDays > 0 ? "status-red text-xs" : "text-xs"}
                              >
                                {record.absentDays}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {formatWorkTime(record.totalWorkMinutes)}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(record.baseSalary)}</TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatCurrency(
                              (() => {
                                const items = record.paymentItems as any[];
                                return items && items.length > 0
                                  ? items.reduce((s: number, i: any) => s + (i.amount || 0), 0)
                                  : record.baseSalary + record.overtime + record.bonus;
                              })(),
                            )}
                          </TableCell>
                          <TableCell className="text-right text-destructive">
                            -{formatCurrency(record.deductions)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(record.netSalary)}</TableCell>
                          <TableCell className="text-center">
                            {record.status === "confirmed_paid" ? (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-300">
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                확정및지급완료
                              </Badge>
                            ) : record.status === "confirmed" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-green-700"
                                onClick={() => markAsConfirmedPaid.mutate([record.id])}
                              >
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                확정
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                대기
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              disabled={record.status === "confirmed" || record.status === "confirmed_paid"}
                              onClick={() => handleEditPayrollItems(record)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => handleViewPaySlip(index)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => handleViewHistory(record.employeeId)}
                            >
                              <History className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              {selectedRecordIds.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-t rounded-b-lg">
                  <span className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{selectedRecordIds.length}명</span> /{" "}
                    {payrollData.length}명 선택됨
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedRecordIds([])}>
                    선택 해제
                  </Button>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
              <div className="flex gap-4">
                <span className="text-sm text-muted-foreground">
                  확정: <strong className="text-green-700">{totalStats.confirmedCount}명</strong>
                </span>
                <span className="text-sm text-muted-foreground">
                  확정및지급완료: <strong className="text-blue-600">{totalStats.confirmedPaidCount}명</strong>
                </span>
                <span className="text-sm text-muted-foreground">
                  대기: <strong className="text-yellow-600">{totalStats.pendingCount}명</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">총 실지급액</span>
                <span className="text-xl font-bold text-primary">{formatCurrency(totalStats.netSalary)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={payrollDialogOpen} onOpenChange={setPayrollDialogOpen}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>급여계산 대상 선택</DialogTitle>
            <DialogDescription>{selectedMonth} 급여를 계산할 직원을 선택하세요.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={payTypeFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => handlePayTypeFilterChange("all")}
              >
                전체 ({activeEmployees.length})
              </Button>
              <Button
                variant={payTypeFilter === "monthly" ? "default" : "outline"}
                size="sm"
                onClick={() => handlePayTypeFilterChange("monthly")}
              >
                월급 ({activeEmployees.filter((e) => e.payType === "monthly").length})
              </Button>
              <Button
                variant={payTypeFilter === "daily" ? "default" : "outline"}
                size="sm"
                onClick={() => handlePayTypeFilterChange("daily")}
              >
                일급 ({activeEmployees.filter((e) => e.payType === "daily").length})
              </Button>
              <Button
                variant={payTypeFilter === "hourly" ? "default" : "outline"}
                size="sm"
                onClick={() => handlePayTypeFilterChange("hourly")}
              >
                시급 ({activeEmployees.filter((e) => e.payType === "hourly").length})
              </Button>
            </div>

            <div className="flex items-center justify-between pb-2 border-b">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="select-all-payroll"
                  checked={
                    filteredEmployees.length > 0 && filteredEmployees.every((e) => selectedEmployeeIds.includes(e.id))
                  }
                  onCheckedChange={handleSelectAll}
                />
                <label htmlFor="select-all-payroll" className="text-sm font-medium cursor-pointer">
                  {payTypeFilter === "all"
                    ? "전체 선택"
                    : `${payTypeFilter === "monthly" ? "월급" : payTypeFilter === "daily" ? "일급" : "시급"} 전체 선택`}{" "}
                  ({filteredEmployees.length}명)
                </label>
              </div>
              <Badge variant="secondary">{selectedEmployeeIds.length}명 선택됨</Badge>
            </div>
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {filteredEmployees.map((emp) => (
                <div key={emp.id} className="flex items-center space-x-2 p-2 rounded hover:bg-muted">
                  <Checkbox
                    id={`payroll-emp-${emp.id}`}
                    checked={selectedEmployeeIds.includes(emp.id)}
                    onCheckedChange={(checked) => handleSelectEmployee(emp.id, checked as boolean)}
                  />
                  <label htmlFor={`payroll-emp-${emp.id}`} className="flex-1 text-sm cursor-pointer">
                    <span className="font-medium">{emp.name}</span>
                    <Badge variant="outline" className="text-xs font-normal ml-1">
                      {emp.employmentType === "regular"
                        ? "정규직"
                        : emp.employmentType === "contract"
                          ? "계약직"
                          : emp.employmentType === "freelancer"
                            ? "프리랜서"
                            : "일용직"}
                    </Badge>
                    <Badge variant="secondary" className="text-xs font-normal ml-1">
                      {emp.payType === "monthly" ? "월급" : emp.payType === "daily" ? "일급" : "시급"}
                    </Badge>
                    <span className="text-muted-foreground ml-2">({emp.employeeNumber})</span>
                    <span className="text-muted-foreground ml-2">- {emp.department}</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayrollDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleCalculatePayroll} disabled={selectedEmployeeIds.length === 0 || isCalculating}>
              {isCalculating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Calculator className="w-4 h-4 mr-2" />
              )}
              {isCalculating ? "계산 중..." : `${selectedEmployeeIds.length}명 급여계산`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={productionExemptOpen} onOpenChange={setProductionExemptOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              생산직 비과세 설정 — {selectedYear}년
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-amber-900">
                  <p className="font-semibold mb-1">⚠ 직전연도 총급여액 입력 기준 (소득세법 제20조 제2항)</p>
                  <p>
                    연말정산 「근로소득 원천징수영수증」의 <strong>[총급여액]</strong> 칸 금액을 그대로 입력하세요.
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="font-medium text-amber-800">✅ 총급여액 포함</p>
                      <p>
                        기본급, 연장·야간·휴일수당, 상여금,
                        <br />
                        식대·차량운전보조금 20만원 초과 과세분
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-amber-800">❌ 총급여액 제외 (비과세소득)</p>
                      <p>
                        식대 월 20만원 이내,
                        <br />
                        차량운전보조금 월 20만원 이내,
                        <br />
                        출산·보육수당 월 20만원 이내 등
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs font-medium text-red-700">
                    ※ 직접 계산하지 마시고 반드시 원천징수영수증 [총급여액] 칸 숫자를 입력하세요.
                    <br />※ 3,700만원 초과 시 해당 연도 비과세 미적용 / 월정액급여 260만원 초과 월은 해당 월 비과세
                    미적용
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            {(() => {
              const productionEmployees = convertedDbEmployees.filter(
                (e) => e.jobCategory === "production" && e.status === "active",
              );

              if (productionEmployees.length === 0) {
                return (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShieldAlert className="w-12 h-12 mx-auto mb-3 text-amber-300" />
                    <p className="font-medium">생산직 직원이 없습니다</p>
                    <p className="text-sm mt-1">직원 관리에서 직종을 "생산직"으로 설정해주세요.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {productionEmployees.map((emp) => {
                    const setting = exemptSettings.find((s) => s.employee_id === emp.id);
                    const isEligible = setting?.is_eligible ?? false;
                    const priorSalary = setting?.prior_year_total_salary ?? 0;
                    const yearlyData = getYearlyExempt(emp.id);
                    const totalExempt = yearlyData.totalExempt;
                    const remainingLimit = Math.max(0, ANNUAL_EXEMPT_LIMIT - totalExempt);
                    const usageRate = Math.min(100, Math.round((totalExempt / ANNUAL_EXEMPT_LIMIT) * 100));

                    return (
                      <div
                        key={emp.id}
                        className={`border rounded-lg p-4 ${isEligible ? "border-amber-200 bg-amber-50/30" : "border-gray-200"}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-[140px]">
                            <p className="font-semibold text-sm">{emp.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {emp.employeeNumber} · {emp.payType === "hourly" ? "시급제" : "일급제"}
                            </p>
                            {emp.hourlyRate && (
                              <p className="text-xs text-muted-foreground">
                                시급 {new Intl.NumberFormat("ko-KR").format(emp.hourlyRate)}원
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">비과세 적용</span>
                            <Switch
                              checked={isEligible}
                              onCheckedChange={async (checked) => {
                                await upsertSetting.mutateAsync({
                                  organization_id: currentOrganization!.id,
                                  employee_id: emp.id,
                                  apply_year: selectedYear,
                                  is_eligible: checked,
                                  prior_year_total_salary: priorSalary,
                                });
                              }}
                            />
                          </div>

                          <div className="flex-1 max-w-[220px]">
                            <label className="text-xs text-muted-foreground block mb-1">
                              직전연도({selectedYear - 1}년) 총급여액
                            </label>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                disabled={!isEligible}
                                defaultValue={priorSalary || ""}
                                placeholder="예: 30000000"
                                className="h-8 text-sm"
                                onBlur={async (e) => {
                                  const val = Number(e.target.value);
                                  if (isNaN(val)) return;
                                  await upsertSetting.mutateAsync({
                                    organization_id: currentOrganization!.id,
                                    employee_id: emp.id,
                                    apply_year: selectedYear,
                                    is_eligible: isEligible,
                                    prior_year_total_salary: val,
                                  });
                                }}
                              />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">원</span>
                            </div>
                            {isEligible && priorSalary > 0 && (
                              <p
                                className={`text-xs mt-1 ${priorSalary > PRIOR_YEAR_INCOME_LIMIT ? "text-red-500 font-medium" : "text-green-600"}`}
                              >
                                {priorSalary > PRIOR_YEAR_INCOME_LIMIT
                                  ? "❌ 3,700만원 초과 — 비과세 미적용"
                                  : "✅ 요건 충족"}
                              </p>
                            )}
                          </div>

                          <div className="min-w-[180px]">
                            <p className="text-xs text-muted-foreground mb-1">{selectedYear}년 누적 비과세</p>
                            {isEligible ? (
                              <>
                                <p className="text-sm font-medium">
                                  {new Intl.NumberFormat("ko-KR").format(totalExempt)}원
                                  <span className="text-xs text-muted-foreground ml-1">
                                    / {new Intl.NumberFormat("ko-KR").format(ANNUAL_EXEMPT_LIMIT)}원
                                  </span>
                                </p>
                                <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                                  <div
                                    className={`h-1.5 rounded-full ${totalExempt >= ANNUAL_EXEMPT_LIMIT ? "bg-red-500" : "bg-amber-500"}`}
                                    style={{ width: `${usageRate}%` }}
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  잔여 {new Intl.NumberFormat("ko-KR").format(remainingLimit)}원 ({100 - usageRate}%)
                                </p>
                              </>
                            ) : (
                              <p className="text-xs text-muted-foreground">비과세 미적용</p>
                            )}
                          </div>
                        </div>

                        {isEligible && yearlyData.monthlyBreakdown.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-amber-100">
                            <p className="text-xs text-muted-foreground mb-2">월별 비과세 적용 내역</p>
                            <div className="grid grid-cols-6 gap-1">
                              {yearlyData.monthlyBreakdown.map((m) => (
                                <div
                                  key={m.month}
                                  className={`text-center p-1 rounded text-xs ${m.isEligible ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-500"}`}
                                >
                                  <p className="font-medium">{m.month}월</p>
                                  <p>
                                    {m.isEligible ? new Intl.NumberFormat("ko-KR").format(m.exemptAmount) : "미적용"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <PayrollLedger
        open={ledgerOpen}
        onOpenChange={setLedgerOpen}
        payrollData={payrollData}
        month={selectedMonth}
        dailyPayrollSummaries={dailyPayrollSummaries}
        employees={convertedEmployees}
      />

      <PaySlip
        open={paySlipOpen}
        onOpenChange={setPaySlipOpen}
        record={selectedPayrollRecord}
        employee={selectedEmployee}
        hasPrevious={selectedPayrollIndex > 0}
        hasNext={selectedPayrollIndex < payrollData.length - 1}
        onPrevious={() => setSelectedPayrollIndex((i) => Math.max(0, i - 1))}
        onNext={() => setSelectedPayrollIndex((i) => Math.min(payrollData.length - 1, i + 1))}
      />

      <PayrollItemEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        record={editingRecord}
        onSave={handleSavePayrollItems}
      />

      <PayrollHistory open={historyOpen} onOpenChange={setHistoryOpen} employee={historyEmployee} />
    </div>
  );
}
