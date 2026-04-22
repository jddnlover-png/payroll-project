import { useMemo, useState } from "react";
import { useEmployees, Employee } from "@/hooks/useEmployees";
import { useAttendance } from "@/hooks/useAttendance";
import { StatCard } from "@/components/StatCard";
import { AttendanceTable } from "@/components/AttendanceTable";
import {
  Users,
  UserCheck,
  Clock,
  UserX,
  Search,
  X,
  Phone,
  Mail,
  Building2,
  CreditCard,
  CalendarDays,
} from "lucide-react";
import { EmployeeCombobox } from "@/components/employee/EmployeeCombobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type FilterType = "total" | "present" | "late" | "absent" | null;

export function DashboardTab() {
  const { employees: dbEmployees, activeEmployees, isLoading: isEmployeesLoading } = useEmployees();
  const today = new Date().toISOString().split("T")[0];
  const { attendance: dbAttendance, isLoading: isAttendanceLoading } = useAttendance(today);

  const [searchEmployeeId, setSearchEmployeeId] = useState("");
  const [highlightedEmployeeId, setHighlightedEmployeeId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const totalCount = activeEmployees.length;
  const presentCount = dbAttendance.filter((att) => att.status === "present").length;
  const lateCount = dbAttendance.filter((att) => att.status === "late").length;
  const absentCount = dbAttendance.filter((att) => att.status === "absent").length;

  const filteredList = useMemo(() => {
    if (!activeFilter) return [];
    if (isEmployeesLoading || isAttendanceLoading) return [];

    if (activeFilter === "total") {
      return activeEmployees.map((emp) => ({
        id: emp.id,
        employee_number: emp.employee_number,
        name: emp.name,
        department: emp.department || "-",
        position: emp.position || "-",
      }));
    }

    const matchingAttendance = dbAttendance.filter((att) => att.status === activeFilter);

    return matchingAttendance.map((att) => {
      const emp = dbEmployees.find((e) => e.id === att.employee_id);
      return {
        id: att.employee_id,
        employee_number: emp?.employee_number || "",
        name: emp?.name || "",
        department: emp?.department || "-",
        position: emp?.position || "-",
      };
    });
  }, [activeFilter, activeEmployees, dbAttendance, dbEmployees, isEmployeesLoading, isAttendanceLoading]);

  const filterLabels: Record<Exclude<FilterType, null>, string> = {
    total: "전체 직원",
    present: "금일 출근",
    late: "금일 지각",
    absent: "금일 결근",
  };

  const comboboxEmployees = useMemo(() => {
    if (isEmployeesLoading) return [];
    return activeEmployees.map((e) => ({
      id: e.id,
      name: e.name,
      department: e.department,
      employee_number: e.employee_number,
      position: e.position,
    }));
  }, [activeEmployees, isEmployeesLoading]);

  const handleEmployeeSearch = (empId: string) => {
    setSearchEmployeeId(empId);
    setHighlightedEmployeeId(empId);

    setTimeout(() => setHighlightedEmployeeId(null), 5000);

    setTimeout(() => {
      const el = document.getElementById(`dashboard-row-${empId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const handleStatClick = (filter: FilterType) => {
    setActiveFilter((prev) => (prev === filter ? null : filter));
  };

  return (
    <div className="space-y-4">
      <div className="mb-1 flex items-center justify-end gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <div className="w-56">
          <EmployeeCombobox
            employees={comboboxEmployees}
            value={searchEmployeeId}
            onValueChange={handleEmployeeSearch}
            placeholder="직원 검색..."
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="전체 직원"
          value={totalCount}
          variant="blue"
          icon={<Users />}
          active={activeFilter === "total"}
          onClick={() => handleStatClick("total")}
        />
        <StatCard
          title="금일 출근"
          value={presentCount}
          variant="green"
          icon={<UserCheck />}
          active={activeFilter === "present"}
          onClick={() => handleStatClick("present")}
        />
        <StatCard
          title="금일 지각"
          value={lateCount}
          variant="yellow"
          icon={<Clock />}
          active={activeFilter === "late"}
          onClick={() => handleStatClick("late")}
        />
        <StatCard
          title="금일 결근"
          value={absentCount}
          variant="purple"
          icon={<UserX />}
          active={activeFilter === "absent"}
          onClick={() => handleStatClick("absent")}
        />
      </div>

      {activeFilter && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b p-3">
            <h3 className="text-sm font-semibold leading-none">
              {filterLabels[activeFilter]} 명단 ({filteredList.length}명)
            </h3>
            <button
              onClick={() => setActiveFilter(null)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>사원번호</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>부서</TableHead>
                <TableHead>직위</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredList.length > 0 ? (
                filteredList.map((emp) => (
                  <TableRow
                    key={emp.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      const full = dbEmployees.find((e) => e.id === emp.id);
                      if (full) setSelectedEmployee(full);
                    }}
                  >
                    <TableCell className="font-medium">{emp.employee_number}</TableCell>
                    <TableCell>{emp.name}</TableCell>
                    <TableCell>{emp.department}</TableCell>
                    <TableCell>{emp.position}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-4 text-center text-muted-foreground">
                    해당하는 직원이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <AttendanceTable highlightedEmployeeId={highlightedEmployeeId} />

      <Dialog open={!!selectedEmployee} onOpenChange={(open) => !open && setSelectedEmployee(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              직원 상세 정보
            </DialogTitle>
          </DialogHeader>

          {selectedEmployee && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 border-b pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                  {selectedEmployee.name.charAt(0)}
                </div>
                <div>
                  <p className="text-lg font-semibold">{selectedEmployee.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedEmployee.employee_number}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <InfoItem icon={<Building2 className="h-4 w-4" />} label="부서" value={selectedEmployee.department || "-"} />
                <InfoItem icon={<Users className="h-4 w-4" />} label="직위" value={selectedEmployee.position || "-"} />
                <InfoItem icon={<Phone className="h-4 w-4" />} label="연락처" value={selectedEmployee.phone || "-"} />
                <InfoItem icon={<Mail className="h-4 w-4" />} label="이메일" value={selectedEmployee.email || "-"} />
                <InfoItem icon={<CalendarDays className="h-4 w-4" />} label="입사일" value={selectedEmployee.hire_date || "-"} />
                <InfoItem
                  icon={<CreditCard className="h-4 w-4" />}
                  label="급여유형"
                  value={
                    selectedEmployee.pay_type === "monthly"
                      ? "월급"
                      : selectedEmployee.pay_type === "hourly"
                        ? "시급"
                        : "일급"
                  }
                />
                <InfoItem
                  icon={<CreditCard className="h-4 w-4" />}
                  label="기본급"
                  value={`${(selectedEmployee.base_salary ?? 0).toLocaleString()}원`}
                />
                <InfoItem
                  icon={<Building2 className="h-4 w-4" />}
                  label="고용형태"
                  value={
                    {
                      regular: "정규직",
                      contract: "계약직",
                      daily: "일용직",
                      freelancer: "프리랜서",
                    }[selectedEmployee.employment_type] || selectedEmployee.employment_type
                  }
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="leading-tight">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}