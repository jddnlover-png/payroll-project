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

export function MonthlyTrendReport() {
  const { currentOrganization } = useOrganization();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [showPrint, setShowPrint] = useState(false);
  const years = [2024, 2025, 2026, 2027];

  const { data, isLoading } = useQuery({
    queryKey: ["monthly-trend-report", currentOrganization?.id, year],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("payroll_records")
        .select("period_month, total_payments, net_salary, employee_id")
        .eq("organization_id", currentOrganization.id)
        .eq("period_year", year);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const rows = data?.filter((r) => r.period_month === m) || [];
    const totalPayments = rows.reduce((sum, r) => sum + (r.total_payments || 0), 0);
    const totalNet = rows.reduce((sum, r) => sum + (r.net_salary || 0), 0);
    const headcount = rows.length;
    return { month: m, totalPayments, totalNet, headcount };
  });

  const maxAmount = Math.max(...monthlyData.map((d) => d.totalPayments), 1);
  const hasData = monthlyData.some((d) => d.totalPayments > 0);

  // 엑셀 데이터
  const excelHeaders = ["월", "인원", "지급총액", "실지급총액", "전월대비(%)"];
  const excelRows = monthlyData.map((d, i) => {
    const prev = i > 0 ? monthlyData[i - 1].totalPayments : 0;
    const diff =
      prev > 0 && d.totalPayments > 0
        ? `${Number((((d.totalPayments - prev) / prev) * 100).toFixed(1)) >= 0 ? "+" : ""}${(((d.totalPayments - prev) / prev) * 100).toFixed(1)}%`
        : "-";
    return [
      `${d.month}월`,
      d.headcount > 0 ? `${d.headcount}명` : "-",
      d.totalPayments > 0 ? d.totalPayments : 0,
      d.totalNet > 0 ? d.totalNet : 0,
      diff,
    ];
  });

  const handleExportExcel = async () => {
    await exportToExcel(`인건비월별추이_${year}년`, "인건비 월별 추이", excelHeaders, excelRows);
  };

  // 인쇄용 테이블
  const PrintContent = () => (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
      <thead>
        <tr style={{ backgroundColor: "#e8e8e8" }}>
          <th style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "left" }}>월</th>
          <th style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>인원</th>
          <th style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>지급총액</th>
          <th style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>실지급총액</th>
          <th style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>전월 대비</th>
        </tr>
      </thead>
      <tbody>
        {monthlyData.map((d, i) => {
          const prev = i > 0 ? monthlyData[i - 1].totalPayments : 0;
          const diff = prev > 0 ? (((d.totalPayments - prev) / prev) * 100).toFixed(1) : null;
          return (
            <tr key={d.month} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
              <td style={{ border: "1px solid #555", padding: "3px 6px", fontWeight: "bold" }}>{d.month}월</td>
              <td style={{ border: "1px solid #555", padding: "3px 6px", textAlign: "right" }}>
                {d.headcount > 0 ? `${d.headcount}명` : "-"}
              </td>
              <td style={{ border: "1px solid #555", padding: "3px 6px", textAlign: "right" }}>
                {d.totalPayments > 0 ? formatWon(d.totalPayments) : "-"}
              </td>
              <td style={{ border: "1px solid #555", padding: "3px 6px", textAlign: "right" }}>
                {d.totalNet > 0 ? formatWon(d.totalNet) : "-"}
              </td>
              <td style={{ border: "1px solid #555", padding: "3px 6px", textAlign: "right" }}>
                {diff !== null && d.totalPayments > 0 ? `${Number(diff) >= 0 ? "+" : ""}${diff}%` : "-"}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr style={{ backgroundColor: "#e8e8e8", fontWeight: "bold" }}>
          <td style={{ border: "1px solid #555", padding: "4px 6px" }}>연간합계</td>
          <td style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>
            {monthlyData.reduce((sum, d) => sum + d.headcount, 0) > 0
              ? `${monthlyData.reduce((sum, d) => sum + d.headcount, 0)}명`
              : "-"}
          </td>
          <td style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>
            {formatWon(monthlyData.reduce((sum, d) => sum + d.totalPayments, 0))}
          </td>
          <td style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>
            {formatWon(monthlyData.reduce((sum, d) => sum + d.totalNet, 0))}
          </td>
          <td style={{ border: "1px solid #555", padding: "4px 6px" }}></td>
        </tr>
      </tfoot>
    </table>
  );

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">인건비 월별 추이</h2>
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
            disabled={!hasData}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileDown className="w-4 h-4" />
            엑셀 내보내기
          </button>
          <button
            onClick={() => setShowPrint(true)}
            disabled={!hasData}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            인쇄
          </button>
        </div>
      </div>

      {/* 차트 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">월별 지급총액</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">불러오는 중...</p>
          ) : (
            <div className="flex items-end gap-2 h-48">
              {monthlyData.map((d) => (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end justify-center" style={{ height: "160px" }}>
                    <div
                      className="w-full bg-blue-500 rounded-t transition-all"
                      style={{
                        height: `${(d.totalPayments / maxAmount) * 100}%`,
                        minHeight: d.totalPayments > 0 ? "4px" : "0",
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{d.month}월</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">월</th>
                  <th className="text-right px-4 py-3 font-medium">인원</th>
                  <th className="text-right px-4 py-3 font-medium">지급총액</th>
                  <th className="text-right px-4 py-3 font-medium">실지급총액</th>
                  <th className="text-right px-4 py-3 font-medium">전월 대비</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((d, i) => {
                  const prev = i > 0 ? monthlyData[i - 1].totalPayments : 0;
                  const diff = prev > 0 ? (((d.totalPayments - prev) / prev) * 100).toFixed(1) : null;
                  return (
                    <tr key={d.month} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{d.month}월</td>
                      <td className="px-4 py-3 text-right">{d.headcount > 0 ? `${d.headcount}명` : "-"}</td>
                      <td className="px-4 py-3 text-right">{d.totalPayments > 0 ? formatWon(d.totalPayments) : "-"}</td>
                      <td className="px-4 py-3 text-right">{d.totalNet > 0 ? formatWon(d.totalNet) : "-"}</td>
                      <td className="px-4 py-3 text-right">
                        {diff !== null && d.totalPayments > 0 ? (
                          <span className={Number(diff) >= 0 ? "text-red-500" : "text-blue-500"}>
                            {Number(diff) >= 0 ? "+" : ""}
                            {diff}%
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/50 font-bold border-t-2">
                <tr>
                  <td className="px-4 py-3">연간합계</td>
                  <td className="px-4 py-3 text-right">
                    {monthlyData.reduce((sum, d) => sum + d.headcount, 0) > 0
                      ? `${monthlyData.reduce((sum, d) => sum + d.headcount, 0)}명`
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatWon(monthlyData.reduce((sum, d) => sum + d.totalPayments, 0))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatWon(monthlyData.reduce((sum, d) => sum + d.totalNet, 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 인쇄 미리보기 모달 */}
      {showPrint && (
        <PrintPreviewModal
          title="인건비 월별 추이"
          subtitle={`${year}년`}
          contentId="monthly-trend-print"
          excelFilename={`인건비월별추이_${year}년`}
          excelSheetName="인건비 월별 추이"
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
