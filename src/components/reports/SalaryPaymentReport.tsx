import { useState } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportToExcel } from "@/utils/exportExcel";
import { PrintPreviewModal } from "@/components/reports/PrintPreviewModal";
import { FileDown, Printer } from "lucide-react";

function formatWon(amount: number) {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

function formatNum(amount: number) {
  return amount;
}

export function SalaryPaymentReport() {
  const { currentOrganization } = useOrganization();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [searchName, setSearchName] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterPayType, setFilterPayType] = useState("all");
  const [showPrint, setShowPrint] = useState(false);
  const years = [2024, 2025, 2026, 2027];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["salary-payment-report", currentOrganization?.id, year, month],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("payroll_records")
        .select(
          `
          id, base_salary, total_payments, total_deductions, net_salary, status,
          employees!inner(name, department, pay_type)
        `,
        )
        .eq("organization_id", currentOrganization.id)
        .eq("period_year", year)
        .eq("period_month", month);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const departments = Array.from(new Set(data?.map((r) => (r.employees as any)?.department).filter(Boolean)));

  const filtered =
    data?.filter((r) => {
      const emp = r.employees as any;
      const nameMatch = searchName === "" || emp?.name?.includes(searchName);
      const deptMatch = filterDept === "all" || emp?.department === filterDept;
      const typeMatch = filterPayType === "all" || emp?.pay_type === filterPayType;
      return nameMatch && deptMatch && typeMatch;
    }) || [];

  const totalPayments = filtered.reduce((sum, r) => sum + (r.total_payments || 0), 0);
  const totalDeductions = filtered.reduce((sum, r) => sum + (r.total_deductions || 0), 0);
  const totalNet = filtered.reduce((sum, r) => sum + (r.net_salary || 0), 0);

  // 엑셀 데이터
  const excelHeaders = ["직원명", "부서", "급여유형", "기본급", "지급액", "공제액", "실지급액", "상태"];
  const excelRows = [
    ...filtered.map((row) => {
      const emp = row.employees as any;
      return [
        emp?.name || "",
        emp?.department || "-",
        emp?.pay_type === "hourly" ? "시급" : "월급",
        formatNum(row.base_salary || 0),
        formatNum(row.total_payments || 0),
        formatNum(row.total_deductions || 0),
        formatNum(row.net_salary || 0),
        row.status === "confirmed" ? "확정" : "대기",
      ];
    }),
    ["합계", "", "", "", formatNum(totalPayments), formatNum(totalDeductions), formatNum(totalNet), ""],
  ];

  const handleExportExcel = async () => {
    await exportToExcel(`급여지급현황_${year}년_${month}월`, "급여지급현황", excelHeaders, excelRows);
  };

  // 인쇄용 테이블
  const PrintContent = () => (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
      <thead>
        <tr style={{ backgroundColor: "#e8e8e8" }}>
          {excelHeaders.map((h) => (
            <th
              key={h}
              style={{
                border: "1px solid #555",
                padding: "4px 6px",
                textAlign: h === "직원명" || h === "부서" || h === "급여유형" || h === "상태" ? "left" : "right",
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filtered.map((row, i) => {
          const emp = row.employees as any;
          return (
            <tr key={row.id} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
              <td style={{ border: "1px solid #555", padding: "3px 6px" }}>{emp?.name}</td>
              <td style={{ border: "1px solid #555", padding: "3px 6px" }}>{emp?.department || "-"}</td>
              <td style={{ border: "1px solid #555", padding: "3px 6px" }}>
                {emp?.pay_type === "hourly" ? "시급" : "월급"}
              </td>
              <td style={{ border: "1px solid #555", padding: "3px 6px", textAlign: "right" }}>
                {formatWon(row.base_salary || 0)}
              </td>
              <td style={{ border: "1px solid #555", padding: "3px 6px", textAlign: "right" }}>
                {formatWon(row.total_payments || 0)}
              </td>
              <td style={{ border: "1px solid #555", padding: "3px 6px", textAlign: "right" }}>
                {formatWon(row.total_deductions || 0)}
              </td>
              <td style={{ border: "1px solid #555", padding: "3px 6px", textAlign: "right", fontWeight: "bold" }}>
                {formatWon(row.net_salary || 0)}
              </td>
              <td style={{ border: "1px solid #555", padding: "3px 6px" }}>
                {row.status === "confirmed" ? "확정" : "대기"}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr style={{ backgroundColor: "#e8e8e8", fontWeight: "bold" }}>
          <td colSpan={4} style={{ border: "1px solid #555", padding: "4px 6px" }}>
            합계 ({filtered.length}명)
          </td>
          <td style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>
            {formatWon(totalPayments)}
          </td>
          <td style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>
            {formatWon(totalDeductions)}
          </td>
          <td style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>{formatWon(totalNet)}</td>
          <td style={{ border: "1px solid #555", padding: "4px 6px" }}></td>
        </tr>
      </tfoot>
    </table>
  );

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">급여지급현황</h2>
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
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m}월
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={handleExportExcel}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileDown className="w-4 h-4" />
            엑셀 내보내기
          </button>
          <button
            onClick={() => setShowPrint(true)}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            인쇄
          </button>
        </div>
      </div>

      {/* 필터 영역 */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          type="text"
          placeholder="직원명 검색..."
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="부서 전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">부서 전체</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPayType} onValueChange={setFilterPayType}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="급여유형 전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">급여유형 전체</SelectItem>
            <SelectItem value="monthly">월급</SelectItem>
            <SelectItem value="hourly">시급</SelectItem>
          </SelectContent>
        </Select>
        {(searchName || filterDept !== "all" || filterPayType !== "all") && (
          <button
            onClick={() => {
              setSearchName("");
              setFilterDept("all");
              setFilterPayType("all");
            }}
            className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border rounded-md"
          >
            필터 초기화
          </button>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">총 지급액</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatWon(totalPayments)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">총 공제액</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-500">{formatWon(totalDeductions)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">총 실지급액</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{formatWon(totalNet)}</p>
          </CardContent>
        </Card>
      </div>

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">직원명</th>
                  <th className="text-left px-4 py-3 font-medium">부서</th>
                  <th className="text-left px-4 py-3 font-medium">급여유형</th>
                  <th className="text-right px-4 py-3 font-medium">기본급</th>
                  <th className="text-right px-4 py-3 font-medium">지급액</th>
                  <th className="text-right px-4 py-3 font-medium">공제액</th>
                  <th className="text-right px-4 py-3 font-medium">실지급액</th>
                  <th className="text-center px-4 py-3 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted-foreground">
                      불러오는 중...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted-foreground">
                      해당 조건의 급여 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{(row.employees as any)?.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{(row.employees as any)?.department || "-"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            (row.employees as any)?.pay_type === "hourly"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {(row.employees as any)?.pay_type === "hourly" ? "시급" : "월급"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{formatWon(row.base_salary || 0)}</td>
                      <td className="px-4 py-3 text-right text-green-600">{formatWon(row.total_payments || 0)}</td>
                      <td className="px-4 py-3 text-right text-red-500">{formatWon(row.total_deductions || 0)}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-600">{formatWon(row.net_salary || 0)}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            row.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {row.status === "confirmed" ? "확정" : "대기"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot className="bg-muted/50 font-bold border-t-2">
                  <tr>
                    <td className="px-4 py-3" colSpan={4}>
                      합계 ({filtered.length}명)
                    </td>
                    <td className="px-4 py-3 text-right text-green-600">{formatWon(totalPayments)}</td>
                    <td className="px-4 py-3 text-right text-red-500">{formatWon(totalDeductions)}</td>
                    <td className="px-4 py-3 text-right text-blue-600">{formatWon(totalNet)}</td>
                    <td></td>
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
          title="급여지급현황"
          subtitle={`${year}년 ${month}월`}
          contentId="salary-payment-print"
          excelFilename={`급여지급현황_${year}년_${month}월`}
          excelSheetName="급여지급현황"
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
