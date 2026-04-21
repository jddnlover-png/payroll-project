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

export function DeductionSummaryReport() {
  const { currentOrganization } = useOrganization();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [showPrint, setShowPrint] = useState(false);
  const years = [2024, 2025, 2026, 2027];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const { data, isLoading } = useQuery({
    queryKey: ["deduction-summary-report", currentOrganization?.id, year],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("payroll_records")
        .select("period_month, deduction_items")
        .eq("organization_id", currentOrganization.id)
        .eq("period_year", year);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  const monthlyDeductions = months.map((m) => {
    const rows = data?.filter((r) => r.period_month === m) || [];
    let nationalPension = 0;
    let healthInsurance = 0;
    let employmentInsurance = 0;
    let incomeTax = 0;
    let total = 0;
    rows.forEach((row) => {
      const items = (row.deduction_items as any[]) || [];
      items.forEach((item) => {
        const amt = item.amount || 0;
        if (item.name?.includes("국민연금")) nationalPension += amt;
        else if (item.name?.includes("건강보험") || item.name?.includes("장기요양")) healthInsurance += amt;
        else if (item.name?.includes("고용보험")) employmentInsurance += amt;
        else if (item.name?.includes("소득세") || item.name?.includes("지방소득세")) incomeTax += amt;
        total += amt;
      });
    });
    return { month: m, nationalPension, healthInsurance, employmentInsurance, incomeTax, total };
  });

  const grandTotal = {
    nationalPension: monthlyDeductions.reduce((s, d) => s + d.nationalPension, 0),
    healthInsurance: monthlyDeductions.reduce((s, d) => s + d.healthInsurance, 0),
    employmentInsurance: monthlyDeductions.reduce((s, d) => s + d.employmentInsurance, 0),
    incomeTax: monthlyDeductions.reduce((s, d) => s + d.incomeTax, 0),
    total: monthlyDeductions.reduce((s, d) => s + d.total, 0),
  };

  const hasData = grandTotal.total > 0;

  // 엑셀 데이터
  const excelHeaders = ["월", "국민연금", "건강보험", "고용보험", "소득세", "공제합계"];
  const excelRows = [
    ...monthlyDeductions.map((d) => [
      `${d.month}월`,
      d.nationalPension,
      d.healthInsurance,
      d.employmentInsurance,
      d.incomeTax,
      d.total,
    ]),
    [
      "연간합계",
      grandTotal.nationalPension,
      grandTotal.healthInsurance,
      grandTotal.employmentInsurance,
      grandTotal.incomeTax,
      grandTotal.total,
    ],
  ];

  const handleExportExcel = async () => {
    await exportToExcel(`공제내역월별요약_${year}년`, "공제내역 월별 요약", excelHeaders, excelRows);
  };

  // 인쇄용 테이블
  const PrintContent = () => (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
      <thead>
        <tr style={{ backgroundColor: "#e8e8e8" }}>
          <th style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "left" }}>월</th>
          <th style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>국민연금</th>
          <th style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>건강보험</th>
          <th style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>고용보험</th>
          <th style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>소득세</th>
          <th style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right", backgroundColor: "#fee2e2" }}>
            공제합계
          </th>
        </tr>
      </thead>
      <tbody>
        {monthlyDeductions.map((d, i) => (
          <tr key={d.month} style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
            <td style={{ border: "1px solid #555", padding: "3px 6px", fontWeight: "bold" }}>{d.month}월</td>
            <td style={{ border: "1px solid #555", padding: "3px 6px", textAlign: "right" }}>
              {formatWon(d.nationalPension)}
            </td>
            <td style={{ border: "1px solid #555", padding: "3px 6px", textAlign: "right" }}>
              {formatWon(d.healthInsurance)}
            </td>
            <td style={{ border: "1px solid #555", padding: "3px 6px", textAlign: "right" }}>
              {formatWon(d.employmentInsurance)}
            </td>
            <td style={{ border: "1px solid #555", padding: "3px 6px", textAlign: "right" }}>
              {formatWon(d.incomeTax)}
            </td>
            <td
              style={{
                border: "1px solid #555",
                padding: "3px 6px",
                textAlign: "right",
                fontWeight: "bold",
                color: "#dc2626",
                backgroundColor: "#fff1f1",
              }}
            >
              {formatWon(d.total)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr style={{ backgroundColor: "#e8e8e8", fontWeight: "bold" }}>
          <td style={{ border: "1px solid #555", padding: "4px 6px" }}>연간합계</td>
          <td style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>
            {formatWon(grandTotal.nationalPension)}
          </td>
          <td style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>
            {formatWon(grandTotal.healthInsurance)}
          </td>
          <td style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>
            {formatWon(grandTotal.employmentInsurance)}
          </td>
          <td style={{ border: "1px solid #555", padding: "4px 6px", textAlign: "right" }}>
            {formatWon(grandTotal.incomeTax)}
          </td>
          <td
            style={{
              border: "1px solid #555",
              padding: "4px 6px",
              textAlign: "right",
              color: "#dc2626",
              backgroundColor: "#fff1f1",
            }}
          >
            {formatWon(grandTotal.total)}
          </td>
        </tr>
      </tfoot>
    </table>
  );

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">공제내역 월별 요약</h2>
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

      {/* 테이블 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">월</th>
                  <th className="text-right px-4 py-3 font-medium">국민연금</th>
                  <th className="text-right px-4 py-3 font-medium">건강보험</th>
                  <th className="text-right px-4 py-3 font-medium">고용보험</th>
                  <th className="text-right px-4 py-3 font-medium">소득세</th>
                  <th className="text-right px-4 py-3 font-medium bg-red-50">공제합계</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      불러오는 중...
                    </td>
                  </tr>
                ) : (
                  monthlyDeductions.map((d) => (
                    <tr key={d.month} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{d.month}월</td>
                      <td className="px-4 py-3 text-right">{formatWon(d.nationalPension)}</td>
                      <td className="px-4 py-3 text-right">{formatWon(d.healthInsurance)}</td>
                      <td className="px-4 py-3 text-right">{formatWon(d.employmentInsurance)}</td>
                      <td className="px-4 py-3 text-right">{formatWon(d.incomeTax)}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-500 bg-red-50">{formatWon(d.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-muted/50 font-bold border-t-2">
                <tr>
                  <td className="px-4 py-3">연간합계</td>
                  <td className="px-4 py-3 text-right">{formatWon(grandTotal.nationalPension)}</td>
                  <td className="px-4 py-3 text-right">{formatWon(grandTotal.healthInsurance)}</td>
                  <td className="px-4 py-3 text-right">{formatWon(grandTotal.employmentInsurance)}</td>
                  <td className="px-4 py-3 text-right">{formatWon(grandTotal.incomeTax)}</td>
                  <td className="px-4 py-3 text-right text-red-500 bg-red-50">{formatWon(grandTotal.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 인쇄 미리보기 모달 */}
      {showPrint && (
        <PrintPreviewModal
          title="공제내역 월별 요약"
          subtitle={`${year}년`}
          contentId="deduction-summary-print"
          excelFilename={`공제내역월별요약_${year}년`}
          excelSheetName="공제내역 월별 요약"
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
