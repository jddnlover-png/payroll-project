import { useState, useEffect, useMemo } from "react";
import { useEmployees, EmployeeInsert, EmployeeUpdate } from "@/hooks/useEmployees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  Calendar,
  Loader2,
  Database,
  Eye,
  FileSpreadsheet,
  Download,
  Search,
  Building2,
  ChevronRight,
  Wallet,
  Briefcase,
  UserX,
  RotateCcw,
} from "lucide-react";
import ExcelJS from "exceljs";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { LeaveManagement } from "@/components/employee/LeaveManagement";
import { EmployeeBulkUpload } from "@/components/employee/EmployeeBulkUpload";
import { EmployeeCombobox } from "@/components/employee/EmployeeCombobox";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

const statusConfig = {
  active: { label: "재직", class: "status-green" },
  inactive: { label: "퇴직", class: "status-red" },
};

const employmentTypeConfig: Record<string, { label: string; class: string }> = {
  regular: { label: "정규직", class: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
  contract: { label: "계약직", class: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300" },
  daily: { label: "일용직", class: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300" }, // legacy display only
  freelancer: { label: "프리랜서", class: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
};

const jobCategoryConfig: Record<string, { label: string; class: string }> = {
  office: { label: "사무직", class: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300" },
  production: { label: "생산직", class: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300" },
};

// Defaults removed - now fetched from DB

const bankList = [
  "기업은행",
  "국민은행",
  "한국수출입은행",
  "농협",
  "우리은행",
  "스탠다드차타드은행",
  "한국씨티은행",
  "iM뱅크(대구)",
  "부산은행",
  "광주은행",
  "제주은행",
  "전북은행",
  "경남은행",
  "새마을금고",
  "신협",
  "상호저축은행",
  "모건스탠리은행",
  "HSBC",
  "도이치",
  "케이뱅크",
  "카카오뱅크",
  "토스뱅크",
  "기타은행",
  "교보증권",
  "신한금융투자",
  "매신증권",
  "미래에셋대우증권",
  "DB증권",
  "유안타증권",
  "메리츠종금증권",
  "부국증권",
  "삼성증권",
  "유진투자증권",
  "신영증권",
  "현대차투자증권",
  "한화증권",
  "SK증권",
  "키움증권",
  "하이투자증권",
  "ABN암로",
  "JP모건체이스",
  "미즈호코퍼레이트",
  "미쓰비시도쿄UFJ...",
  "BOA",
  "비엔피파리바은행",
  "산립조합",
  "우체국",
  "하나은행",
  "신한은행",
  "하나금융투자",
  "한국투자증권",
  "LS증권",
  "NH투자증권",
  "IBK투자증권",
  "KB증권",
  "골든브릿지투자증권",
  "중소벤처기업진흥...",
  "카카오페이증권",
  "아이엠투자증권",
  "케이프투자증권",
  "한국증권금융",
  "우리투자증권",
  "토스증권",
];

interface EmployeeTabProps {
  activeTab?: string;
}

interface DeptWithParent {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

function buildDeptTreeFlat(depts: DeptWithParent[]): (DeptWithParent & { depth: number; childNames: string[] })[] {
  const map = new Map<string | null, DeptWithParent[]>();
  depts.forEach((d) => {
    const key = d.parent_id || null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  });
  const result: (DeptWithParent & { depth: number; childNames: string[] })[] = [];
  function walk(parentId: string | null, depth: number) {
    (map.get(parentId) || []).forEach((d) => {
      const allChildNames = getAllChildNames(d.id, map);
      result.push({ ...d, depth, childNames: [d.name, ...allChildNames] });
      walk(d.id, depth + 1);
    });
  }
  walk(null, 0);
  return result;
}

function getAllChildNames(parentId: string, map: Map<string | null, DeptWithParent[]>): string[] {
  const children = map.get(parentId) || [];
  const names: string[] = [];
  children.forEach((c) => {
    names.push(c.name);
    names.push(...getAllChildNames(c.id, map));
  });
  return names;
}

export function EmployeeTab({ activeTab: controlledTab }: EmployeeTabProps) {
  const { employees, isLoading, addEmployee, updateEmployee, deleteEmployee } = useEmployees();
  const { currentOrganization } = useOrganization();
  const [dbDepartments, setDbDepartments] = useState<string[]>([]);
  const [dbDeptTree, setDbDeptTree] = useState<DeptWithParent[]>([]);
  const [dbPositions, setDbPositions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [showResigned, setShowResigned] = useState(false);
  const [employeeRecordCounts, setEmployeeRecordCounts] = useState<
    Record<string, { attendance: number; snapshots: number }>
  >({});
  const [resignTarget, setResignTarget] = useState<(typeof employees)[0] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(typeof employees)[0] | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<(typeof employees)[0] | null>(null);

  useEffect(() => {
    if (!currentOrganization) return;
    const fetchLists = async () => {
      const [dRes, pRes] = await Promise.all([
        supabase
          .from("departments")
          .select("id, name, parent_id, sort_order")
          .eq("organization_id", currentOrganization.id)
          .order("sort_order"),
        supabase.from("positions").select("name").eq("organization_id", currentOrganization.id).order("sort_order"),
      ]);
      const depts = (dRes.data || []) as DeptWithParent[];
      setDbDeptTree(depts);
      setDbDepartments(depts.map((d) => d.name));
      setDbPositions((pRes.data || []).map((p) => p.name));
    };
    fetchLists();
  }, [currentOrganization]);

  // Fetch record counts for delete/resign policy
  useEffect(() => {
    if (!currentOrganization || employees.length === 0) return;
    const fetchCounts = async () => {
      const counts: Record<string, { attendance: number; snapshots: number }> = {};
      const empIds = employees.map((e) => e.id);

      const [attRes, snapRes] = await Promise.all([
        supabase
          .from("attendance_records")
          .select("employee_id")
          .eq("organization_id", currentOrganization.id)
          .in("employee_id", empIds),
        supabase
          .from("daily_wage_snapshots")
          .select("employee_id")
          .eq("organization_id", currentOrganization.id)
          .in("employee_id", empIds),
      ]);

      empIds.forEach((id) => {
        counts[id] = { attendance: 0, snapshots: 0 };
      });
      (attRes.data || []).forEach((r: any) => {
        if (counts[r.employee_id]) counts[r.employee_id].attendance++;
      });
      (snapRes.data || []).forEach((r: any) => {
        if (counts[r.employee_id]) counts[r.employee_id].snapshots++;
      });
      setEmployeeRecordCounts(counts);
    };
    fetchCounts();
  }, [currentOrganization, employees]);

  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);
  const [residentNumberError, setResidentNumberError] = useState("");
  const [detailEmployee, setDetailEmployee] = useState<(typeof employees)[0] | null>(null);
  const [statusToggleTarget, setStatusToggleTarget] = useState<(typeof employees)[0] | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedEmploymentType, setSelectedEmploymentType] = useState<string | null>(null);
  const [selectedPayType, setSelectedPayType] = useState<string | null>(null);
  const [selectedJobCategory, setSelectedJobCategory] = useState<string | null>(null);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  const deptTree = useMemo(() => buildDeptTreeFlat(dbDeptTree), [dbDeptTree]);

  // 부서별 직원 수 계산
  const departmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach((emp) => {
      const dept = emp.department || "미분류";
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return counts;
  }, [employees]);

  // 부서 필터 적용된 직원 목록 (상위 부서 선택 시 하위 부서 직원도 포함)
  const filteredEmployees = useMemo(() => {
    let result = employees;

    // 퇴사자 필터
    if (!showResigned) {
      result = result.filter((emp) => emp.is_active !== false);
    }

    // 부서 필터
    if (selectedDepartment) {
      if (selectedDepartment === "미분류") {
        result = result.filter((emp) => !emp.department || !dbDepartments.includes(emp.department));
      } else {
        const node = deptTree.find((d) => d.name === selectedDepartment);
        if (node) {
          result = result.filter((emp) => node.childNames.includes(emp.department || ""));
        } else {
          result = result.filter((emp) => emp.department === selectedDepartment);
        }
      }
    }

    // 고용형태 필터
    if (selectedEmploymentType) {
      result = result.filter((emp) => emp.employment_type === selectedEmploymentType);
    }

    // 급여유형 필터
    if (selectedPayType) {
      result = result.filter((emp) => emp.pay_type === selectedPayType);
    }

    // 직종 필터
    if (selectedJobCategory) {
      result = result.filter((emp) => emp.job_category === selectedJobCategory);
    }

    return result;
  }, [
    employees,
    selectedDepartment,
    selectedEmploymentType,
    selectedPayType,
    selectedJobCategory,
    dbDepartments,
    deptTree,
    showResigned,
  ]);
  const [formData, setFormData] = useState({
    employee_number: "",
    name: "",
    resident_number: "",
    department: "",
    position: "",
    email: "",
    phone: "",
    hire_date: "",
    resignation_date: "",
    base_salary: "",
    pay_type: "monthly" as "hourly" | "monthly" | "daily",
    hourly_rate: "",
    daily_rate: "",
    employment_type: "regular" as "regular" | "contract" | "daily" | "freelancer",
    settlement_type: "employment_income",
    job_category: "office" as "office" | "production",
    bank_name: "",
    account_number: "",
    dependents: 1,
children_aged_8_to_20: 0,
national_pension_monthly_income: "",
health_insurance_monthly_income: "",
  });

  // 주민등록번호 포맷팅 (자동 하이픈 추가)
  const formatResidentNumber = (value: string): string => {
    const numbers = value.replace(/[^0-9]/g, "");
    if (numbers.length <= 6) {
      return numbers;
    }
    return `${numbers.slice(0, 6)}-${numbers.slice(6, 13)}`;
  };

  // 주민등록번호를 마스킹 형식으로 저장 (YYMMDD-G******)
  const maskResidentNumber = (value: string): string => {
    if (!value) return "";
    const numbers = value.replace(/[^0-9]/g, "");
    if (numbers.length < 7) return "";
    return `${numbers.slice(0, 6)}-${numbers.charAt(6)}******`;
  };

  // 주민등록번호 유효성 검증
  const validateResidentNumber = (value: string): string => {
    if (!value) return "";

    const numbers = value.replace(/[^0-9]/g, "");

    if (numbers.length > 0 && numbers.length < 13) {
      return "주민등록번호 13자리를 모두 입력해주세요.";
    }

    if (numbers.length === 13) {
      const birthPart = numbers.slice(0, 6);
      const month = parseInt(birthPart.slice(2, 4), 10);
      const day = parseInt(birthPart.slice(4, 6), 10);

      if (month < 1 || month > 12) {
        return "올바른 생년월일을 입력해주세요.";
      }
      if (day < 1 || day > 31) {
        return "올바른 생년월일을 입력해주세요.";
      }

      const genderCode = parseInt(numbers.charAt(6), 10);
      if (genderCode < 1 || genderCode > 4) {
        return "올바른 주민등록번호를 입력해주세요.";
      }
    }

    return "";
  };

  const handleResidentNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatResidentNumber(e.target.value);
    setFormData({ ...formData, resident_number: formatted });
    setResidentNumberError(validateResidentNumber(formatted));
  };

  // 다음 사원번호 생성 (EMP001, EMP-T01, EMP-A001 등 다양한 패턴 지원)
  const generateNextEmployeeNumber = (): string => {
    if (employees.length === 0) return "EMP001";

    const maxNumber = employees.reduce((max, emp) => {
      // 다양한 패턴 지원: EMP001, EMP-T01, EMP-001, EMP_001 등
      const match = emp.employee_number.match(/EMP[-_]?[A-Z]?(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 0);

    return `EMP${String(maxNumber + 1).padStart(3, "0")}`;
  };

  const resetForm = () => {
    setFormData({
      employee_number: "",
      name: "",
      resident_number: "",
      department: "",
      position: "",
      email: "",
      phone: "",
      hire_date: "",
      resignation_date: "",
      base_salary: "",
      pay_type: "monthly",
      hourly_rate: "",
      daily_rate: "",
      employment_type: "regular",
      settlement_type: "employment_income",
      job_category: "office",
      bank_name: "",
      account_number: "",
      dependents: 1,
children_aged_8_to_20: 0,
national_pension_monthly_income: "",
health_insurance_monthly_income: "",
    });
    setEditingEmployeeId(null);
    setResidentNumberError("");
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.department || !formData.position) {
      toast.error("필수 항목을 입력해주세요.");
      return;
    }

    if (formData.resident_number) {
      const error = validateResidentNumber(formData.resident_number);
      if (error) {
        toast.error(error);
        return;
      }
    }

    const maskedResidentNumber = formData.resident_number ? maskResidentNumber(formData.resident_number) : null;

    if (editingEmployeeId) {
      const updates: EmployeeUpdate & { resignation_date?: string | null } = {
        name: formData.name,
        resident_number: maskedResidentNumber,
        department: formData.department,
        position: formData.position,
        email: formData.email || null,
        phone: formData.phone || null,
        hire_date: formData.hire_date || new Date().toISOString().split("T")[0],
        resignation_date: formData.resignation_date || null,
        is_active: !formData.resignation_date,
        base_salary: formData.pay_type === "monthly" ? Number(formData.base_salary) || 0 : 0,
        pay_type: formData.pay_type,
        hourly_rate: formData.pay_type === "hourly" ? Number(formData.hourly_rate) || null : null,
        daily_rate: formData.pay_type === "daily" ? Number(formData.daily_rate) || null : null,
        employment_type: formData.employment_type,
        job_category: formData.job_category,
        bank_name: formData.bank_name || null,
        account_number: formData.account_number || null,
        dependents: formData.dependents,
children_aged_8_to_20: formData.children_aged_8_to_20,
national_pension_monthly_income: Number(formData.national_pension_monthly_income) || 0,
health_insurance_monthly_income: Number(formData.health_insurance_monthly_income) || 0,
      };

      updateEmployee.mutate({ id: editingEmployeeId, ...updates });
    } else {
      const newEmployee: Omit<EmployeeInsert, "organization_id"> & { resignation_date?: string | null } = {
        employee_number: formData.employee_number || generateNextEmployeeNumber(),
        name: formData.name,
        resident_number: maskedResidentNumber,
        department: formData.department,
        position: formData.position,
        email: formData.email || null,
        phone: formData.phone || null,
        hire_date: formData.hire_date || new Date().toISOString().split("T")[0],
        resignation_date: formData.resignation_date || null,
        base_salary: formData.pay_type === "monthly" ? Number(formData.base_salary) || 0 : 0,
        pay_type: formData.pay_type,
        hourly_rate: formData.pay_type === "hourly" ? Number(formData.hourly_rate) || null : null,
        daily_rate: formData.pay_type === "daily" ? Number(formData.daily_rate) || null : null,
        employment_type: formData.employment_type,
        settlement_type: formData.settlement_type,
        job_category: formData.job_category,
        is_active: !formData.resignation_date,
        bank_name: formData.bank_name || null,
        account_number: formData.account_number || null,
        dependents: formData.dependents,
children_aged_8_to_20: formData.children_aged_8_to_20,
national_pension_monthly_income: Number(formData.national_pension_monthly_income) || 0,
health_insurance_monthly_income: Number(formData.health_insurance_monthly_income) || 0,
      };

      addEmployee.mutate(newEmployee);
    }

    resetForm();
    setIsOpen(false);
  };

  const handleEdit = (employee: (typeof employees)[0]) => {
    setEditingEmployeeId(employee.id);
    const empAny = employee as any;
    setFormData({
      employee_number: employee.employee_number,
      name: employee.name,
      resident_number: employee.resident_number || "",
      department: employee.department || "",
      position: employee.position || "",
      email: employee.email || "",
      phone: employee.phone || "",
      hire_date: employee.hire_date,
      resignation_date: empAny.resignation_date || "",
      base_salary: employee.base_salary.toString(),
      pay_type: employee.pay_type,
      hourly_rate: employee.hourly_rate?.toString() || "",
      daily_rate: employee.daily_rate?.toString() || "",
      employment_type: employee.employment_type,
      settlement_type: employee.settlement_type || "employment_income",
      job_category: (employee.job_category as "office" | "production") || "office",
      bank_name: employee.bank_name || "",
      account_number: employee.account_number || "",
      dependents: empAny.dependents ?? 1,
children_aged_8_to_20: empAny.children_aged_8_to_20 ?? 0,
national_pension_monthly_income: empAny.national_pension_monthly_income?.toString() || "",
health_insurance_monthly_income: empAny.health_insurance_monthly_income?.toString() || "",
    });
    setIsOpen(true);
  };

  const handleToggleStatus = (employee: (typeof employees)[0]) => {
    setStatusToggleTarget(employee);
  };

  const confirmToggleStatus = () => {
    if (!statusToggleTarget) return;
    const isCurrentlyActive = statusToggleTarget.is_active;
    const updates: any = {
      is_active: !isCurrentlyActive,
      resignation_date: isCurrentlyActive ? new Date().toISOString().split("T")[0] : null,
    };
    updateEmployee.mutate({ id: statusToggleTarget.id, ...updates });
    setStatusToggleTarget(null);
  };

  const handleDelete = (employee: (typeof employees)[0]) => {
    const counts = employeeRecordCounts[employee.id];
    if (counts && (counts.attendance > 0 || counts.snapshots > 0)) {
      return; // should not be called, button hidden
    }
    setDeleteTarget(employee);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteEmployee.mutate(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleResign = (employee: (typeof employees)[0]) => {
    setResignTarget(employee);
  };

  const confirmResign = () => {
    if (!resignTarget) return;
    updateEmployee.mutate({
      id: resignTarget.id,
      is_active: false,
      resignation_date: new Date().toISOString().split("T")[0],
    });
    setResignTarget(null);
  };

  const handleReactivate = (employee: (typeof employees)[0]) => {
    setReactivateTarget(employee);
  };

  const confirmReactivate = () => {
    if (!reactivateTarget) return;
    updateEmployee.mutate({
      id: reactivateTarget.id,
      is_active: true,
      resignation_date: null,
    });
    setReactivateTarget(null);
  };

  const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
    regular: "정규직",
    contract: "계약직",
    daily: "일용직",
    freelancer: "프리랜서",
  };
  const PAY_TYPE_LABEL: Record<string, string> = {
    monthly: "월급",
    hourly: "시급",
    daily: "일급",
  };

  const handleExportEmployees = async () => {
    if (employees.length === 0) {
      toast.error("내보낼 직원 데이터가 없습니다.");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("직원일괄등록");

    const JOB_CATEGORY_LABEL: Record<string, string> = {
      office: "사무직",
      production: "생산직",
    };

    const headers = [
      { header: "사원번호*", key: "employee_number", width: 15 },
      { header: "이름*", key: "name", width: 12 },
      { header: "주민등록번호", key: "resident_number", width: 18 },
      { header: "부서", key: "department", width: 15 },
      { header: "직급", key: "position", width: 12 },
      { header: "고용형태", key: "employment_type", width: 12 },
      { header: "급여유형", key: "pay_type", width: 10 },
      { header: "직종", key: "job_category", width: 10 },
      { header: "기본급(월급)", key: "base_salary", width: 15 },
      { header: "시급", key: "hourly_rate", width: 12 },
      { header: "일급", key: "daily_rate", width: 12 },
      { header: "입사일*", key: "hire_date", width: 15 },
      { header: "이메일", key: "email", width: 25 },
      { header: "전화번호", key: "phone", width: 15 },
      { header: "은행명", key: "bank_name", width: 12 },
      { header: "계좌번호", key: "account_number", width: 20 },
    ];

    ws.columns = headers;

    // 헤더 스타일
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 30;

    // 데이터 추가
    const empsToExport =
      selectedExportIds.length > 0 ? employees.filter((e) => selectedExportIds.includes(e.id)) : employees;
    empsToExport.forEach((emp) => {
      ws.addRow({
        employee_number: emp.employee_number,
        name: emp.name,
        resident_number: emp.resident_number || "",
        department: emp.department || "",
        position: emp.position || "",
        employment_type: EMPLOYMENT_TYPE_LABEL[emp.employment_type] || emp.employment_type,
        pay_type: PAY_TYPE_LABEL[emp.pay_type] || emp.pay_type,
        job_category: JOB_CATEGORY_LABEL[emp.job_category] || emp.job_category,
        base_salary: emp.base_salary || "",
        hourly_rate: emp.hourly_rate || "",
        daily_rate: emp.daily_rate || "",
        hire_date: emp.hire_date,
        email: emp.email || "",
        phone: emp.phone || "",
        bank_name: emp.bank_name || "",
        account_number: emp.account_number || "",
      });
    });

    // 테두리
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `직원목록_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("직원 목록이 다운로드되었습니다.");
  };

  return (
    <div className="space-y-4">
      {(controlledTab || "list") === "list" && (
        <div className="flex gap-4">
          {/* 부서 트리 */}
          <div className="w-56 shrink-0 rounded-lg border bg-card p-3 space-y-1 hidden md:block">
            <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <Building2 className="w-4 h-4" />
              부서 목록
            </h3>
            <button
              onClick={() => setSelectedDepartment(null)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                !selectedDepartment ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted",
              )}
            >
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                전체 직원
              </span>
              <span className="text-xs opacity-70">{employees.length}</span>
            </button>
            <div className="border-t my-2" />
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-0.5">
                {deptTree.map((node) => {
                  const hasChildren = dbDeptTree.some((d) => d.parent_id === node.id);
                  const isExpanded = expandedDepts.has(node.id);
                  // Hide children if parent is collapsed
                  if (node.depth > 0) {
                    const parentNode = dbDeptTree.find((d) => d.id === node.parent_id);
                    if (parentNode && !expandedDepts.has(parentNode.id)) return null;
                    // Check all ancestors
                    let ancestor = parentNode;
                    while (ancestor) {
                      if (!expandedDepts.has(ancestor.id)) return null;
                      ancestor = dbDeptTree.find((d) => d.id === ancestor!.parent_id) || undefined;
                    }
                  }
                  // Count includes self + child dept employees
                  const totalCount = node.childNames.reduce((sum, name) => sum + (departmentCounts[name] || 0), 0);

                  return (
                    <button
                      key={node.id}
                      onClick={() => {
                        setSelectedDepartment(selectedDepartment === node.name ? null : node.name);
                        if (hasChildren) {
                          setExpandedDepts((prev) => {
                            const next = new Set(prev);
                            if (next.has(node.id)) next.delete(node.id);
                            else next.add(node.id);
                            return next;
                          });
                        }
                      }}
                      className={cn(
                        "w-full text-left py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                        selectedDepartment === node.name
                          ? "bg-primary text-primary-foreground font-medium"
                          : "hover:bg-muted",
                      )}
                      style={{ paddingLeft: `${12 + node.depth * 16}px`, paddingRight: "12px" }}
                    >
                      <span className="flex items-center gap-1.5">
                        {hasChildren ? (
                          <ChevronRight className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-90")} />
                        ) : (
                          <span className="w-3" />
                        )}
                        {node.name}
                      </span>
                      <span className="text-xs opacity-70">{totalCount}</span>
                    </button>
                  );
                })}
                {/* 미분류 부서가 있을 경우 표시 */}
                {employees.some((e) => !e.department || !dbDepartments.includes(e.department)) &&
                  (() => {
                    const uncategorizedCount = employees.filter(
                      (e) => !e.department || !dbDepartments.includes(e.department),
                    ).length;
                    return (
                      <button
                        onClick={() => setSelectedDepartment(selectedDepartment === "미분류" ? null : "미분류")}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                          selectedDepartment === "미분류"
                            ? "bg-primary text-primary-foreground font-medium"
                            : "hover:bg-muted text-muted-foreground",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="w-3" />
                          미분류
                        </span>
                        <span className="text-xs opacity-70">{uncategorizedCount}</span>
                      </button>
                    );
                  })()}
              </div>
            </ScrollArea>

            {/* 고용형태 필터 */}
            <div className="border-t my-2 pt-2">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                고용형태
              </h3>
              <button
                onClick={() => setSelectedEmploymentType(null)}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between",
                  !selectedEmploymentType ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted",
                )}
              >
                <span>전체</span>
                <span className="text-xs opacity-70">{employees.length}</span>
              </button>
              {Object.entries(employmentTypeConfig).map(([key, config]) => {
                const count = employees.filter((e) => e.employment_type === key).length;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedEmploymentType(selectedEmploymentType === key ? null : key)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between",
                      selectedEmploymentType === key
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-muted",
                    )}
                  >
                    <span>{config.label}</span>
                    <span className="text-xs opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* 급여유형 필터 */}
            <div className="border-t my-2 pt-2">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Wallet className="w-4 h-4" />
                급여유형
              </h3>
              <button
                onClick={() => setSelectedPayType(null)}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between",
                  !selectedPayType ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted",
                )}
              >
                <span>전체</span>
                <span className="text-xs opacity-70">{employees.length}</span>
              </button>
              {[
                { key: "monthly", label: "월급" },
                { key: "hourly", label: "시급" },
                { key: "daily", label: "일급" },
              ].map(({ key, label }) => {
                const count = employees.filter((e) => e.pay_type === key).length;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedPayType(selectedPayType === key ? null : key)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between",
                      selectedPayType === key ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted",
                    )}
                  >
                    <span>{label}</span>
                    <span className="text-xs opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* 직종 필터 */}
            <div className="border-t my-2 pt-2">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Briefcase className="w-4 h-4" />
                직종
              </h3>
              <button
                onClick={() => setSelectedJobCategory(null)}
                className={cn(
                  "w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between",
                  !selectedJobCategory ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted",
                )}
              >
                <span>전체</span>
                <span className="text-xs opacity-70">{employees.length}</span>
              </button>
              {[
                { key: "office", label: "사무직" },
                { key: "production", label: "생산직" },
              ].map(({ key, label }) => {
                const count = employees.filter((e) => e.job_category === key).length;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedJobCategory(selectedJobCategory === key ? null : key)}
                    className={cn(
                      "w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between",
                      selectedJobCategory === key ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted",
                    )}
                  >
                    <span>{label}</span>
                    <span className="text-xs opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 직원 목록 영역 */}
          <div className="flex-1 space-y-4 min-w-0">
            {/* 모바일 부서 필터 드롭다운 */}
            <div className="md:hidden">
              <Select
                value={selectedDepartment || "all"}
                onValueChange={(v) => setSelectedDepartment(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-full">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <SelectValue placeholder="부서 선택" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 직원 ({employees.length})</SelectItem>
                  {deptTree.map((node) => {
                    const totalCount = node.childNames.reduce((sum, name) => sum + (departmentCounts[name] || 0), 0);
                    return (
                      <SelectItem key={node.id} value={node.name}>
                        {"　".repeat(node.depth)}
                        {node.name} ({totalCount})
                      </SelectItem>
                    );
                  })}
                  {employees.some((e) => !e.department || !dbDepartments.includes(e.department)) && (
                    <SelectItem value="미분류">
                      미분류 ({employees.filter((e) => !e.department || !dbDepartments.includes(e.department)).length})
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">
                  직원 목록
                  {selectedDepartment && <span className="text-primary ml-1">· {selectedDepartment}</span>}
                </h2>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  DB 연동
                </Badge>
                <div className="flex items-center gap-2">
                  <Switch checked={showResigned} onCheckedChange={setShowResigned} id="show-resigned" />
                  <Label htmlFor="show-resigned" className="text-sm text-muted-foreground cursor-pointer">
                    퇴사자 포함
                  </Label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleExportEmployees} disabled={employees.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  엑셀 다운로드{selectedExportIds.length > 0 ? ` (${selectedExportIds.length}명)` : ""}
                </Button>
                <Button variant="outline" onClick={() => setIsBulkUploadOpen(true)}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  엑셀 일괄등록
                </Button>
                <Dialog
                  open={isOpen}
                  onOpenChange={(open) => {
                    setIsOpen(open);
                    if (!open) resetForm();
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      onClick={() =>
                        setFormData((prev) => ({ ...prev, employee_number: generateNextEmployeeNumber() }))
                      }
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      신규 직원 등록
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{editingEmployeeId ? "직원 정보 수정" : "신규 직원 등록"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>사원번호</Label>
                        <Input
                          value={formData.employee_number}
                          onChange={(e) => setFormData({ ...formData, employee_number: e.target.value })}
                          placeholder="EMP001"
                          disabled={!!editingEmployeeId}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>이름 *</Label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder=""
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>주민등록번호</Label>
                        <Input
                          value={formData.resident_number}
                          onChange={handleResidentNumberChange}
                          placeholder="000000-0000000"
                          maxLength={14}
                          autoComplete="off"
                          className={residentNumberError ? "border-destructive" : ""}
                        />
                        {residentNumberError && <p className="text-xs text-destructive">{residentNumberError}</p>}
                        <p className="text-xs text-muted-foreground">
                          ⚠️ 주민등록번호는 보안을 위해 마스킹 처리되어 저장됩니다 (예: 000000-1******)
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>고용형태 *</Label>
                        <Select
                          value={formData.employment_type}
                          onValueChange={(value: "regular" | "contract" | "daily" | "freelancer") => {
                            const updates: any = { employment_type: value };
                            // 정규직 선택 시 일급제였으면 월급제로 리셋
                            if (value === "regular" && formData.pay_type === "daily") {
                              updates.pay_type = "monthly";
                            }
                            setFormData((prev) => ({ ...prev, ...updates }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="regular">정규직</SelectItem>
                            <SelectItem value="contract">계약직</SelectItem>
                            <SelectItem value="freelancer">프리랜서</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>직종</Label>
                        <Select
                          value={formData.job_category}
                          onValueChange={(value: "office" | "production") =>
                            setFormData({ ...formData, job_category: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="office">사무직</SelectItem>
                            <SelectItem value="production">생산직</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          생산직 근로자 비과세(연장근로수당 등) 적용 기준으로 활용됩니다.
                        </p>
                      </div>
                      {/* 소득세 공제대상 가족 수 */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-1">
                            <Label>공제대상 가족 수</Label>
                            <div className="relative group">
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted text-muted-foreground text-[10px] cursor-help font-bold">
                                ?
                              </span>
                              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2.5 bg-popover border rounded-lg shadow-lg text-xs text-popover-foreground hidden group-hover:block z-50 leading-relaxed">
                                <p className="font-semibold mb-1">공제대상 가족 수 (소득세법 제50조)</p>
                                <p>본인 포함 기본공제대상자 수를 입력합니다.</p>
                                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                  <li>• 본인: 항상 1명 포함</li>
                                  <li>• 배우자: 연간소득 100만원 이하</li>
                                  <li>• 부양가족: 60세 이상 부모, 20세 이하 자녀 등</li>
                                  <li>• 최대 11명까지 적용</li>
                                </ul>
                                <p className="mt-1 text-muted-foreground">미입력 시 기본값 1명(본인만) 적용</p>
                              </div>
                            </div>
                          </div>
                          <Input
                            type="number"
                            min={1}
                            max={11}
                            value={formData.dependents}
                            onChange={(e) => setFormData({ ...formData, dependents: Number(e.target.value) })}
                          />
                          <p className="text-xs text-muted-foreground">본인 포함 (기본값: 1명)</p>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-1">
                            <Label>8~20세 자녀 수</Label>
                            <div className="relative group">
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted text-muted-foreground text-[10px] cursor-help font-bold">
                                ?
                              </span>
                              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2.5 bg-popover border rounded-lg shadow-lg text-xs text-popover-foreground hidden group-hover:block z-50 leading-relaxed">
                                <p className="font-semibold mb-1">8~20세 자녀 공제 (소득세법 시행령 제194조)</p>
                                <p>기본공제대상자 중 8세 이상 20세 이하 자녀 수를 입력합니다.</p>
                                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                  <li>• 자녀 1명: 월 12,500원 추가 공제</li>
                                  <li>• 자녀 2명: 월 29,160원 추가 공제</li>
                                  <li>• 자녀 3명 이상: 29,160원 + 초과 1명당 25,000원</li>
                                </ul>
                                <p className="mt-1 text-muted-foreground">연간소득 100만원 초과 자녀는 제외</p>
                              </div>
                            </div>
                          </div>
                          <Input
                            type="number"
                            min={0}
                            max={10}
                            value={formData.children_aged_8_to_20}
                            onChange={(e) =>
                              setFormData({ ...formData, children_aged_8_to_20: Number(e.target.value) })
                            }
                          />
                          <p className="text-xs text-muted-foreground">간이세액 자녀공제 적용</p>
                        </div>
                      </div>

                      {/* 정산방식 - 일용직/프리랜서만 표시 */}
                      {(formData.employment_type === "daily" || formData.employment_type === "freelancer") && (
                        <div className="space-y-2">
                          <Label>정산 방식</Label>
                          <Select
                            value={formData.settlement_type}
                            onValueChange={(value) => setFormData({ ...formData, settlement_type: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="employment_income">근로소득 (일용직)</SelectItem>
                              <SelectItem value="business_income_3_3">사업소득 3.3%</SelectItem>
                            </SelectContent>
                          </Select>
                          {formData.settlement_type === "business_income_3_3" && (
                            <p className="text-xs text-destructive">
                              ⚠️ 일용직 근로자는 일반적으로 근로소득으로 처리됩니다. 3.3% 사업소득 방식은 세무상 문제가
                              발생할 수 있으므로 사업주 책임 하에 선택하시기 바랍니다.
                            </p>
                          )}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>부서 *</Label>
                          <Select
                            value={formData.department}
                            onValueChange={(value) => setFormData({ ...formData, department: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="부서 선택" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {deptTree.map((node) => (
                                <SelectItem key={node.id} value={node.name}>
                                  {"　".repeat(node.depth)}
                                  {node.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>직급 *</Label>
                          <Select
                            value={formData.position}
                            onValueChange={(value) => setFormData({ ...formData, position: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="직급 선택" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {dbPositions.map((pos) => (
                                <SelectItem key={pos} value={pos}>
                                  {pos}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>이메일</Label>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          placeholder=""
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>연락처</Label>
                        <Input
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          placeholder=""
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>급여계좌 은행</Label>
                          <Select
                            value={formData.bank_name}
                            onValueChange={(value) => setFormData({ ...formData, bank_name: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="선택" />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {bankList.map((bank) => (
                                <SelectItem key={bank} value={bank}>
                                  {bank}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>계좌번호</Label>
                          <Input
                            value={formData.account_number}
                            onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                            placeholder="숫자만 입력하세요 ('-'제외)"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>급여 유형 *</Label>
                        <Select
                          value={formData.pay_type}
                          onValueChange={(value: "hourly" | "monthly" | "daily") =>
                            setFormData({ ...formData, pay_type: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monthly">월급제</SelectItem>
                            <SelectItem value="hourly">시급제</SelectItem>
                            {(formData.employment_type === "contract" || formData.employment_type === "freelancer") && (
                              <SelectItem value="daily">일급제</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {formData.pay_type === "hourly" && "시급제 선택 시 설정의 수당 배율이 적용됩니다"}
                          {formData.pay_type === "daily" && "일급제 선택 시 근무일수에 따라 급여가 계산됩니다"}
                          {formData.pay_type === "monthly" && "월급제 선택 시 고정 월급이 적용됩니다"}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>입사일</Label>
                          <Input
                            type="date"
                            value={formData.hire_date}
                            onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>퇴사일</Label>
                          <Input
                            type="date"
                            value={formData.resignation_date}
                            onChange={(e) => setFormData({ ...formData, resignation_date: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {formData.pay_type === "monthly" && (
                          <div className="space-y-2">
                            <Label>기본급 (월)</Label>
                            <Input
                              type="number"
                              value={formData.base_salary}
                              onChange={(e) => setFormData({ ...formData, base_salary: e.target.value })}
                              placeholder=""
                            />
                          </div>
                        )}
                        {formData.pay_type === "hourly" && (
                          <div className="space-y-2">
                            <Label>시급 (원)</Label>
                            <Input
                              type="number"
                              value={formData.hourly_rate}
                              onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
                              placeholder="15000"
                            />
                          </div>
                        )}
                        {formData.pay_type === "daily" && (
                          <div className="space-y-2">
                            <Label>일급 (원)</Label>
                            <Input
                              type="number"
                              value={formData.daily_rate}
                              onChange={(e) => setFormData({ ...formData, daily_rate: e.target.value })}
                              placeholder="150000"
                            />
                          </div>
                        )}
                      </div>
                      <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                        <div>
                          <p className="text-sm font-semibold">4대보험 산정 기준금액</p>
                          <p className="text-xs text-muted-foreground">
  공단 고지 기준금액이 변경된 경우에만 수정합니다. 매월 급여 변동 시 수정하는 항목이 아닙니다.
</p>
<p className="text-xs text-muted-foreground">
  ※ 국민연금 기준소득월액은 2025.07~2026.06 기준 400,000원 ~ 6,370,000원 범위로 입력합니다.
</p>
<p className="text-xs text-muted-foreground">
  ※ 건강보험료는 2026년 기준 근로자 본인 부담 월 20,160원 ~ 4,591,740원 범위의 상·하한이 적용됩니다.
</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>국민연금 기준소득월액</Label>
                            <Input
                              type="number"
                              value={formData.national_pension_monthly_income}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  national_pension_monthly_income: e.target.value,
                                })
                              }
                              placeholder="예: 3000000"
                            />
                            <p className="text-xs text-muted-foreground">
                              국민연금공단 기준소득월액 변경 시 수정
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label>건강보험 보수월액</Label>
                            <Input
                              type="number"
                              value={formData.health_insurance_monthly_income}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  health_insurance_monthly_income: e.target.value,
                                })
                              }
                              placeholder="예: 3000000"
                            />
                            <p className="text-xs text-muted-foreground">
                              건강보험공단 보수월액 변경 시 수정
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-4">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsOpen(false);
                            resetForm();
                          }}
                        >
                          취소
                        </Button>
                        <Button onClick={handleSubmit} disabled={addEmployee.isPending || updateEmployee.isPending}>
                          {(addEmployee.isPending || updateEmployee.isPending) && (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          )}
                          {editingEmployeeId ? "수정" : "등록"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* 직원 검색 콤보박스 */}
            {employees.length > 0 && (
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 max-w-sm">
                  <EmployeeCombobox
                    employees={employees}
                    value=""
                    onValueChange={(empId) => {
                      const emp = employees.find((e) => e.id === empId);
                      if (emp) setDetailEmployee(emp);
                    }}
                    placeholder="직원 검색 (이름, 사번, 부서)..."
                  />
                </div>
              </div>
            )}

            <div className="rounded-lg border bg-card">
              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">직원 목록을 불러오는 중...</span>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow key="empty-row">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            filteredEmployees.length > 0 && selectedExportIds.length === filteredEmployees.length
                          }
                          onCheckedChange={(checked) => {
                            setSelectedExportIds(checked ? filteredEmployees.map((e) => e.id) : []);
                          }}
                          aria-label="전체 선택"
                        />
                      </TableHead>
                      <TableHead>사원번호</TableHead>
                      <TableHead>이름</TableHead>
                      <TableHead>고용형태</TableHead>
                      <TableHead>직종</TableHead>
                      <TableHead>급여유형</TableHead>
                      <TableHead>부서</TableHead>
                      <TableHead>직급</TableHead>
                      <TableHead>연락처</TableHead>
                      <TableHead>입사일</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead className="text-right">액션</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.length === 0 ? (
  <TableRow key="empty-row">
    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
      {selectedDepartment
        ? `${selectedDepartment} 부서에 등록된 직원이 없습니다.`
        : "등록된 직원이 없습니다. 신규 직원을 등록해주세요."}
    </TableCell>
  </TableRow>
) : (
                      filteredEmployees.map((employee) => (
                        <TableRow key={`emp-row-${employee.id}-${employee.is_active}`}>
                          <TableCell>
                            <Checkbox
                              checked={selectedExportIds.includes(employee.id)}
                              onCheckedChange={(checked) => {
                                setSelectedExportIds((prev) =>
                                  checked ? [...prev, employee.id] : prev.filter((id) => id !== employee.id),
                                );
                              }}
                              aria-label={`${employee.name} 선택`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{employee.employee_number}</TableCell>
                          <TableCell>{employee.name}</TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={cn("font-medium", employmentTypeConfig[employee.employment_type].class)}
                            >
                              {employmentTypeConfig[employee.employment_type].label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={cn("font-medium", jobCategoryConfig[employee.job_category]?.class)}
                            >
                              {jobCategoryConfig[employee.job_category]?.label || employee.job_category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-medium">
                              {employee.pay_type === "monthly"
                                ? "월급"
                                : employee.pay_type === "daily"
                                  ? "일급"
                                  : "시급"}
                            </Badge>
                          </TableCell>
                          <TableCell>{employee.department}</TableCell>
                          <TableCell>{employee.position}</TableCell>
                          <TableCell>{employee.phone}</TableCell>
                          <TableCell>{employee.hire_date}</TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "font-medium cursor-pointer hover:opacity-80 transition-opacity",
                                statusConfig[employee.is_active ? "active" : "inactive"].class,
                              )}
                              onClick={() => handleToggleStatus(employee)}
                            >
                              {statusConfig[employee.is_active ? "active" : "inactive"].label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => setDetailEmployee(employee)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => handleEdit(employee)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {!employee.is_active ? (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleReactivate(employee)}
                                  title="재입사 처리"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </Button>
                              ) : (
                                (() => {
                                  const counts = employeeRecordCounts[employee.id];
                                  const canDelete = counts && counts.attendance === 0 && counts.snapshots === 0;
                                  return canDelete ? (
                                    <Button size="icon" variant="ghost" onClick={() => handleDelete(employee)}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  ) : (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => handleResign(employee)}
                                      title="퇴사 처리"
                                    >
                                      <UserX className="w-4 h-4" />
                                    </Button>
                                  );
                                })()
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}

              {/* 선택 요약 바 */}
              {selectedExportIds.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-t rounded-b-lg">
                  <span className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{selectedExportIds.length}명</span> /{" "}
                    {filteredEmployees.length}명 선택됨
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedExportIds([])}>
                      선택 해제
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportEmployees}>
                      <Download className="w-3 h-3 mr-1" />
                      선택 직원 엑셀 다운로드
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 직원 상세보기 다이얼로그 - 조건부 블록 밖에 배치 */}
      <Dialog
        open={!!detailEmployee}
        onOpenChange={(open) => {
          if (!open) setDetailEmployee(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>직원 상세 정보</DialogTitle>
          </DialogHeader>
          {detailEmployee && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">사원번호</p>
                  <p className="font-medium">{detailEmployee.employee_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">이름</p>
                  <p className="font-medium">{detailEmployee.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">부서</p>
                  <p className="font-medium">{detailEmployee.department || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">직급</p>
                  <p className="font-medium">{detailEmployee.position || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">고용형태</p>
                  <p className="font-medium">
                    {employmentTypeConfig[detailEmployee.employment_type]?.label || detailEmployee.employment_type}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">직종</p>
                  <p className="font-medium">
                    {jobCategoryConfig[detailEmployee.job_category]?.label || detailEmployee.job_category}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">급여유형</p>
                  <p className="font-medium">
                    {detailEmployee.pay_type === "monthly"
                      ? "월급제"
                      : detailEmployee.pay_type === "daily"
                        ? "일급제"
                        : "시급제"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">입사일</p>
                  <p className="font-medium">{detailEmployee.hire_date}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">상태</p>
                  <Badge
                    variant="secondary"
                    className={cn("font-medium", statusConfig[detailEmployee.is_active ? "active" : "inactive"].class)}
                  >
                    {statusConfig[detailEmployee.is_active ? "active" : "inactive"].label}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">주민등록번호</p>
                  <p className="font-medium">{detailEmployee.resident_number || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">
                    {detailEmployee.pay_type === "monthly"
                      ? "기본급 (월)"
                      : detailEmployee.pay_type === "daily"
                        ? "일급"
                        : "시급"}
                  </p>
                  <p className="font-medium">
                    {detailEmployee.pay_type === "monthly"
                      ? `${detailEmployee.base_salary.toLocaleString()}원`
                      : detailEmployee.pay_type === "daily"
                        ? `${(detailEmployee.daily_rate || 0).toLocaleString()}원`
                        : `${(detailEmployee.hourly_rate || 0).toLocaleString()}원`}
                  </p>
                </div>
                                <div>
                  <p className="text-muted-foreground">국민연금 기준소득월액</p>
                  <p className="font-medium">
                    {((detailEmployee as any).national_pension_monthly_income || 0).toLocaleString()}원
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">건강보험 보수월액</p>
                  <p className="font-medium">
                    {((detailEmployee as any).health_insurance_monthly_income || 0).toLocaleString()}원
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">이메일</p>
                  <p className="font-medium">{detailEmployee.email || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">연락처</p>
                  <p className="font-medium">{detailEmployee.phone || "-"}</p>
                </div>
              </div>
              <div className="border-t pt-3">
                <h4 className="text-sm font-semibold mb-2">급여계좌 정보</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">은행명</p>
                    <p className="font-medium">{detailEmployee.bank_name || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">계좌번호</p>
                    <p className="font-medium">{detailEmployee.account_number || "-"}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {(controlledTab || "list") === "leave" && <LeaveManagement />}

      {/* 상태 토글 확인 다이얼로그 */}
      <AlertDialog
        open={!!statusToggleTarget}
        onOpenChange={(open) => {
          if (!open) setStatusToggleTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>상태 변경 확인</AlertDialogTitle>
            <AlertDialogDescription>
              {statusToggleTarget?.is_active
                ? `${statusToggleTarget?.name} 직원을 퇴직 처리하시겠습니까? 오늘 날짜로 퇴사일이 설정됩니다.`
                : `${statusToggleTarget?.name} 직원을 재직 상태로 복귀시키겠습니까? 퇴사일이 초기화됩니다.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggleStatus}>
              {statusToggleTarget?.is_active ? "퇴직 처리" : "재직 복귀"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>직원 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} 직원을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 퇴사 처리 확인 다이얼로그 */}
      <AlertDialog
        open={!!resignTarget}
        onOpenChange={(open) => {
          if (!open) setResignTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>퇴사 처리</AlertDialogTitle>
            <AlertDialogDescription>
              {resignTarget?.name} 직원을 퇴사 처리하시겠습니까?
              <br />
              <br />
              퇴사 처리된 직원은 급여 계산 및 근태 입력 대상에서 제외됩니다. 직원 목록에서 기본 숨김 처리되며,
              &quot;퇴사자 포함&quot; 토글로 조회할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResign}>퇴사 처리</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 재입사 확인 다이얼로그 */}
      <AlertDialog
        open={!!reactivateTarget}
        onOpenChange={(open) => {
          if (!open) setReactivateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>재입사 처리</AlertDialogTitle>
            <AlertDialogDescription>
              {reactivateTarget?.name} 직원을 재입사(재직) 상태로 복원하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReactivate}>재입사 처리</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EmployeeBulkUpload
        open={isBulkUploadOpen}
        onOpenChange={setIsBulkUploadOpen}
        existingEmployeeNumbers={employees.map((e) => e.employee_number)}
        defaultDepartment={dbDepartments.find((d) => d === "기본부서") || "기본부서"}
        defaultPosition={dbPositions.find((p) => p === "미지정") || "미지정"}
      />
    </div>
  );
}
