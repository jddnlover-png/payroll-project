import { useState } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportToExcel } from "@/utils/exportExcel";
import { PrintPreviewModal } from "@/components/reports/PrintPreviewModal";
import { FileDown, Printer } from "lucide-react";

function formatWon(amount: number) {
  return amount > 0 ? `₩${amount.toLocaleString("ko-KR")}` : "-";
}

export function AnnualSalaryReport() {
  const { currentOrganization } = useOrganization();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [searchName, setSearchName] = useState("");
  const [showPrint, setShowPrint] = useState(false);
  const years = [2024, 2025, 2026, 2027];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["annual-salary-report", currentOrganization?.id, year],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("payroll_records")
        .select(
          `
          period_month, net_salary, total_payments,
          employees!inner(id, name, department, pay_type)
        `,
        )
        .eq("organization_id", currentOrganization.id)
        .eq("period_year", year);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const employeeMap = new Map<
    string,
    { name: string; department: string; pay_type: string; monthly: Record<number, number>; total: number }
  >();
  data?.forEach((row) => {
    const emp = row.employees as any;
    if (!employeeMap.has(emp.id)) {
      employeeMap.set(emp.id, {
        name: emp.name,
        department: emp.department || "-",
        pay_type: emp.pay_type,
        monthly: {},
        total: 0,
      });
    }
    const entry = employeeMap.get(emp.id)!;
    entry.monthly[row.period_month] = row.net_salary || 0;
    entry.total += row.net_salary || 0;
  });

  const allEmployees = Array.from(employeeMap.values()).sort((a, b) => b.total - a.total);
  const employees = allEmployees.filter((emp) => searchName === "" || emp.name.includes(searchName));

  // 엑셀 데이터
  const excelHeaders = ["직원명", "부서", ...months.map((m) => `${m}월`), "연간합계"];
  const excelRows = [
    ...employees.map((emp) => [emp.name, emp.department, ...months.map((m) => emp.monthly[m] || 0), emp.total]),
    [
      "합계",
      "",
      ...months.map((m) => employees.reduce((sum, emp) => sum + (emp.monthly[m] || 0), 0)),
      employees.reduce((sum, emp) => sum + emp.total, 0),
    ],
  ];

  const handleExportExcel = async () => {
    await exportToExcel(`직원별연간급여_${year}년`, "직원별 연간 급여", excelHeaders, excelRows);
  };

  // 인쇄용 테이블
  const PrintContent = () => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", minWidth: "900px" }}>
        <thead>
          <tr style={{ backgroundColor: "#e8e8e8" }}>
            <th style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "left" }}>직원명</th>
            <th style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "left" }}>부서</th>
            {months.map((m) => (
              <th
                key={m}
                style={{ border: "1px solid #555", padding: "4px 4px", textAlign: "right", whiteSpace: "nowrap" }}
              >
                {m}월
              </th>
            ))}
            <th
              style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right", backgroundColor: "#dbeafe" }}
            >
              연간합계
            </th>
          </tr>
        </thead>
        <tbody>
          {employees.map((emp, i) => (
            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
              <td style={{ border: "1px solid #555", padding: "3px 6px", fontWeight: "bold" }}>{emp.name}</td>
              <td style={{ border: "1px solid #555", padding: "3px 6px", color: "#666" }}>{emp.department}</td>
              {months.map((m) => (
                <td
                  key={m}
                  style={{ border: "1px solid #555", padding: "3px 4px", textAlign: "right", whiteSpace: "nowrap" }}
                >
                  {emp.monthly[m] ? `₩${emp.monthly[m].toLocaleString("ko-KR")}` : "-"}
                </td>
              ))}
              <td
                style={{
                  border: "1px solid #555",
                  padding: "3px 6px",
                  textAlign: "right",
                  fontWeight: "bold",
                  color: "#1d4ed8",
                  backgroundColor: "#eff6ff",
                }}
              >
                {formatWon(emp.total)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: "#e8e8e8", fontWeight: "bold" }}>
            <td colSpan={2} style={{ border: "1px solid #555", padding: "4px 6px" }}>
              합계
            </td>
            {months.map((m) => {
              const monthTotal = employees.reduce((sum, emp) => sum + (emp.monthly[m] || 0), 0);
              return (
                <td
                  key={m}
                  style={{ border: "1px solid #555", padding: "4px 4px", textAlign: "right", whiteSpace: "nowrap" }}
                >
                  {monthTotal > 0 ? `₩${monthTotal.toLocaleString("ko-KR")}` : "-"}
                </td>
              );
            })}
            <td
              style={{
                border: "1px solid #555",
                padding: "4px 6px",
                textAlign: "right",
                color: "#1d4ed8",
                backgroundColor: "#eff6ff",
              }}
            >
              {formatWon(employees.reduce((sum, emp) => sum + emp.total, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">직원별 연간 급여</h2>
        <div className="flex gap-2 items-center">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}년
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={handleExportExcel}
            disabled={employees.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileDown className="w-4 h-4" />
            엑셀 내보내기
          </button>
          <button
            onClick={() => setShowPrint(true)}
            disabled={employees.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            인쇄
          </button>
        </div>
      </div>

      {/* 검색 영역 */}
      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="직원명 검색..."
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {searchName && (
          <button
            onClick={() => setSearchName("")}
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border rounded-md"
          >
            초기화
          </button>
        )}
        <span className="text-sm text-muted-foreground">{employees.length}명</span>
      </div>

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium sticky left-0 bg-muted/50">직원명</th>
                  <th className="text-left px-4 py-3 font-medium">부서</th>
                  {months.map((m) => (
                    <th key={m} className="text-right px-3 py-3 font-medium whitespace-nowrap">
                      {m}월
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 font-medium whitespace-nowrap bg-blue-50">연간합계</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={15} className="text-center py-8 text-muted-foreground">
                      불러오는 중...
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="text-center py-8 text-muted-foreground">
                      {searchName ? "검색 결과가 없습니다." : "해당 연도 급여 데이터가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  employees.map((emp, i) => (
                    <tr key={i} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium sticky left-0 bg-background">{emp.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{emp.department}</td>
                      {months.map((m) => (
                        <td key={m} className="px-3 py-3 text-right whitespace-nowrap">
                          {emp.monthly[m] ? `₩${emp.monthly[m].toLocaleString("ko-KR")}` : "-"}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-bold text-blue-600 whitespace-nowrap bg-blue-50">
                        {formatWon(emp.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {employees.length > 0 && (
                <tfoot className="bg-muted/50 font-bold border-t-2">
                  <tr>
                    <td className="px-4 py-3" colSpan={2}>
                      합계
                    </td>
                    {months.map((m) => {
                      const monthTotal = employees.reduce((sum, emp) => sum + (emp.monthly[m] || 0), 0);
                      return (
                        <td key={m} className="px-3 py-3 text-right whitespace-nowrap">
                          {monthTotal > 0 ? `₩${monthTotal.toLocaleString("ko-KR")}` : "-"}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right text-blue-600 bg-blue-50">
                      {formatWon(employees.reduce((sum, emp) => sum + emp.total, 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 인쇄 미리보기 모달 */}
      {showPrint && (
        <PrintPreviewModal
          title="직원별 연간 급여"
          subtitle={`${year}년`}
          contentId="annual-salary-print"
          excelFilename={`직원별연간급여_${year}년`}
          excelSheetName="직원별 연간 급여"
          excelHeaders={excelHeaders}
          excelRows={excelRows}
          onClose={() => setShowPrint(false)}
        >
          <PrintContent />
        </PrintPreviewModal>
      )}
    </div>
  );
}
