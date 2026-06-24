import { useState, useMemo } from 'react';
import { useEmployees } from '@/hooks/useEmployees';
import { useLeaveRecords } from '@/hooks/useLeaveRecords';
import { useAnnualLeavePayouts } from '@/hooks/useAnnualLeavePayouts';
import { useAnnualLeaveLedger } from '@/hooks/useAnnualLeaveLedger';
import {
  calculateAnnualLeaveBalance,
  type AnnualLeavePolicy,
} from '@/utils/annualLeaveEngine';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Check, X, Calendar as CalendarIcon, Users, ChevronLeft, ChevronRight, Download, Loader2, Pencil, Trash2, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmployeePicker } from '@/components/employee/EmployeePicker';
import { EmployeeCombobox } from '@/components/employee/EmployeeCombobox';
import { toast } from 'sonner';
import { format, differenceInDays, differenceInMonths, differenceInYears, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import ExcelJS from 'exceljs';

const leaveTypeConfig = {
  annual: { label: '연차', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
  half_day: { label: '반차', class: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300' },
  sick: { label: '병가', class: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
  personal: { label: '경조사', class: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' },
  other: { label: '기타', class: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300' },
};

const statusConfig = {
  pending: { label: '대기중', class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
  approved: { label: '승인', class: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
  rejected: { label: '반려', class: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
};

export function LeaveManagement() {
  const { employees, activeEmployees, isLoading: employeesLoading } = useEmployees();
const { leaveRecords, isLoading: leaveLoading, addLeaveRecord, updateLeaveRecord, deleteLeaveRecord } = useLeaveRecords();
const {
  annualLeavePayouts,
  isLoading: payoutLoading,
  addAnnualLeavePayout,
  deleteAnnualLeavePayout,
} = useAnnualLeavePayouts();
const { settings } = useOrganizationSettings();

  const currentYear = new Date().getFullYear();
  const [requestYear, setRequestYear] = useState(currentYear);
  const [balanceYear, setBalanceYear] = useState(currentYear);
const [payoutYear, setPayoutYear] = useState(currentYear);
const [accountYear, setAccountYear] = useState(currentYear);
const {
  ledgerEntries,
  isLoading: ledgerLoading,
  addLedgerEntry,
  updateLedgerEntry,
  deleteLedgerEntry,
} = useAnnualLeaveLedger();

const [ledgerFormData, setLedgerFormData] = useState({
  employee_id: '',
  entry_type: 'adjustment',
  days: '',
  reason: '',
});

const [selectedAccountEmployeeId, setSelectedAccountEmployeeId] = useState<string | null>(null);
const [editingLedgerEntryId, setEditingLedgerEntryId] = useState<string | null>(null);
const [ledgerEditFormData, setLedgerEditFormData] = useState({
  entry_type: 'adjustment',
  days: '',
  reason: '',
});

const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [balanceSelectedIds, setBalanceSelectedIds] = useState<string[]>([]);
  const [balancePage, setBalancePage] = useState(1);
  const BALANCE_PAGE_SIZE = 20;

  const [isOpen, setIsOpen] = useState(false);
const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
const [isEditOpen, setIsEditOpen] = useState(false);
const [processedPage, setProcessedPage] = useState(1);
const PROCESSED_PAGE_SIZE = 20;
const [formData, setFormData] = useState({
  employeeId: '',
  leaveType: 'annual' as 'annual' | 'half_day' | 'sick' | 'personal' | 'other',
  startDate: undefined as Date | undefined,
  endDate: undefined as Date | undefined,
  reason: '',
});

const [payoutFormData, setPayoutFormData] = useState({
  employeeId: '',
  settlementMonth: `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  days: '',
  note: '',
});

  const resetForm = () => {
    setFormData({ employeeId: '', leaveType: 'annual', startDate: undefined, endDate: undefined, reason: '' });
  };

  const calculateDays = (start: Date | undefined, end: Date | undefined) => {
    if (!start || !end) return 0;
    return differenceInDays(end, start) + 1;
  };

  const handleSubmit = () => {
    if (!formData.employeeId || !formData.startDate || !formData.endDate) {
      toast.error('필수 항목을 입력해주세요.');
      return;
    }
    const days = calculateDays(formData.startDate, formData.endDate);
    addLeaveRecord.mutate(
      {
        employee_id: formData.employeeId,
        leave_type: formData.leaveType,
        start_date: format(formData.startDate, 'yyyy-MM-dd'),
        end_date: format(formData.endDate, 'yyyy-MM-dd'),
        days: formData.leaveType === 'half_day' ? 0.5 : days,
        reason: formData.reason,
        status: 'approved',
      },
      { onSuccess: () => { resetForm(); setIsOpen(false); } }
    );
    };

  const handleApprove = (id: string) => {
    updateLeaveRecord.mutate({ id, status: 'approved' });
  };

  const handleReject = (id: string) => {
    updateLeaveRecord.mutate({ id, status: 'rejected' });
  };

  const openEditDialog = (record: any) => {
  setEditingRecordId(record.id);
  setFormData({
    employeeId: record.employee_id,
    leaveType: record.leave_type,
    startDate: parseISO(record.start_date),
    endDate: parseISO(record.end_date),
    reason: record.reason || '',
  });
  setIsEditOpen(true);
};

const handleUpdate = () => {
  if (!editingRecordId || !formData.employeeId || !formData.startDate || !formData.endDate) {
    toast.error('필수 항목을 입력해주세요.');
    return;
  }

  const days = calculateDays(formData.startDate, formData.endDate);

  updateLeaveRecord.mutate(
    {
      id: editingRecordId,
      leave_type: formData.leaveType,
      start_date: format(formData.startDate, 'yyyy-MM-dd'),
      end_date: format(formData.endDate, 'yyyy-MM-dd'),
      days: formData.leaveType === 'half_day' ? 0.5 : days,
      reason: formData.reason,
      status: 'approved',
    },
    {
      onSuccess: () => {
        setIsEditOpen(false);
        setEditingRecordId(null);
        resetForm();
      },
    }
  );
};

const handleDelete = (id: string) => {
  if (!window.confirm('이 휴가 기록을 삭제하시겠습니까? 삭제 시 해당 휴가 근태도 함께 삭제됩니다.')) {
    return;
  }

  deleteLeaveRecord.mutate(id);
};

  const getEmployeeInfo = (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    return { name: emp?.name || '알 수 없음', department: emp?.department || '-', employeeNumber: emp?.employee_number || '-' };
  };

  // Filter records by year
  const filteredByYear = useMemo(() => {
    return leaveRecords.filter(r => {
      const startYear = parseISO(r.start_date).getFullYear();
      return startYear === requestYear;
    });
  }, [leaveRecords, requestYear]);

  const pendingRequests = filteredByYear.filter(r => r.status === 'pending');
  const processedRequests = filteredByYear.filter(r => r.status !== 'pending');

  // Balance year filtered records
  const balanceYearRecords = useMemo(() => {
    return leaveRecords.filter(r => {
      const startYear = parseISO(r.start_date).getFullYear();
      return startYear === balanceYear;
    });
  }, [leaveRecords, balanceYear]);

  const isLoading = employeesLoading || leaveLoading || payoutLoading || ledgerLoading;
  const annualLeavePolicy: AnnualLeavePolicy = {
  policyMode: settings?.leave_policy_mode === 'company' ? 'company' : 'legal',
  generationType: settings?.leave_generation_type === 'monthly' ? 'monthly' : 'yearly',
  baseAnnualLeave: Number(settings?.base_annual_leave ?? 15),
  monthlyLeaveAmount: Number(settings?.monthly_leave_amount ?? 1),
  carryOverMode:
    settings?.leave_carry_over_mode === 'none'
      ? 'none'
      : settings?.leave_carry_over_mode === 'limited'
        ? 'limited'
        : 'unlimited',
  maxCarryOver: Number(settings?.max_carry_over ?? 0),
  allowAdvanceUse: Boolean(settings?.allow_advance_leave ?? false),
  maxAdvanceUse: Number(settings?.max_advance_leave ?? 0),
};

  // 입사일 기준 근로기준법 연차 자동 계산
  const calculateAnnualLeave = (hireDate: string, targetYear: number): number => {
    const hire = parseISO(hireDate);
    const refDate = new Date(targetYear, 11, 31); // 해당 연도 말 기준
    const yearsWorked = differenceInYears(refDate, hire);
    const monthsWorked = differenceInMonths(refDate, hire);

    if (monthsWorked < 0) return 0; // 아직 입사 전

    if (yearsWorked < 1) {
      // 1년 미만: 1개월 개근 시 1일 (최대 11일)
      return Math.min(Math.max(monthsWorked, 0), 11);
    }

    // 1년 이상: 기본 15일
    let total = 15;

    // 3년차부터 추가: 15 + floor((근속연수-1)/2)
    if (yearsWorked >= 3) {
      total += Math.floor((yearsWorked - 1) / 2);
    }

    // 최대 25일
return Math.min(total, 25);
};

const getAnnualLeavePayoutDays = (employeeId: string, targetYear: number) => {
  return annualLeavePayouts
    .filter(
      (p) =>
        p.employee_id === employeeId &&
        p.settlement_month.startsWith(`${targetYear}-`),
    )
    .reduce((sum, p) => sum + Number(p.days || 0), 0);
};

const getAnnualLeaveDailyAmount = (employee: (typeof employees)[0]) => {
  if (employee.pay_type === 'monthly') {
    return Number((employee as any).annual_leave_daily_amount || 0);
  }

  if (employee.pay_type === 'hourly') {
    return Math.round(Number(employee.hourly_rate || 0) * Number(settings?.standard_work_hours || 7));
  }

  return 0;
};

const getAnnualLeavePayoutAmount = (employee: (typeof employees)[0], days: number) => {
  return Math.round(getAnnualLeaveDailyAmount(employee) * days);
};

const resetPayoutForm = () => {
  setPayoutFormData({
    employeeId: '',
    settlementMonth: `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    days: '',
    note: '',
  });
};

const handleAddPayout = () => {
  if (!payoutFormData.employeeId || !payoutFormData.settlementMonth || !payoutFormData.days) {
    toast.error('직원, 정산연월, 지급일수를 입력해주세요.');
    return;
  }

  const days = Number(payoutFormData.days);

  if (!Number.isFinite(days) || days <= 0) {
    toast.error('지급일수는 0보다 큰 숫자로 입력해주세요.');
    return;
  }

  addAnnualLeavePayout.mutate(
    {
      employee_id: payoutFormData.employeeId,
      settlement_month: payoutFormData.settlementMonth,
      days,
      note: payoutFormData.note || null,
    },
    {
      onSuccess: () => {
        resetPayoutForm();
      },
    },
  );
};

const handleDeletePayout = (id: string) => {
  if (!window.confirm('이 연차수당 지급 기록을 삭제하시겠습니까?')) {
    return;
  }

  deleteAnnualLeavePayout.mutate(id);
};

const payoutYearRecords = annualLeavePayouts.filter((p) =>
  p.settlement_month.startsWith(`${payoutYear}-`),
);

const annualLeaveAccountRows = activeEmployees.map((emp) => {
  const leaveUsages = leaveRecords
    .filter((r) => {
      const startYear = parseISO(r.start_date).getFullYear();
      return r.employee_id === emp.id && r.status === 'approved' && startYear === accountYear;
    })
    .map((r) => ({
      employee_id: r.employee_id,
      days: Number(r.days || 0),
    }));

  const payouts = annualLeavePayouts
    .filter(
      (p) =>
        p.employee_id === emp.id &&
        p.settlement_month.startsWith(`${accountYear}-`),
    )
    .map((p) => ({
      employee_id: p.employee_id,
      days: Number(p.days || 0),
    }));

  const balance = calculateAnnualLeaveBalance({
    employee: {
      id: emp.id,
      hire_date: emp.hire_date,
    },
    year: accountYear,
    policy: annualLeavePolicy,
    ledgerEntries,
    leaveUsages,
    payouts,
  });

  return {
    employee: emp,
    balance,
  };
});
const handleAddLedgerEntry = async () => {
  if (!ledgerFormData.employee_id) {
    toast.error('직원을 선택해주세요.');
    return;
  }

  if (!ledgerFormData.days || Number(ledgerFormData.days) === 0) {
    toast.error('일수를 입력해주세요.');
    return;
  }

  if (!ledgerFormData.reason.trim()) {
    toast.error('사유를 입력해주세요.');
    return;
  }

  addLedgerEntry.mutate({
    employee_id: ledgerFormData.employee_id,
    ledger_year: accountYear,
    ledger_date: new Date().toISOString().split('T')[0],
    entry_type: ledgerFormData.entry_type as any,
    days: Number(ledgerFormData.days),
    reason: ledgerFormData.reason.trim(),
  });

  setLedgerFormData({
    employee_id: '',
    entry_type: 'adjustment',
    days: '',
    reason: '',
  });
};
const getLedgerTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    grant: '자동발생',
    initial_adjustment: '최초도입 조정',
    adjustment: '관리자 조정',
    extra_grant: '회사 추가부여',
    carryover: '이월',
    advance_use: '선사용',
    leave_use: '휴가사용',
    payout: '연차수당',
  };

  return labels[type] || type;
};

const selectedAccountRow = annualLeaveAccountRows.find(
  (row) => row.employee.id === selectedAccountEmployeeId,
);

const selectedAccountDetailRows = selectedAccountRow
  ? [
      {
        id: 'system-grant',
        date: `${accountYear}-01-01`,
        type: 'grant',
        label: '자동발생',
        days: selectedAccountRow.balance.baseGrantedDays,
        reason: '입사일 기준 자동 발생',
        source: '시스템',
        editable: false,
      },
      ...ledgerEntries
        .filter(
          (entry) =>
            entry.employee_id === selectedAccountRow.employee.id &&
            entry.ledger_year === accountYear,
        )
        .map((entry) => ({
          id: entry.id,
          date: entry.ledger_date,
          type: entry.entry_type,
          label: getLedgerTypeLabel(entry.entry_type),
          days:
            entry.entry_type === 'advance_use'
              ? -Math.abs(Number(entry.days || 0))
              : Number(entry.days || 0),
          reason: entry.reason,
          source: '관리자',
          editable: true,
          raw: entry,
        })),
      ...leaveRecords
        .filter((record) => {
          const startYear = parseISO(record.start_date).getFullYear();
          return (
            record.employee_id === selectedAccountRow.employee.id &&
            record.status === 'approved' &&
            startYear === accountYear
          );
        })
        .map((record) => ({
          id: `leave-${record.id}`,
          date: record.start_date,
          type: 'leave_use',
          label: '휴가사용',
          days: -Math.abs(Number(record.days || 0)),
          reason: record.reason || '휴가 신청 승인',
          source: '휴가신청',
          editable: false,
        })),
      ...annualLeavePayouts
        .filter(
          (payout) =>
            payout.employee_id === selectedAccountRow.employee.id &&
            payout.settlement_month.startsWith(`${accountYear}-`),
        )
        .map((payout) => ({
          id: `payout-${payout.id}`,
          date: `${payout.settlement_month}-01`,
          type: 'payout',
          label: '연차수당',
          days: -Math.abs(Number(payout.days || 0)),
          reason: payout.note || '연차수당 지급',
          source: '연차수당관리',
          editable: false,
        })),
    ]
      .filter((row) => Number(row.days || 0) !== 0)
      .sort((a, b) => b.date.localeCompare(a.date))
  : [];

const handleEditLedgerEntry = (entry: any) => {
  setEditingLedgerEntryId(entry.id);
  setLedgerEditFormData({
    entry_type: entry.raw.entry_type,
    days: String(entry.raw.days),
    reason: entry.raw.reason || '',
  });
};

const handleUpdateLedgerEntry = () => {
  if (!editingLedgerEntryId) return;

  if (!ledgerEditFormData.days || Number(ledgerEditFormData.days) === 0) {
    toast.error('일수를 입력해주세요.');
    return;
  }

  if (!ledgerEditFormData.reason.trim()) {
    toast.error('사유를 입력해주세요.');
    return;
  }

  updateLedgerEntry.mutate(
    {
      id: editingLedgerEntryId,
      entry_type: ledgerEditFormData.entry_type as any,
      days: Number(ledgerEditFormData.days),
      reason: ledgerEditFormData.reason.trim(),
    },
    {
      onSuccess: () => {
        setEditingLedgerEntryId(null);
        setLedgerEditFormData({
          entry_type: 'adjustment',
          days: '',
          reason: '',
        });
      },
    },
  );
};

const handleDeleteLedgerEntry = (id: string) => {
  if (!window.confirm('이 연차계좌 내역을 삭제하시겠습니까?')) {
    return;
  }

  deleteLedgerEntry.mutate(id);
};

const handleBulkCarryOver = async () => {
  const nextYear = accountYear + 1;

  const carryOverTargets = annualLeaveAccountRows
    .filter(({ balance }) => Number(balance.remainingDays || 0) > 0)
    .filter(({ employee }) => {
      return !ledgerEntries.some(
        (entry) =>
          entry.employee_id === employee.id &&
          entry.ledger_year === nextYear &&
          entry.entry_type === 'carryover',
      );
    });

  const skippedCount = annualLeaveAccountRows.filter(({ employee, balance }) => {
    return (
      Number(balance.remainingDays || 0) > 0 &&
      ledgerEntries.some(
        (entry) =>
          entry.employee_id === employee.id &&
          entry.ledger_year === nextYear &&
          entry.entry_type === 'carryover',
      )
    );
  }).length;

  if (carryOverTargets.length === 0) {
    toast.error(
      skippedCount > 0
        ? `이미 ${nextYear}년 이월 내역이 등록되어 있습니다.`
        : '이월할 잔여연차가 없습니다.',
    );
    return;
  }

  const totalDays = carryOverTargets.reduce(
    (sum, { balance }) => sum + Number(balance.remainingDays || 0),
    0,
  );

  const confirmed = window.confirm(
    `${accountYear}년 잔여연차를 ${nextYear}년으로 일괄 이월하시겠습니까?\n\n` +
      `이월 대상: ${carryOverTargets.length}명\n` +
      `총 이월일수: ${totalDays}일\n` +
      `중복 제외: ${skippedCount}명`,
  );

  if (!confirmed) return;

  try {
    await Promise.all(
      carryOverTargets.map(({ employee, balance }) =>
        addLedgerEntry.mutateAsync({
          employee_id: employee.id,
          ledger_year: nextYear,
          ledger_date: `${nextYear}-01-01`,
          entry_type: 'carryover' as any,
          days: Number(balance.remainingDays || 0),
          reason: `${accountYear}년 잔여연차 이월`,
        }),
      ),
    );

    toast.success(
      `${carryOverTargets.length}명의 잔여연차를 ${nextYear}년으로 이월했습니다.` +
        (skippedCount > 0 ? ` 중복 ${skippedCount}명은 제외했습니다.` : ''),
    );

    setAccountYear(nextYear);
  } catch (error: any) {
    toast.error('연차 일괄 이월 중 오류가 발생했습니다: ' + (error.message || ''));
  }
};

// Export leave requests to Excel
  const exportRequestsToExcel = async () => {
    const recordsToExport = selectedEmployeeIds.length > 0
      ? filteredByYear.filter(r => selectedEmployeeIds.includes(r.employee_id))
      : filteredByYear;

    if (recordsToExport.length === 0) {
      toast.error('내보낼 데이터가 없습니다.');
      return;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${requestYear}년 휴가신청내역`);

    ws.columns = [
      { header: '사원번호', key: 'empNo', width: 12 },
      { header: '이름', key: 'name', width: 12 },
      { header: '부서', key: 'dept', width: 12 },
      { header: '휴가유형', key: 'type', width: 10 },
      { header: '시작일', key: 'start', width: 14 },
      { header: '종료일', key: 'end', width: 14 },
      { header: '일수', key: 'days', width: 8 },
      { header: '상태', key: 'status', width: 10 },
      { header: '사유', key: 'reason', width: 30 },
    ];

    // Style header
    ws.getRow(1).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    recordsToExport.forEach(r => {
      const info = getEmployeeInfo(r.employee_id);
      ws.addRow({
        empNo: info.employeeNumber,
        name: info.name,
        dept: info.department,
        type: leaveTypeConfig[r.leave_type as keyof typeof leaveTypeConfig]?.label || r.leave_type,
        start: r.start_date,
        end: r.end_date,
        days: r.days,
        status: statusConfig[r.status as keyof typeof statusConfig]?.label || r.status,
        reason: r.reason || '',
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `휴가신청내역_${requestYear}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('엑셀 파일이 다운로드되었습니다.');
  };

  // Export balance to Excel
  const exportBalanceToExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${balanceYear}년 잔여휴가현황`);

    ws.columns = [
      { header: '사원번호', key: 'empNo', width: 12 },
      { header: '이름', key: 'name', width: 12 },
      { header: '부서', key: 'dept', width: 12 },
      { header: '총 연차', key: 'total', width: 10 },
      { header: '사용', key: 'used', width: 10 },
      { header: '잔여', key: 'remaining', width: 10 },
      { header: '사용률', key: 'rate', width: 10 },
    ];

    ws.getRow(1).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const empsToExport = balanceSelectedIds.length > 0
      ? activeEmployees.filter(e => balanceSelectedIds.includes(e.id))
      : activeEmployees;
    empsToExport.forEach(emp => {
      const leaveUsages = leaveRecords
  .filter((r) => {
    const startYear = parseISO(r.start_date).getFullYear();
    return r.employee_id === emp.id && r.status === 'approved' && startYear === balanceYear;
  })
  .map((r) => ({
    employee_id: r.employee_id,
    days: Number(r.days || 0),
  }));

const payouts = annualLeavePayouts
  .filter(
    (p) =>
      p.employee_id === emp.id &&
      p.settlement_month.startsWith(`${balanceYear}-`),
  )
  .map((p) => ({
    employee_id: p.employee_id,
    days: Number(p.days || 0),
  }));

const balance = calculateAnnualLeaveBalance({
  employee: {
    id: emp.id,
    hire_date: emp.hire_date,
  },
  year: balanceYear,
  policy: annualLeavePolicy,
  ledgerEntries,
  leaveUsages,
  payouts,
});

const totalLeave = balance.totalAvailableDays;
const usedLeave = balance.usedLeaveDays + balance.payoutDays;
const remaining = balance.remainingDays;
const rate = totalLeave > 0 ? Math.round((usedLeave / totalLeave) * 100) : 0;

      ws.addRow({
        empNo: emp.employee_number,
        name: emp.name,
        dept: emp.department || '-',
        total: totalLeave,
        used: usedLeave,
        remaining,
        rate: `${rate}%`,
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `잔여휴가현황_${balanceYear}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('엑셀 파일이 다운로드되었습니다.');
  };

  // Year selector component
  const YearSelector = ({ year, onChange }: { year: number; onChange: (y: number) => void }) => (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onChange(year - 1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-semibold min-w-[60px] text-center">{year}년</span>
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onChange(year + 1)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      <Tabs defaultValue="requests" className="w-full">
        <TabsList>
  <TabsTrigger value="requests" className="flex items-center gap-2">
    <CalendarIcon className="w-4 h-4" />
    휴가 신청/승인
  </TabsTrigger>
  <TabsTrigger value="balance" className="flex items-center gap-2">
  <Users className="w-4 h-4" />
  잔여 휴가 현황
</TabsTrigger>
<TabsTrigger value="account" className="flex items-center gap-2">
  <History className="w-4 h-4" />
  연차계좌
</TabsTrigger>
<TabsTrigger value="payouts" className="flex items-center gap-2">
  <Download className="w-4 h-4" />
  연차수당 관리
</TabsTrigger>
</TabsList>

        {/* ===== 휴가 신청/승인 탭 ===== */}
        <TabsContent value="requests" className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold">휴가 신청 목록</h3>
              <YearSelector year={requestYear} onChange={setRequestYear} />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportRequestsToExcel}>
                <Download className="w-4 h-4 mr-1" />
                엑셀 내보내기
                {selectedEmployeeIds.length > 0 && ` (${selectedEmployeeIds.length}명)`}
              </Button>
              <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    휴가 신청
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>휴가 신청</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>직원 선택 *</Label>
                      <EmployeeCombobox
                        employees={activeEmployees}
                        value={formData.employeeId}
                        onValueChange={(v) => setFormData({ ...formData, employeeId: v })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>휴가 유형 *</Label>
                      <Select value={formData.leaveType} onValueChange={(v: any) => setFormData({ ...formData, leaveType: v })}>
                        <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="annual">연차</SelectItem>
                          <SelectItem value="half_day">반차</SelectItem>
                          <SelectItem value="sick">병가</SelectItem>
                          <SelectItem value="personal">경조사</SelectItem>
                          <SelectItem value="other">기타</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>시작일 *</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formData.startDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.startDate ? format(formData.startDate, "yyyy-MM-dd") : "날짜 선택"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={formData.startDate} onSelect={(d) => setFormData({ ...formData, startDate: d })} locale={ko} className="pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label>종료일 *</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formData.endDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.endDate ? format(formData.endDate, "yyyy-MM-dd") : "날짜 선택"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={formData.endDate} onSelect={(d) => setFormData({ ...formData, endDate: d })} disabled={(d) => formData.startDate ? d < formData.startDate : false} locale={ko} className="pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    {formData.startDate && formData.endDate && (
                      <p className="text-sm text-muted-foreground">
                        총 {formData.leaveType === 'half_day' ? 0.5 : calculateDays(formData.startDate, formData.endDate)}일
                      </p>
                    )}
                    <div className="space-y-2">
                      <Label>사유</Label>
                      <Textarea value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} placeholder="휴가 사유를 입력해주세요" rows={3} />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={() => { setIsOpen(false); resetForm(); }}>취소</Button>
                      <Button onClick={handleSubmit}>신청</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <Dialog
  open={isEditOpen}
  onOpenChange={(open) => {
    setIsEditOpen(open);
    if (!open) {
      setEditingRecordId(null);
      resetForm();
    }
  }}
>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>휴가 수정</DialogTitle>
    </DialogHeader>

    <div className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label>직원 선택 *</Label>
        <EmployeeCombobox
  employees={activeEmployees}
  value={formData.employeeId}
  onValueChange={() => {}}
/>
<p className="text-xs text-muted-foreground">
  직원 변경은 지원하지 않습니다. 직원이 잘못된 경우 삭제 후 다시 신청하세요.
</p>
      </div>

      <div className="space-y-2">
        <Label>휴가 유형 *</Label>
        <Select
          value={formData.leaveType}
          onValueChange={(v: any) => setFormData({ ...formData, leaveType: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="annual">연차</SelectItem>
            <SelectItem value="half_day">반차</SelectItem>
            <SelectItem value="sick">병가</SelectItem>
            <SelectItem value="personal">경조사</SelectItem>
            <SelectItem value="other">기타</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>시작일 *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !formData.startDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formData.startDate ? format(formData.startDate, 'yyyy-MM-dd') : '날짜 선택'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={formData.startDate}
                onSelect={(d) => setFormData({ ...formData, startDate: d })}
                locale={ko}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>종료일 *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !formData.endDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formData.endDate ? format(formData.endDate, 'yyyy-MM-dd') : '날짜 선택'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={formData.endDate}
                onSelect={(d) => setFormData({ ...formData, endDate: d })}
                disabled={(d) => formData.startDate ? d < formData.startDate : false}
                locale={ko}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {formData.startDate && formData.endDate && (
        <p className="text-sm text-muted-foreground">
          총 {formData.leaveType === 'half_day' ? 0.5 : calculateDays(formData.startDate, formData.endDate)}일
        </p>
      )}

      <div className="space-y-2">
        <Label>사유</Label>
        <Textarea
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          placeholder="휴가 사유를 입력해주세요"
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button
          variant="outline"
          onClick={() => {
            setIsEditOpen(false);
            setEditingRecordId(null);
            resetForm();
          }}
        >
          취소
        </Button>
        <Button onClick={handleUpdate}>
          수정 저장
        </Button>
      </div>
    </div>
  </DialogContent>
</Dialog>
            </div>
          </div>

          {/* Employee selection for export */}
          {filteredByYear.length > 0 && (
            <EmployeePicker
              employees={activeEmployees}
              selectedIds={selectedEmployeeIds}
              onSelectedIdsChange={setSelectedEmployeeIds}
              description="직원 선택 (엑셀 내보내기용, 미선택 시 전체)"
            />
          )}

          {pendingRequests.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">승인 대기 ({pendingRequests.length}건)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>직원</TableHead>
                      <TableHead>부서</TableHead>
                      <TableHead>휴가유형</TableHead>
                      <TableHead>기간</TableHead>
                      <TableHead>일수</TableHead>
                      <TableHead>사유</TableHead>
                      <TableHead className="text-right">액션</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests.map(request => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{getEmployeeInfo(request.employee_id).name}</TableCell>
                        <TableCell>{getEmployeeInfo(request.employee_id).department}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn('font-medium', leaveTypeConfig[request.leave_type as keyof typeof leaveTypeConfig]?.class)}>
                            {leaveTypeConfig[request.leave_type as keyof typeof leaveTypeConfig]?.label || request.leave_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(parseISO(request.start_date), 'MM/dd')} ~ {format(parseISO(request.end_date), 'MM/dd')}</TableCell>
                        <TableCell>{request.days}일</TableCell>
                        <TableCell className="max-w-[150px] truncate">{request.reason || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleApprove(request.id)}>
                              <Check className="w-4 h-4 mr-1" />승인
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleReject(request.id)}>
  <X className="w-4 h-4 mr-1" />반려
</Button>

<Button size="sm" variant="outline" onClick={() => openEditDialog(request)}>
  <Pencil className="w-4 h-4 mr-1" />수정
</Button>

<Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDelete(request.id)}>
  <Trash2 className="w-4 h-4 mr-1" />삭제
</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                처리 완료 {processedRequests.length > 0 && `(${processedRequests.length}건)`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {processedRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">처리된 휴가 신청이 없습니다.</p>
              ) : (() => {
                const totalProcessedPages = Math.max(1, Math.ceil(processedRequests.length / PROCESSED_PAGE_SIZE));
                const safeProcessedPage = Math.min(processedPage, totalProcessedPages);
                const paginatedProcessed = processedRequests.slice(
                  (safeProcessedPage - 1) * PROCESSED_PAGE_SIZE,
                  safeProcessedPage * PROCESSED_PAGE_SIZE
                );
                return (
                  <div className="space-y-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>직원</TableHead>
                          <TableHead>부서</TableHead>
                          <TableHead>휴가유형</TableHead>
                          <TableHead>기간</TableHead>
                          <TableHead>일수</TableHead>
                          <TableHead>상태</TableHead>
<TableHead>처리일</TableHead>
<TableHead className="text-right">액션</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedProcessed.map(request => (
                          <TableRow key={request.id}>
                            <TableCell className="font-medium">{getEmployeeInfo(request.employee_id).name}</TableCell>
                            <TableCell>{getEmployeeInfo(request.employee_id).department}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={cn('font-medium', leaveTypeConfig[request.leave_type as keyof typeof leaveTypeConfig]?.class)}>
                                {leaveTypeConfig[request.leave_type as keyof typeof leaveTypeConfig]?.label || request.leave_type}
                              </Badge>
                            </TableCell>
                            <TableCell>{format(parseISO(request.start_date), 'MM/dd')} ~ {format(parseISO(request.end_date), 'MM/dd')}</TableCell>
                            <TableCell>{request.days}일</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={cn('font-medium', statusConfig[request.status as keyof typeof statusConfig]?.class)}>
                                {statusConfig[request.status as keyof typeof statusConfig]?.label || request.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{request.updated_at ? format(parseISO(request.updated_at), 'yyyy-MM-dd') : '-'}</TableCell>
<TableCell className="text-right">
  <div className="flex justify-end gap-1">
    <Button
      size="sm"
      variant="outline"
      onClick={() => openEditDialog(request)}
    >
      <Pencil className="w-4 h-4 mr-1" />
      수정
    </Button>
    <Button
      size="sm"
      variant="outline"
      className="text-red-600"
      onClick={() => handleDelete(request.id)}
    >
      <Trash2 className="w-4 h-4 mr-1" />
      삭제
    </Button>
  </div>
</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {totalProcessedPages > 1 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          총 {processedRequests.length}건 중 {(safeProcessedPage - 1) * PROCESSED_PAGE_SIZE + 1}–{Math.min(safeProcessedPage * PROCESSED_PAGE_SIZE, processedRequests.length)}건
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={safeProcessedPage <= 1}
                            onClick={() => setProcessedPage(p => Math.max(1, p - 1))}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          {Array.from({ length: totalProcessedPages }, (_, i) => i + 1)
                            .filter(p => p === 1 || p === totalProcessedPages || Math.abs(p - safeProcessedPage) <= 2)
                            .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                              if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push('ellipsis');
                              acc.push(p);
                              return acc;
                            }, [])
                            .map((item, idx) =>
                              item === 'ellipsis' ? (
                                <span key={`e-${idx}`} className="px-2 text-muted-foreground">…</span>
                              ) : (
                                <Button
                                  key={item}
                                  variant={item === safeProcessedPage ? 'default' : 'outline'}
                                  size="sm"
                                  className="min-w-[36px]"
                                  onClick={() => setProcessedPage(item)}
                                >
                                  {item}
                                </Button>
                              )
                            )}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={safeProcessedPage >= totalProcessedPages}
                            onClick={() => setProcessedPage(p => Math.min(totalProcessedPages, p + 1))}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== 잔여 휴가 현황 탭 ===== */}
        <TabsContent value="balance" className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold">직원별 잔여 휴가 현황</h3>
              <YearSelector year={balanceYear} onChange={setBalanceYear} />
            </div>
            <Button variant="outline" size="sm" onClick={exportBalanceToExcel}>
              <Download className="w-4 h-4 mr-1" />
              엑셀 내보내기
              {balanceSelectedIds.length > 0 && ` (${balanceSelectedIds.length}명)`}
            </Button>
          </div>

          {/* Employee selection for balance */}
          <EmployeePicker
            employees={activeEmployees}
            selectedIds={balanceSelectedIds}
            onSelectedIdsChange={(ids) => { setBalanceSelectedIds(ids); setBalancePage(1); }}
            description="직원 선택 (엑셀 내보내기 및 필터링용, 미선택 시 전체)"
          />

          {(() => {
            const balanceEmployees = balanceSelectedIds.length > 0
              ? activeEmployees.filter(e => balanceSelectedIds.includes(e.id))
              : activeEmployees;
            const totalPages = Math.max(1, Math.ceil(balanceEmployees.length / BALANCE_PAGE_SIZE));
            const safePage = Math.min(balancePage, totalPages);
            const paginatedEmployees = balanceEmployees.slice(
              (safePage - 1) * BALANCE_PAGE_SIZE,
              safePage * BALANCE_PAGE_SIZE
            );

            return (
              <>
                <div className="rounded-lg border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>사원번호</TableHead>
                        <TableHead>이름</TableHead>
                        <TableHead>부서</TableHead>
                        <TableHead className="text-center">총 연차</TableHead>
                        <TableHead className="text-center">사용</TableHead>
                        <TableHead className="text-center">잔여</TableHead>
                        <TableHead className="text-center">사용률</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedEmployees.map(employee => {
                        const leaveUsages = leaveRecords
  .filter((r) => {
    const startYear = parseISO(r.start_date).getFullYear();
    return r.employee_id === employee.id && r.status === 'approved' && startYear === balanceYear;
  })
  .map((r) => ({
    employee_id: r.employee_id,
    days: Number(r.days || 0),
  }));

const payouts = annualLeavePayouts
  .filter(
    (p) =>
      p.employee_id === employee.id &&
      p.settlement_month.startsWith(`${balanceYear}-`),
  )
  .map((p) => ({
    employee_id: p.employee_id,
    days: Number(p.days || 0),
  }));

const balance = calculateAnnualLeaveBalance({
  employee: {
    id: employee.id,
    hire_date: employee.hire_date,
  },
  year: balanceYear,
  policy: annualLeavePolicy,
  ledgerEntries,
  leaveUsages,
  payouts,
});

const totalAnnualLeave = balance.totalAvailableDays;
const usedLeave = balance.usedLeaveDays + balance.payoutDays;
const remainingLeave = balance.remainingDays;
const usageRate = totalAnnualLeave > 0 ? Math.round((usedLeave / totalAnnualLeave) * 100) : 0;

                        return (
                          <TableRow key={employee.id}>
                            <TableCell className="font-medium">{employee.employee_number}</TableCell>
                            <TableCell>{employee.name}</TableCell>
                            <TableCell>{employee.department || '-'}</TableCell>
                            <TableCell className="text-center">{totalAnnualLeave}일</TableCell>
                            <TableCell className="text-center">{usedLeave}일</TableCell>
                            <TableCell className="text-center font-semibold text-primary">{remainingLeave}일</TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  'font-medium',
                                  usageRate >= 80 ? 'bg-red-100 text-red-800' :
                                  usageRate >= 50 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-green-100 text-green-800'
                                )}
                              >
                                {usageRate}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-sm text-muted-foreground">
                      총 {balanceEmployees.length}명 중 {(safePage - 1) * BALANCE_PAGE_SIZE + 1}–{Math.min(safePage * BALANCE_PAGE_SIZE, balanceEmployees.length)}명
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safePage <= 1}
                        onClick={() => setBalancePage(p => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                        .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                          if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push('ellipsis');
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((item, idx) =>
                          item === 'ellipsis' ? (
                            <span key={`e-${idx}`} className="px-2 text-muted-foreground">…</span>
                          ) : (
                            <Button
                              key={item}
                              variant={item === safePage ? 'default' : 'outline'}
                              size="sm"
                              className="min-w-[36px]"
                              onClick={() => setBalancePage(item)}
                            >
                              {item}
                            </Button>
                          )
                        )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safePage >= totalPages}
                        onClick={() => setBalancePage(p => Math.min(totalPages, p + 1))}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
                </TabsContent>

{/* ===== 연차계좌 탭 ===== */}
<TabsContent value="account" className="space-y-4">
  <Card>
    <CardHeader>
      <CardTitle className="text-base">연차계좌 조정 등록</CardTitle>
      <CardDescription>
        최초 도입, 회사 추가부여, 이월, 선사용, 관리자 조정 내역을 등록합니다.
      </CardDescription>
    </CardHeader>
    <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
      <div className="space-y-2">
        <Label>직원</Label>
        <Select
          value={ledgerFormData.employee_id}
          onValueChange={(value) =>
            setLedgerFormData((prev) => ({ ...prev, employee_id: value }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="직원 선택" />
          </SelectTrigger>
          <SelectContent>
            {activeEmployees.map((emp) => (
              <SelectItem key={emp.id} value={emp.id}>
                {emp.name} ({emp.employee_number})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>구분</Label>
        <Select
          value={ledgerFormData.entry_type}
          onValueChange={(value) =>
            setLedgerFormData((prev) => ({ ...prev, entry_type: value }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="initial_adjustment">최초도입 조정</SelectItem>
            <SelectItem value="adjustment">관리자 조정</SelectItem>
            <SelectItem value="extra_grant">회사 추가부여</SelectItem>
            <SelectItem value="carryover">이월</SelectItem>
            <SelectItem value="advance_use">선사용</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>일수</Label>
        <Input
          type="number"
          step="0.5"
          value={ledgerFormData.days}
          onChange={(e) =>
            setLedgerFormData((prev) => ({ ...prev, days: e.target.value }))
          }
          placeholder="예: 3 또는 -2"
        />
      </div>

      <div className="space-y-2">
        <Label>사유</Label>
        <Input
          value={ledgerFormData.reason}
          onChange={(e) =>
            setLedgerFormData((prev) => ({ ...prev, reason: e.target.value }))
          }
          placeholder="예: 프로그램 최초 도입"
        />
      </div>

      <div className="flex items-end">
        <Button
          onClick={handleAddLedgerEntry}
          disabled={addLedgerEntry.isPending}
          className="w-full"
        >
          {addLedgerEntry.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          등록
        </Button>
      </div>
    </CardContent>
  </Card>

  <div className="flex flex-wrap justify-between items-center gap-2">
  <div className="flex items-center gap-4">
    <h3 className="text-lg font-semibold">직원별 연차계좌</h3>
    <YearSelector year={accountYear} onChange={setAccountYear} />
  </div>

  <Button
    variant="outline"
    size="sm"
    onClick={handleBulkCarryOver}
    disabled={addLedgerEntry.isPending}
  >
    {addLedgerEntry.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
    {accountYear + 1}년으로 일괄 이월
  </Button>
</div>

  <div className="rounded-lg border bg-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>사원번호</TableHead>
          <TableHead>이름</TableHead>
          <TableHead>부서</TableHead>
          <TableHead className="text-center">자동발생</TableHead>
          <TableHead className="text-center">최초조정</TableHead>
          <TableHead className="text-center">회사추가</TableHead>
          <TableHead className="text-center">이월</TableHead>
          <TableHead className="text-center">선사용</TableHead>
          <TableHead className="text-center">휴가사용</TableHead>
          <TableHead className="text-center">연차수당</TableHead>
          <TableHead className="text-center">현재잔여</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {annualLeaveAccountRows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
              조회할 직원이 없습니다.
            </TableCell>
          </TableRow>
        ) : (
          annualLeaveAccountRows.map(({ employee, balance }) => (
  <TableRow
    key={employee.id}
    className="cursor-pointer hover:bg-muted/50"
    onClick={() => setSelectedAccountEmployeeId(employee.id)}
  >
              <TableCell className="font-medium">{employee.employee_number}</TableCell>
              <TableCell>{employee.name}</TableCell>
              <TableCell>{employee.department || '-'}</TableCell>
              <TableCell className="text-center">{balance.baseGrantedDays}일</TableCell>
              <TableCell className="text-center">{balance.initialAdjustmentDays}일</TableCell>
              <TableCell className="text-center">{balance.extraGrantDays}일</TableCell>
              <TableCell className="text-center">{balance.carryOverDays}일</TableCell>
              <TableCell className="text-center text-red-600">
  {balance.advanceUseDays > 0 ? `-${balance.advanceUseDays}` : balance.advanceUseDays}일
</TableCell>
              <TableCell className="text-center">{balance.usedLeaveDays}일</TableCell>
              <TableCell className="text-center">{balance.payoutDays}일</TableCell>
              <TableCell className="text-center font-semibold">
                {balance.remainingDays}일
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  </div>
</TabsContent>
<Dialog
  open={!!selectedAccountEmployeeId}
  onOpenChange={(open) => {
    if (!open) {
      setSelectedAccountEmployeeId(null);
      setEditingLedgerEntryId(null);
    }
  }}
>
  <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle>연차계좌 상세</DialogTitle>
    </DialogHeader>

    {selectedAccountRow && (
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="font-semibold">
            {selectedAccountRow.employee.name} ({selectedAccountRow.employee.employee_number})
          </p>
          <p className="text-sm text-muted-foreground">
            {selectedAccountRow.employee.department || '-'} · {accountYear}년
          </p>
          <p className="mt-2 text-lg font-bold">
            현재잔여 {selectedAccountRow.balance.remainingDays}일
          </p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>날짜</TableHead>
              <TableHead>구분</TableHead>
              <TableHead className="text-center">일수</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>출처</TableHead>
              <TableHead className="text-right">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedAccountDetailRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  원장 내역이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              selectedAccountDetailRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.label}</TableCell>
                  <TableCell
                    className={cn(
                      'text-center font-medium',
                      row.days > 0 ? 'text-green-600' : 'text-red-600',
                    )}
                  >
                    {row.days > 0 ? `+${row.days}` : row.days}일
                  </TableCell>
                  <TableCell>{row.reason}</TableCell>
                  <TableCell>{row.source}</TableCell>
                  <TableCell className="text-right">
                    {row.editable ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditLedgerEntry(row)}
                        >
                          <Pencil className="w-4 h-4 mr-1" />
                          수정
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600"
                          onClick={() => handleDeleteLedgerEntry(row.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          삭제
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">자동</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {editingLedgerEntryId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">연차계좌 내역 수정</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>구분</Label>
                <Select
                  value={ledgerEditFormData.entry_type}
                  onValueChange={(value) =>
                    setLedgerEditFormData((prev) => ({ ...prev, entry_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="initial_adjustment">최초도입 조정</SelectItem>
                    <SelectItem value="adjustment">관리자 조정</SelectItem>
                    <SelectItem value="extra_grant">회사 추가부여</SelectItem>
                    <SelectItem value="carryover">이월</SelectItem>
                    <SelectItem value="advance_use">선사용</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>일수</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={ledgerEditFormData.days}
                  onChange={(e) =>
                    setLedgerEditFormData((prev) => ({ ...prev, days: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>사유</Label>
                <Input
                  value={ledgerEditFormData.reason}
                  onChange={(e) =>
                    setLedgerEditFormData((prev) => ({ ...prev, reason: e.target.value }))
                  }
                />
              </div>

              <div className="flex items-end gap-2">
                <Button
                  onClick={handleUpdateLedgerEntry}
                  disabled={updateLedgerEntry.isPending}
                  className="flex-1"
                >
                  {updateLedgerEntry.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  저장
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditingLedgerEntryId(null)}
                >
                  취소
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    )}
  </DialogContent>
</Dialog>

<TabsContent value="payouts" className="space-y-4">
  <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">연차수당 관리</h3>
              <p className="text-sm text-muted-foreground">
                미사용 연차를 급여로 지급할 정산월과 지급일수를 등록합니다. 등록된 지급일수는 잔여연차에서 차감됩니다.
              </p>
            </div>
            <YearSelector year={payoutYear} onChange={setPayoutYear} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">연차수당 지급 등록</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>직원 *</Label>
                  <EmployeeCombobox
                    employees={activeEmployees}
                    value={payoutFormData.employeeId}
                    onValueChange={(employeeId) =>
                      setPayoutFormData((prev) => ({ ...prev, employeeId }))
                    }
                    placeholder="직원 선택"
                  />
                </div>

                <div className="space-y-2">
                  <Label>정산연월 *</Label>
                  <Input
                    type="month"
                    value={payoutFormData.settlementMonth}
                    onChange={(e) =>
                      setPayoutFormData((prev) => ({ ...prev, settlementMonth: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>지급일수 *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={payoutFormData.days}
                    onChange={(e) =>
                      setPayoutFormData((prev) => ({ ...prev, days: e.target.value }))
                    }
                    placeholder="예: 1"
                  />
                </div>

                <div className="space-y-2">
                  <Label>예상 지급액</Label>
                  <div className="h-10 flex items-center rounded-md border bg-muted/30 px-3 text-sm font-medium">
                    {(() => {
                      const employee = employees.find((e) => e.id === payoutFormData.employeeId);
                      const days = Number(payoutFormData.days || 0);
                      if (!employee || !days) return '0원';
                      return `${getAnnualLeavePayoutAmount(employee, days).toLocaleString()}원`;
                    })()}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>비고</Label>
                <Textarea
                  value={payoutFormData.note}
                  onChange={(e) =>
                    setPayoutFormData((prev) => ({ ...prev, note: e.target.value }))
                  }
                  placeholder="예: 4월 미사용 연차 1일 지급"
                  rows={2}
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleAddPayout} disabled={addAnnualLeavePayout.isPending}>
                  {addAnnualLeavePayout.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Plus className="w-4 h-4 mr-2" />
                  등록
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {payoutYear}년 연차수당 지급 내역 {payoutYearRecords.length > 0 && `(${payoutYearRecords.length}건)`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>정산연월</TableHead>
                    <TableHead>직원</TableHead>
                    <TableHead>부서</TableHead>
                    <TableHead className="text-center">지급일수</TableHead>
                    <TableHead className="text-right">예상 지급액</TableHead>
                    <TableHead>비고</TableHead>
                    <TableHead className="text-right">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payoutYearRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        등록된 연차수당 지급 내역이 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payoutYearRecords.map((record) => {
                      const employee = employees.find((e) => e.id === record.employee_id);
                      const amount = employee ? getAnnualLeavePayoutAmount(employee, Number(record.days)) : 0;

                      return (
                        <TableRow key={record.id}>
                          <TableCell>{record.settlement_month}</TableCell>
                          <TableCell className="font-medium">{employee?.name || '알 수 없음'}</TableCell>
                          <TableCell>{employee?.department || '-'}</TableCell>
                          <TableCell className="text-center">{Number(record.days)}일</TableCell>
                          <TableCell className="text-right font-medium">{amount.toLocaleString()}원</TableCell>
                          <TableCell className="max-w-[220px] truncate">{record.note || '-'}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => handleDeletePayout(record.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              삭제
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
