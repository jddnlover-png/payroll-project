import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, FileDown } from "lucide-react";
import ExcelJS from "exceljs";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

interface AdminOrganizationRow {
  id: string;
  name: string;
  business_number: string | null;
  representative: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string | null;
}

interface EmployeeCountRow {
  organization_id: string;
  is_active: boolean;
  resignation_date: string | null;
}

interface FeatureFlagRow {
  organization_id: string;
  regular_payroll_enabled: boolean;
  construction_daily_enabled: boolean;
}

interface CustomerProfileRow {
  organization_id: string;
  customer_status: string;
  billing_status: string;
  contact_name: string | null;
  contact_mobile: string | null;
  invoice_business_type: string | null;
  invoice_business_item: string | null;
  invoice_email: string | null;
  admin_memo: string | null;
}

interface DailyAttendanceBillingRow {
  organization_id: string;
  worker_name: string | null;
  ssn_masked: string | null;
  phone: string | null;
}

interface BillingSnapshotRow {
  organization_id: string;
  billing_month: string;
  is_confirmed: boolean;
}

interface MessageUsageLogRow {
  organization_id: string;
  channel: string;
  document_type: string | null;
  billing_year: number;
  billing_month: number;
}

interface EditFormState {
  contact_name: string;
  contact_mobile: string;
  invoice_business_type: string;
  invoice_business_item: string;
  invoice_email: string;
  customer_status: string;
  billing_status: string;
  admin_memo: string;
  regular_payroll_enabled: boolean;
  construction_daily_enabled: boolean;
}

const addDays = (dateString: string | null, days: number) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date;
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR");
};

const formatDateFromDate = (date: Date | null) => {
  if (!date) return "-";
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR");
};

const toDateInputValue = (date: Date | null) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getCustomerStatusLabel = (status?: string) => {
  switch (status) {
    case "active":
      return "사용중";
    case "trial":
      return "체험중";
    case "pending_payment":
      return "결제대기";
    case "suspended":
      return "정지";
    case "cancelled":
      return "해지";
    default:
      return "사용중";
  }
};

const getBillingStatusLabel = (status?: string) => {
  switch (status) {
    case "paid":
      return "결제완료";
    case "unpaid":
      return "미납";
    case "free_trial":
      return "무료체험";
    case "overdue":
      return "연체";
    case "paused":
      return "일시중지";
    default:
      return "미납";
  }
};
const getPreviousMonthValue = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
};

const formatWon = (amount: number) => {
  return `${amount.toLocaleString("ko-KR")}원`;
};

const calculateRegularPayrollFee = (activeEmployeeCount: number) => {
  if (activeEmployeeCount <= 0) return 0;
  if (activeEmployeeCount <= 10) return 10000;
  if (activeEmployeeCount <= 30) return 20000;
  if (activeEmployeeCount <= 60) return 30000;
  return null;
};

const calculateDailyWorkerFee = (dailyWorkerCount: number) => {
  if (dailyWorkerCount <= 0) return 0;
  if (dailyWorkerCount <= 60) return 30000;
  if (dailyWorkerCount <= 100) return 40000;
  return 50000;
};

const formatFee = (amount: number | null) => {
  if (amount === null) return "상담";
  return formatWon(amount);
};

const normalizeWorkerName = (name: string | null | undefined) => {
  return String(name ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
};

const getDailyWorkerBillingKey = (row: DailyAttendanceBillingRow) => {
  if (row.ssn_masked) {
    return `SSN:${String(row.ssn_masked).trim()}`;
  }

  if (row.phone) {
    return `PHONE:${String(row.phone).replace(/[^0-9]/g, "")}`;
  }

  const name = normalizeWorkerName(row.worker_name);
  if (!name) return null;

  return `NAME:${name}`;
};

export default function Admin() {
  const { isSuperAdmin, loading } = useSuperAdmin();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleAdminLogout = async () => {
    sessionStorage.removeItem("admin_login_verified");
    await supabase.auth.signOut();
    navigate("/admin-login", { replace: true });
  };

  const [activeTab, setActiveTab] = useState("customers");
const [searchKeyword, setSearchKeyword] = useState("");
const [trialEndFilterDate, setTrialEndFilterDate] = useState("");
const [billingMonth, setBillingMonth] = useState(getPreviousMonthValue());

  const [selectedOrg, setSelectedOrg] = useState<AdminOrganizationRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<EditFormState>({
    contact_name: "",
    contact_mobile: "",
    invoice_business_type: "",
    invoice_business_item: "",
    invoice_email: "",
    customer_status: "active",
    billing_status: "unpaid",
    admin_memo: "",
    regular_payroll_enabled: true,
    construction_daily_enabled: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: async () => {
      const { data: organizations, error: orgError } = await supabase.rpc("get_admin_organizations" as any);

if (orgError) throw orgError;

      const orgIds = (organizations ?? []).map((org) => org.id);

      if (orgIds.length === 0) {
        return {
          organizations: [],
          employees: [],
          featureFlags: [],
          customerProfiles: [],
        };
      }

      const [
        { data: employees, error: empError },
        { data: featureFlags, error: flagError },
        { data: customerProfiles, error: profileError },
      ] = await Promise.all([
        supabase.from("employees").select("organization_id, is_active, resignation_date").in("organization_id", orgIds),

        supabase
          .from("organization_feature_flags" as any)
          .select("organization_id, regular_payroll_enabled, construction_daily_enabled")
          .in("organization_id", orgIds),

        supabase
          .from("admin_customer_profiles" as any)
          .select(
            "organization_id, customer_status, billing_status, contact_name, contact_mobile, invoice_business_type, invoice_business_item, invoice_email, admin_memo",
          )
          .in("organization_id", orgIds),
      ]);

      if (empError) throw empError;
      if (flagError) throw flagError;
      if (profileError) throw profileError;

      return {
        organizations: organizations as AdminOrganizationRow[],
        employees: (employees ?? []) as EmployeeCountRow[],
        featureFlags: (featureFlags ?? []) as unknown as FeatureFlagRow[],
        customerProfiles: (customerProfiles ?? []) as unknown as CustomerProfileRow[],
      };
    },
    enabled: isSuperAdmin,
  });

  const organizations = data?.organizations ?? [];
const employees = data?.employees ?? [];
const featureFlags = data?.featureFlags ?? [];
const customerProfiles = data?.customerProfiles ?? [];

const { data: dailyWorkerCountMap = {}, isLoading: isDailyWorkerLoading } = useQuery({
  queryKey: ["admin-daily-worker-counts", billingMonth],
  queryFn: async () => {
    if (!billingMonth) return {};

    const [year, month] = billingMonth.split("-").map(Number);
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

const orgIds = organizations.map((org) => org.id);

if (orgIds.length === 0) {
  return {};
}

const { data: attendanceRows, error: attendanceError } = await supabase
  .from("daily_attendance")
  .select("organization_id, worker_name, ssn_masked, phone")
  .in("organization_id", orgIds)
  .gte("work_date", startDate)
  .lte("work_date", endDate);

    if (attendanceError) throw attendanceError;

    const orgWorkerMap = new Map<string, Set<string>>();

    ((attendanceRows ?? []) as DailyAttendanceBillingRow[]).forEach((row) => {
      if (!row.organization_id) return;

      const workerKey = getDailyWorkerBillingKey(row);
      if (!workerKey) return;

      if (!orgWorkerMap.has(row.organization_id)) {
        orgWorkerMap.set(row.organization_id, new Set());
      }

      orgWorkerMap.get(row.organization_id)!.add(workerKey);
    });

    return Array.from(orgWorkerMap.entries()).reduce<Record<string, number>>((acc, [organizationId, workerSet]) => {
      acc[organizationId] = workerSet.size;
      return acc;
    }, {});
  },
  enabled: isSuperAdmin && !!billingMonth && organizations.length > 0,
});

const { data: billingSnapshots = [] } = useQuery({
  queryKey: ["admin-billing-snapshots", billingMonth],
  queryFn: async () => {
    if (!billingMonth) return [];

    const { data, error } = await supabase
      .from("billing_snapshots" as any)
      .select("organization_id, billing_month, is_confirmed")
      .eq("billing_month", billingMonth);

    if (error) throw error;

    return (data ?? []) as unknown as BillingSnapshotRow[];
  },
  enabled: isSuperAdmin && !!billingMonth,
});

const { data: messageUsageLogs = [] } = useQuery({
  queryKey: ["admin-message-usage", billingMonth],
  queryFn: async () => {
    if (!billingMonth) return [];

    const [year, month] = billingMonth.split("-").map(Number);
    const orgIds = organizations.map((org) => org.id);

    if (orgIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from("message_usage_logs" as any)
      .select("organization_id, channel, document_type, billing_year, billing_month")
      .eq("channel", "sms")
      .eq("status", "success")
      .eq("billing_year", year)
      .eq("billing_month", month)
      .in("organization_id", orgIds);

    if (error) throw error;

    return (data ?? []) as unknown as MessageUsageLogRow[];
  },
  enabled: isSuperAdmin && !!billingMonth && organizations.length > 0,
});

const confirmedSnapshotMap = useMemo(() => {
  return billingSnapshots.reduce<Record<string, boolean>>((acc, row) => {
    acc[row.organization_id] = row.is_confirmed;
    return acc;
  }, {});
}, [billingSnapshots]);

const isBillingMonthConfirmed = useMemo(() => {
  return billingSnapshots.some((row) => row.is_confirmed);
}, [billingSnapshots]);

const smsUsageMap = useMemo(() => {
  return messageUsageLogs.reduce<
    Record<
      string,
      {
        monthly: number;
        daily: number;
        total: number;
      }
    >
  >((acc, row) => {
    if (!acc[row.organization_id]) {
      acc[row.organization_id] = {
        monthly: 0,
        daily: 0,
        total: 0,
      };
    }

    if (row.document_type === "monthly_payslip") {
      acc[row.organization_id].monthly += 1;
    }

    if (row.document_type === "daily_payslip") {
      acc[row.organization_id].daily += 1;
    }

    acc[row.organization_id].total += 1;

    return acc;
  }, {});
}, [messageUsageLogs]);

  const getCounts = (organizationId: string) => {
    const rows = employees.filter((emp) => emp.organization_id === organizationId);
    const total = rows.length;
    const resigned = rows.filter((emp) => !emp.is_active || !!emp.resignation_date).length;
    const active = total - resigned;

    return { total, active, resigned };
  };

  const getFeatureFlags = (organizationId: string) => {
    return featureFlags.find((flag) => flag.organization_id === organizationId);
  };

  const getCustomerProfile = (organizationId: string) => {
    return customerProfiles.find((profile) => profile.organization_id === organizationId);
  };

  const filteredOrganizations = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    return organizations.filter((org) => {
      const profile = getCustomerProfile(org.id);
      const trialEndDate = addDays(org.created_at, 50);
      const trialEndValue = toDateInputValue(trialEndDate);

      const matchesKeyword =
        !keyword ||
        [
          org.name,
          org.representative,
          org.business_number,
          org.phone,
          org.email,
          org.address,
          profile?.contact_name,
          profile?.contact_mobile,
          profile?.invoice_business_type,
          profile?.invoice_business_item,
          profile?.invoice_email,
          getCustomerStatusLabel(profile?.customer_status),
          getBillingStatusLabel(profile?.billing_status),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));

      const matchesTrialEndDate = !trialEndFilterDate || trialEndValue === trialEndFilterDate;

      return matchesKeyword && matchesTrialEndDate;
    });
  }, [organizations, customerProfiles, searchKeyword, trialEndFilterDate]);
  const billingSummary = useMemo(() => {
  let totalBillableAmount = 0;
  let consultCount = 0;
  let dailyEnabledCount = 0;

  organizations.forEach((org) => {
    const counts = getCounts(org.id);
    const flags = getFeatureFlags(org.id);

    const regularEnabled = flags?.regular_payroll_enabled ?? true;
    const dailyEnabled = flags?.construction_daily_enabled ?? false;
    const dailyWorkerCount = dailyWorkerCountMap[org.id] ?? 0;

    if (dailyEnabled) {
      dailyEnabledCount += 1;
    }

    const regularFee = dailyEnabled
  ? counts.active > 60
    ? null
    : 0
  : regularEnabled
    ? calculateRegularPayrollFee(counts.active)
    : 0;

const dailyFee = dailyEnabled ? calculateDailyWorkerFee(dailyWorkerCount) : 0;

if (regularFee === null) {
  consultCount += 1;
  return;
}

totalBillableAmount += regularFee + dailyFee;
  });

  return {
    totalOrganizations: organizations.length,
    totalBillableAmount,
    consultCount,
    dailyEnabledCount,
  };
}, [organizations, employees, featureFlags, dailyWorkerCountMap]);
const downloadWorkbook = async (workbook: ExcelJS.Workbook, fileName: string) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.URL.revokeObjectURL(url);
};

const exportCustomersToExcel = async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("고객사관리");

  sheet.columns = [
    { header: "회사명", key: "name", width: 24 },
    { header: "대표자", key: "representative", width: 14 },
    { header: "사업자번호", key: "business_number", width: 18 },
    { header: "가입일", key: "created_at", width: 16 },
    { header: "무료종료일", key: "trial_end", width: 16 },
    { header: "회사 연락처", key: "phone", width: 18 },
    { header: "회사 이메일", key: "email", width: 26 },
    { header: "담당자", key: "contact_name", width: 14 },
    { header: "담당자 휴대폰", key: "contact_mobile", width: 18 },
    { header: "업태", key: "invoice_business_type", width: 16 },
    { header: "종목", key: "invoice_business_item", width: 16 },
    { header: "정기급여", key: "regular_payroll_enabled", width: 12 },
    { header: "일용직", key: "construction_daily_enabled", width: 12 },
    { header: "재직", key: "active", width: 10 },
    { header: "퇴사", key: "resigned", width: 10 },
    { header: "고객상태", key: "customer_status", width: 14 },
    { header: "결제상태", key: "billing_status", width: 14 },
  ];

  filteredOrganizations.forEach((org) => {
    const counts = getCounts(org.id);
    const flags = getFeatureFlags(org.id);
    const profile = getCustomerProfile(org.id);

    sheet.addRow({
      name: org.name,
      representative: org.representative ?? "",
      business_number: org.business_number ?? "",
      created_at: formatDate(org.created_at),
      trial_end: formatDateFromDate(addDays(org.created_at, 50)),
      phone: org.phone ?? "",
      email: org.email ?? "",
      contact_name: profile?.contact_name ?? "",
      contact_mobile: profile?.contact_mobile ?? "",
      invoice_business_type: profile?.invoice_business_type ?? "",
      invoice_business_item: profile?.invoice_business_item ?? "",
      regular_payroll_enabled: flags?.regular_payroll_enabled ?? true ? "ON" : "OFF",
      construction_daily_enabled: flags?.construction_daily_enabled ? "ON" : "OFF",
      active: counts.active,
      resigned: counts.resigned,
      customer_status: getCustomerStatusLabel(profile?.customer_status),
      billing_status: getBillingStatusLabel(profile?.billing_status),
    });
  });

  sheet.getRow(1).font = { bold: true };
  await downloadWorkbook(workbook, `고객사관리_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

const exportBillingToExcel = async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("과금관리");

    sheet.columns = [
  { header: "회사명", key: "name", width: 24 },
  { header: "사업자번호", key: "business_number", width: 18 },
  { header: "청구 기준월", key: "billing_month", width: 14 },
    { header: "정기급여 재직자", key: "active", width: 16 },
    { header: "일용직 고유 인원", key: "daily_worker_count", width: 18 },
    { header: "정기급여 요금", key: "regular_fee", width: 16 },
    { header: "일용직 요금", key: "daily_fee", width: 16 },
    { header: "예상 청구금액", key: "total_fee", width: 18 },
    { header: "상태", key: "status", width: 14 },
  ];

  organizations.forEach((org) => {
    const counts = getCounts(org.id);
    const flags = getFeatureFlags(org.id);

    const regularEnabled = flags?.regular_payroll_enabled ?? true;
    const dailyEnabled = flags?.construction_daily_enabled ?? false;
    const dailyWorkerCount = dailyWorkerCountMap[org.id] ?? 0;

    const regularFee = dailyEnabled
      ? counts.active > 60
        ? null
        : 0
      : regularEnabled
        ? calculateRegularPayrollFee(counts.active)
        : 0;

    const dailyFee = dailyEnabled ? calculateDailyWorkerFee(dailyWorkerCount) : 0;
    const totalFee = regularFee === null ? null : regularFee + dailyFee;

    sheet.addRow({
  name: org.name,
  business_number: org.business_number ?? "",
  billing_month: billingMonth,
      active: regularEnabled ? counts.active : "-",
      daily_worker_count: dailyEnabled ? dailyWorkerCount : "-",
      regular_fee: dailyEnabled && regularFee !== null ? "포함" : formatFee(regularFee),
      daily_fee: formatFee(dailyFee),
      total_fee: formatFee(totalFee),
      status: confirmedSnapshotMap[org.id] ? "확정" : totalFee === null ? "상담 필요" : "예상 청구",
    });
  });

  sheet.getRow(1).font = { bold: true };
  await downloadWorkbook(workbook, `과금관리_${billingMonth}.xlsx`);
};

  const openEditDialog = (org: AdminOrganizationRow) => {
    const profile = getCustomerProfile(org.id);
    const flags = getFeatureFlags(org.id);

    setSelectedOrg(org);
    setForm({
      contact_name: profile?.contact_name ?? "",
      contact_mobile: profile?.contact_mobile ?? "",
      invoice_business_type: profile?.invoice_business_type ?? "",
      invoice_business_item: profile?.invoice_business_item ?? "",
      invoice_email: profile?.invoice_email ?? "",
      customer_status: profile?.customer_status ?? "active",
      billing_status: profile?.billing_status ?? "unpaid",
      admin_memo: profile?.admin_memo ?? "",
      regular_payroll_enabled: flags?.regular_payroll_enabled ?? true,
      construction_daily_enabled: flags?.construction_daily_enabled ?? false,
    });
    setEditOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrg) throw new Error("선택된 고객사가 없습니다.");

      const profilePayload = {
        organization_id: selectedOrg.id,
        contact_name: form.contact_name || null,
        contact_mobile: form.contact_mobile || null,
        invoice_business_type: form.invoice_business_type || null,
        invoice_business_item: form.invoice_business_item || null,
        invoice_email: form.invoice_email || null,
        customer_status: form.customer_status,
        billing_status: form.billing_status,
        admin_memo: form.admin_memo || null,
      };

      const flagPayload = {
        organization_id: selectedOrg.id,
        regular_payroll_enabled: form.regular_payroll_enabled,
        construction_daily_enabled: form.construction_daily_enabled,
      };

      const { error: profileError } = await supabase
        .from("admin_customer_profiles" as any)
        .upsert(profilePayload, { onConflict: "organization_id" });

      if (profileError) throw profileError;

      const { error: flagError } = await supabase
        .from("organization_feature_flags" as any)
        .upsert(flagPayload, { onConflict: "organization_id" });

      if (flagError) throw flagError;

      await supabase.from("admin_audit_logs" as any).insert({
        organization_id: selectedOrg.id,
        action: "update_customer_admin_settings",
        target_table: "admin_customer_profiles, organization_feature_flags",
        after_data: {
          profile: profilePayload,
          feature_flags: flagPayload,
        },
        memo: "슈퍼어드민 고객사 정보 수정",
      });
    },
    onSuccess: () => {
      toast.success("고객사 관리 정보가 저장되었습니다.");
      queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
      setEditOpen(false);
      setSelectedOrg(null);
    },
    onError: (error) => {
      console.error("admin customer save error:", error);
      toast.error("저장 중 오류가 발생했습니다.");
    },
  });

const confirmBillingMutation = useMutation({
  mutationFn: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("로그인 정보가 없습니다.");
    }

    const snapshots = organizations.map((org) => {
      const counts = getCounts(org.id);
      const flags = getFeatureFlags(org.id);

      const regularEnabled = flags?.regular_payroll_enabled ?? true;
      const dailyEnabled = flags?.construction_daily_enabled ?? false;
      const dailyWorkerCount = dailyWorkerCountMap[org.id] ?? 0;

      const regularFee = dailyEnabled
        ? counts.active > 60
          ? null
          : 0
        : regularEnabled
          ? calculateRegularPayrollFee(counts.active)
          : 0;

      const dailyFee = dailyEnabled ? calculateDailyWorkerFee(dailyWorkerCount) : 0;
      const isConsultRequired = regularFee === null;
      const calculatedAmount = isConsultRequired ? 0 : regularFee + dailyFee;

      return {
        organization_id: org.id,
        billing_month: billingMonth,
        total_employee_count: counts.total,
        active_employee_count: counts.active,
        resigned_employee_count: counts.resigned,
        billable_employee_count: counts.active,
        regular_payroll_enabled: regularEnabled,
        construction_daily_enabled: dailyEnabled,
        monthly_base_fee: 0,
        per_employee_fee: 0,
        construction_daily_extra_fee: 0,
        daily_worker_count: dailyWorkerCount,
        regular_payroll_fee: regularFee ?? 0,
        daily_worker_fee: dailyFee,
        pricing_type: "tiered",
        is_consult_required: isConsultRequired,
        calculated_amount: calculatedAmount,
        is_confirmed: true,
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
        created_by: user.id,
        memo: isConsultRequired ? "상담 필요" : null,
      };
    });

    const { error } = await supabase
      .from("billing_snapshots" as any)
      .upsert(snapshots, { onConflict: "organization_id,billing_month" });

    if (error) throw error;

    await supabase.from("admin_audit_logs" as any).insert({
      action: "confirm_billing_snapshots",
      target_table: "billing_snapshots",
      after_data: {
        billing_month: billingMonth,
        snapshot_count: snapshots.length,
      },
      memo: `${billingMonth} 청구 확정`,
    });
  },
  onSuccess: () => {
    toast.success(`${billingMonth} 청구 데이터가 확정되었습니다.`);
    queryClient.invalidateQueries({ queryKey: ["admin-billing-snapshots", billingMonth] });
  },
  onError: (error) => {
    console.error("billing confirm error:", error);
    toast.error("청구 확정 중 오류가 발생했습니다.");
  },
});
const cancelBillingMutation = useMutation({
  mutationFn: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("로그인 정보가 없습니다.");
    }

    const { error } = await supabase
      .from("billing_snapshots" as any)
      .update({
        is_confirmed: false,
        confirmed_at: null,
        confirmed_by: null,
        memo: "청구 확정 취소",
      })
      .eq("billing_month", billingMonth);

    if (error) throw error;

    await supabase.from("admin_audit_logs" as any).insert({
      action: "cancel_billing_snapshots",
      target_table: "billing_snapshots",
      after_data: {
        billing_month: billingMonth,
      },
      memo: `${billingMonth} 청구 확정 취소`,
    });
  },
  onSuccess: () => {
    toast.success(`${billingMonth} 청구 확정이 취소되었습니다.`);
    queryClient.invalidateQueries({ queryKey: ["admin-billing-snapshots", billingMonth] });
  },
  onError: (error) => {
    console.error("billing cancel error:", error);
    toast.error("청구 확정 취소 중 오류가 발생했습니다.");
  },
});

  if (loading) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground">관리자 권한 확인 중...</div>
    </div>
  );
}

const adminLoginVerified = sessionStorage.getItem("admin_login_verified") === "true";

if (!isSuperAdmin || !adminLoginVerified) {
  return <Navigate to="/admin-login" replace />;
}

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-start justify-between gap-4">
  <div>
    <h1 className="text-2xl font-bold">슈퍼어드민</h1>
    <p className="text-sm text-muted-foreground mt-1">
      가입 고객사, 메뉴 권한, 과금 기준, 세금계산서 정보를 관리합니다.
    </p>
  </div>

  <Button variant="outline" onClick={handleAdminLogout}>
    로그아웃
  </Button>
</div>
<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
  <TabsList>
    <TabsTrigger value="customers">고객사 관리</TabsTrigger>
    <TabsTrigger value="billing">과금 관리</TabsTrigger>
  </TabsList>

  <TabsContent value="customers" className="space-y-4">
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between gap-3">
  <CardTitle>고객사 목록</CardTitle>
  <Button variant="outline" size="sm" onClick={exportCustomersToExcel}>
    <FileDown className="mr-1 h-4 w-4" />
    엑셀 내보내기
  </Button>
</div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="회사명, 대표자, 사업자번호, 담당자, 연락처, 이메일 검색"
                  className="pl-9"
                />
              </div>

              <Input
                type="date"
                value={trialEndFilterDate}
                onChange={(e) => setTrialEndFilterDate(e.target.value)}
                title="무료종료일 필터"
              />

              <Button
                variant="outline"
                onClick={() => {
                  setSearchKeyword("");
                  setTrialEndFilterDate("");
                }}
              >
                필터 초기화
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              무료종료일은 가입일 기준 50일 후로 자동 계산됩니다.
            </p>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">고객사 정보를 불러오는 중...</div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>회사명</TableHead>
                      <TableHead>대표자</TableHead>
                      <TableHead>사업자번호</TableHead>
                      <TableHead>가입일</TableHead>
                      <TableHead>무료종료일</TableHead>
                      <TableHead>회사 연락처</TableHead>
                      <TableHead>회사 이메일</TableHead>
                      <TableHead>담당자</TableHead>
                      <TableHead>담당자 휴대폰</TableHead>
                      <TableHead>업태/종목</TableHead>
                      <TableHead>정기급여</TableHead>
                      <TableHead>일용직</TableHead>
                      <TableHead className="text-right">재직</TableHead>
                      <TableHead className="text-right">퇴사</TableHead>
                      <TableHead className="text-right">요금대상</TableHead>
                      <TableHead>고객상태</TableHead>
                      <TableHead>결제상태</TableHead>
                      <TableHead className="text-right">관리</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredOrganizations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={18} className="h-24 text-center text-muted-foreground">
                          검색 조건에 맞는 고객사가 없습니다.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOrganizations.map((org) => {
                        const counts = getCounts(org.id);
                        const flags = getFeatureFlags(org.id);
                        const profile = getCustomerProfile(org.id);
                        const trialEndDate = addDays(org.created_at, 50);

                        return (
                          <TableRow key={org.id}>
                            <TableCell className="font-medium">{org.name}</TableCell>
                            <TableCell>{org.representative ?? "-"}</TableCell>
                            <TableCell>{org.business_number ?? "-"}</TableCell>
                            <TableCell>{formatDate(org.created_at)}</TableCell>
                            <TableCell>{formatDateFromDate(trialEndDate)}</TableCell>
                            <TableCell>{org.phone ?? "-"}</TableCell>
                            <TableCell>{org.email ?? "-"}</TableCell>
                            <TableCell>{profile?.contact_name ?? "-"}</TableCell>
                            <TableCell>{profile?.contact_mobile ?? "-"}</TableCell>
                            <TableCell>
                              {profile?.invoice_business_type || profile?.invoice_business_item
                                ? `${profile?.invoice_business_type ?? "-"} / ${profile?.invoice_business_item ?? "-"}`
                                : "-"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={flags?.regular_payroll_enabled ?? true ? "default" : "secondary"}>
                                {flags?.regular_payroll_enabled ?? true ? "ON" : "OFF"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={flags?.construction_daily_enabled ? "default" : "secondary"}>
                                {flags?.construction_daily_enabled ? "ON" : "OFF"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{counts.active}</TableCell>
                            <TableCell className="text-right">{counts.resigned}</TableCell>
                            <TableCell className="text-right font-medium">{counts.active}</TableCell>
                            <TableCell>{getCustomerStatusLabel(profile?.customer_status)}</TableCell>
                            <TableCell>{getBillingStatusLabel(profile?.billing_status)}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="outline" size="sm" onClick={() => openEditDialog(org)}>
                                관리
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
    </TabsContent>

    {/* 여기에 과금 관리 TabsContent 추가 */}
    <TabsContent value="billing" className="space-y-4">
  <Card>
    <CardHeader className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>과금 관리</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            선택한 청구 기준월의 고객사별 예상 요금을 확인합니다.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-end">
  <div className="w-full md:w-56">
    <Label>청구 기준월</Label>
    <Input type="month" value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)} />
  </div>

  {isBillingMonthConfirmed ? (
  <Button
    variant="outline"
    onClick={() => cancelBillingMutation.mutate()}
    disabled={cancelBillingMutation.isPending || isLoading || isDailyWorkerLoading}
    className="text-orange-600 border-orange-300 hover:bg-orange-50"
  >
    {cancelBillingMutation.isPending ? "취소 중..." : "확정 취소"}
  </Button>
) : (
  <Button
    onClick={() => confirmBillingMutation.mutate()}
    disabled={confirmBillingMutation.isPending || isLoading || isDailyWorkerLoading}
  >
    {confirmBillingMutation.isPending ? "확정 중..." : "청구 확정"}
  </Button>
)}
<Button variant="outline" onClick={exportBillingToExcel} disabled={isLoading || isDailyWorkerLoading}>
  <FileDown className="mr-1 h-4 w-4" />
  엑셀 내보내기
</Button>
</div>
      </div>

      <p className="text-xs text-muted-foreground">
  기본값은 직전월입니다. 현재 단계에서는 예상 요금만 표시하고, 실제 청구 확정은 이후 billing_snapshots 기준으로 저장합니다.
</p>

<div className="grid grid-cols-1 md:grid-cols-4 gap-3">
  <div className="rounded-lg border bg-muted/30 p-4">
    <div className="text-xs text-muted-foreground">전체 고객사</div>
    <div className="mt-1 text-xl font-bold">{billingSummary.totalOrganizations}개</div>
  </div>

  <div className="rounded-lg border bg-muted/30 p-4">
    <div className="text-xs text-muted-foreground">예상 청구 합계</div>
    <div className="mt-1 text-xl font-bold">{formatWon(billingSummary.totalBillableAmount)}</div>
  </div>

  <div className="rounded-lg border bg-muted/30 p-4">
    <div className="text-xs text-muted-foreground">일용직 사용 고객사</div>
    <div className="mt-1 text-xl font-bold">{billingSummary.dailyEnabledCount}개</div>
  </div>

  <div className="rounded-lg border bg-muted/30 p-4">
    <div className="text-xs text-muted-foreground">상담 필요</div>
    <div className="mt-1 text-xl font-bold">{billingSummary.consultCount}개</div>
  </div>
</div>
    </CardHeader>

    <CardContent>
      {isLoading || isDailyWorkerLoading ? (
  <div className="py-10 text-center text-sm text-muted-foreground">과금 정보를 불러오는 중...</div>
) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>회사명</TableHead>
<TableHead>사업자번호</TableHead>
<TableHead>청구 기준월</TableHead>
                <TableHead className="text-right">정기급여 재직자</TableHead>
                <TableHead className="text-right">일용직 고유 인원</TableHead>
<TableHead className="text-right">정기SMS</TableHead>
<TableHead className="text-right">일용SMS</TableHead>
<TableHead className="text-right">총SMS</TableHead>
<TableHead className="text-right">정기급여 요금</TableHead>
                <TableHead className="text-right">일용직 요금</TableHead>
                <TableHead className="text-right">예상 청구금액</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {organizations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-24 text-center text-muted-foreground">
                    고객사가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                organizations.map((org) => {
                  const counts = getCounts(org.id);
                  const flags = getFeatureFlags(org.id);

                  const regularEnabled = flags?.regular_payroll_enabled ?? true;
                  const dailyEnabled = flags?.construction_daily_enabled ?? false;

                  const dailyWorkerCount = dailyWorkerCountMap[org.id] ?? 0;
const smsUsage = smsUsageMap[org.id] ?? { monthly: 0, daily: 0, total: 0 };

const regularFee = dailyEnabled
  ? counts.active > 60
    ? null
    : 0
  : regularEnabled
    ? calculateRegularPayrollFee(counts.active)
    : 0;

const dailyFee = dailyEnabled ? calculateDailyWorkerFee(dailyWorkerCount) : 0;

const totalFee = regularFee === null ? null : regularFee + dailyFee;

                  return (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">{org.name}</TableCell>
<TableCell>{org.business_number || "-"}</TableCell>
<TableCell>{billingMonth}</TableCell>
                      <TableCell className="text-right">{regularEnabled ? counts.active : "-"}</TableCell>
                      <TableCell className="text-right">{dailyEnabled ? dailyWorkerCount : "-"}</TableCell>
<TableCell className="text-right">{smsUsage.monthly}</TableCell>
<TableCell className="text-right">{smsUsage.daily}</TableCell>
<TableCell className="text-right font-medium">{smsUsage.total}</TableCell>
<TableCell className="text-right">{dailyEnabled && regularFee !== null ? "포함" : formatFee(regularFee)}</TableCell>
                      <TableCell className="text-right">{formatFee(dailyFee)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatFee(totalFee)}</TableCell>
                      <TableCell>
  {confirmedSnapshotMap[org.id] ? (
    <Badge variant="default">확정</Badge>
  ) : totalFee === null ? (
    <Badge variant="destructive">상담 필요</Badge>
  ) : (
    <Badge variant="secondary">예상 청구</Badge>
  )}
</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </CardContent>
  </Card>
</TabsContent>

  </Tabs>
</div>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>고객사 관리 정보 수정</DialogTitle>
          </DialogHeader>

          {selectedOrg && (
            <div className="space-y-6">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <div className="font-semibold">{selectedOrg.name}</div>
                <div className="mt-1 text-muted-foreground">
                  대표자: {selectedOrg.representative ?? "-"} / 사업자번호: {selectedOrg.business_number ?? "-"}
                </div>
                <div className="mt-1 text-muted-foreground">
                  가입일: {formatDate(selectedOrg.created_at)} / 무료종료일:{" "}
                  {formatDateFromDate(addDays(selectedOrg.created_at, 50))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>담당자 이름</Label>
                  <Input
                    value={form.contact_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, contact_name: e.target.value }))}
                    placeholder="예: 홍길동"
                  />
                </div>

                <div>
                  <Label>담당자 휴대폰</Label>
                  <Input
                    value={form.contact_mobile}
                    onChange={(e) => setForm((prev) => ({ ...prev, contact_mobile: e.target.value }))}
                    placeholder="예: 010-0000-0000"
                  />
                </div>

                <div>
                  <Label>업태</Label>
                  <Input
                    value={form.invoice_business_type}
                    onChange={(e) => setForm((prev) => ({ ...prev, invoice_business_type: e.target.value }))}
                    placeholder="예: 서비스업"
                  />
                </div>

                <div>
                  <Label>종목</Label>
                  <Input
                    value={form.invoice_business_item}
                    onChange={(e) => setForm((prev) => ({ ...prev, invoice_business_item: e.target.value }))}
                    placeholder="예: 소프트웨어 개발"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label>세금계산서 이메일</Label>
                  <Input
                    value={form.invoice_email}
                    onChange={(e) => setForm((prev) => ({ ...prev, invoice_email: e.target.value }))}
                    placeholder="예: tax@company.com"
                  />
                </div>

                <div>
                  <Label>고객 상태</Label>
                  <Select
                    value={form.customer_status}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, customer_status: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">사용중</SelectItem>
                      <SelectItem value="trial">체험중</SelectItem>
                      <SelectItem value="pending_payment">결제대기</SelectItem>
                      <SelectItem value="suspended">정지</SelectItem>
                      <SelectItem value="cancelled">해지</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>결제 상태</Label>
                  <Select
                    value={form.billing_status}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, billing_status: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">결제완료</SelectItem>
                      <SelectItem value="unpaid">미납</SelectItem>
                      <SelectItem value="free_trial">무료체험</SelectItem>
                      <SelectItem value="overdue">연체</SelectItem>
                      <SelectItem value="paused">일시중지</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border p-4 space-y-4">
                <div className="font-semibold text-sm">메뉴 권한</div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">정기급여</div>
                    <div className="text-xs text-muted-foreground">정기 급여 메뉴 사용 여부</div>
                  </div>
                  <Switch
                    checked={form.regular_payroll_enabled}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, regular_payroll_enabled: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">일용직 노무관리(건설업)</div>
                    <div className="text-xs text-muted-foreground">추가 과금 대상 메뉴 사용 여부</div>
                  </div>
                  <Switch
                    checked={form.construction_daily_enabled}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, construction_daily_enabled: checked }))
                    }
                  />
                </div>
              </div>

              <div>
                <Label>관리자 메모</Label>
                <Textarea
                  value={form.admin_memo}
                  onChange={(e) => setForm((prev) => ({ ...prev, admin_memo: e.target.value }))}
                  placeholder="통화 내용, 요청사항, 주의사항 등을 입력하세요."
                  rows={4}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              취소
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}