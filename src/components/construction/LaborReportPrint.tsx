/**
 * 노무대장 출력 (근로기준법 시행령 제27조)
 */

import { DailyAttendanceRecord } from "@/hooks/useDailyAttendance";

interface Site {
  site_id: string;
  site_name: string;
}

interface WorkerSummary {
  name: string;
  ssnMasked: string;
  days: Set<string>;
  firstWorkDate: string;
  jobTypes: Set<string>;
  totalFinalPay: number;
  totalWeeklyHolidayPay: number;
  totalMealAllowance: number;
  totalVehicleAllowance: number;
  totalExtraNonTaxable: number;
  totalIncomeTax: number;
  totalLocalTax: number;
  totalEmploymentInsurance: number;
  totalNationalPension: number;
  totalHealthInsurance: number;
  totalLongTermCare: number;
  totalIndustrialAccident: number;
  totalDeductions: number;
  records: (DailyAttendanceRecord & { _workerKey: string })[];
}

interface WeeklyHolidayMap {
  get: (key: string) => number | undefined;
}

interface LaborReportPrintProps {
  year: number;
  month: number;
  lastDay: number;
  paymentDay: number;
  selectedSiteName: string;
  workerSummary: WorkerSummary[];
  records: (DailyAttendanceRecord & { _workerKey: string })[];
  sites: Site[];
  weeklyHolidayMap: WeeklyHolidayMap;
  dpSettings: any;
  grandTotal: number;
  grandDeductions: number;
  grandNetPay: number;
  onClose: () => void;
}

function formatDate(d: string) {
  return d.replace(/-/g, ".");
}

function formatCurrency(n: number | null | undefined): string {
  if (n == null || n === 0) return "-";
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

function getWeekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function extractPayBreakdown(r: DailyAttendanceRecord) {
  const topHolidayPay = Math.round(Number((r as any).holiday_pay ?? 0));
  const snap = r.calculation_snapshot as any;
  if (snap && snap.pay_breakdown) {
    return {
      regularPay: Math.round(Number(snap.pay_breakdown.regular_pay ?? 0)),
      overtimePay: Math.round(Number(snap.pay_breakdown.overtime_pay ?? 0)),
      nightPay: Math.round(Number(snap.pay_breakdown.night_pay ?? 0)),
      holidayPay: topHolidayPay || Math.round(Number(snap.pay_breakdown.holiday_pay ?? 0)),
    };
  }
  return {
    regularPay: r.calculated_pay != null ? Math.round(Number(r.calculated_pay)) : 0,
    overtimePay: 0,
    nightPay: 0,
    holidayPay: topHolidayPay,
  };
}

const printStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Malgun Gothic', sans-serif; font-size: 11px; padding: 20px; }
  h1 { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 6px; }
  h2 { font-size: 12px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px; }
  th, td { border: 1px solid #555; padding: 3px 4px; }
  th { background-color: #e8e8e8; font-weight: bold; }
  .text-right { text-align: right; }
  .font-bold { font-weight: bold; }
  .bg-gray { background-color: #f5f5f5; }
  @media print { body { padding: 10px; } @page { size: A4 landscape; margin: 10mm; } }
`;

export function LaborReportPrint({
  year,
  month,
  lastDay,
  paymentDay,
  selectedSiteName,
  workerSummary,
  records,
  sites,
  weeklyHolidayMap,
  dpSettings,
  grandTotal,
  grandDeductions,
  grandNetPay,
  onClose,
}: LaborReportPrintProps) {
  const mm = String(month).padStart(2, "0");
  const payPeriod = `${year}.${mm}.01 ~ ${year}.${mm}.${String(lastDay).padStart(2, "0")}`;
  const payDate = `${year}.${mm}.${String(paymentDay).padStart(2, "0")}`;

  const DAY_MAP: Record<string, number> = {
    MON: 1,
    TUE: 2,
    WED: 3,
    THU: 4,
    FRI: 5,
    SAT: 6,
    SUN: 0,
  };
  const scheduledDayNumbers = (dpSettings?.weekly_work_day_list || [])
    .map((d: string) => DAY_MAP[String(d).toUpperCase()])
    .filter((n: number | undefined): n is number => n !== undefined);
  const lastScheduledDayNum = scheduledDayNumbers.length > 0 ? scheduledDayNumbers[scheduledDayNumbers.length - 1] : -1;

  const getWeeklyHolidayPay = (r: DailyAttendanceRecord & { _workerKey: string }) => {
    const rowWeekStart = getWeekStart(r.work_date);
    const rowWeeklyKey = `${r._workerKey}|${rowWeekStart}`;
    const weekRows = records.filter((x) => x._workerKey === r._workerKey && getWeekStart(x.work_date) === rowWeekStart);
    const lastScheduledRow = weekRows
      .filter((x) => new Date(x.work_date + "T00:00:00").getDay() === lastScheduledDayNum)
      .sort((a, b) => a.work_date.localeCompare(b.work_date))[0];
    const displayRow = lastScheduledRow ?? weekRows.sort((a, b) => b.work_date.localeCompare(a.work_date))[0];
    return displayRow && displayRow.id === r.id ? Number(weeklyHolidayMap.get(rowWeeklyKey) ?? 0) : 0;
  };

  const openPrintWindow = (autoprint: boolean) => {
    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) return;
    const content = document.getElementById("labor-report-content");
    if (!content) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <title>노무대장</title>
        <style>${printStyles}</style>
      </head>
      <body>
        ${content.innerHTML}
        ${autoprint ? `<script>window.onload=function(){window.print();}<\/script>` : ""}
      </body>
      </html>
    `);
    printWindow.document.close();
    if (!autoprint) {
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  };

  const handleExcel = async () => {
    const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs" as any);
    const wb = XLSX.utils.book_new();

    // 시트1: 급여 집계
    const summaryHeaders = [
      "성명",
      "주민번호",
      "직종",
      "고용일",
      "지급기간",
      "지급일",
      "근무일수",
      "지급총액",
      "공제합계",
      "실지급액",
    ];
    const summaryRows = workerSummary.map((w) => {
      const totalGross =
        w.totalFinalPay +
        w.totalWeeklyHolidayPay +
        w.totalMealAllowance +
        w.totalVehicleAllowance +
        w.totalExtraNonTaxable;
      return [
        w.name,
        w.ssnMasked || "-",
        Array.from(w.jobTypes).join(", ") || "-",
        w.firstWorkDate ? w.firstWorkDate.replace(/-/g, ".") : "-",
        payPeriod,
        payDate,
        w.days.size,
        totalGross,
        w.totalDeductions,
        totalGross - w.totalDeductions,
      ];
    });
    summaryRows.push(["합계", "", "", "", "", "", "", grandTotal, grandDeductions, grandTotal - grandDeductions]);
    const ws1 = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
    XLSX.utils.book_append_sheet(wb, ws1, "급여집계");

    // 시트2: 상세 기록
    const detailHeaders = [
      "날짜",
      "현장",
      "성명",
      "직종",
      "근로시간(h)",
      "연장(h)",
      "야간(h)",
      "기본급",
      "연장수당",
      "야간수당",
      "휴일수당",
      "주휴수당",
    ];
    if (dpSettings.enable_meal_allowance) detailHeaders.push("식대");
    if (dpSettings.enable_vehicle_allowance) detailHeaders.push("차량운전보조금");
    if (dpSettings.enable_extra_non_taxable) detailHeaders.push(dpSettings.extra_non_taxable_name || "기타비과세");
    detailHeaders.push(
      "지급총액",
      "소득세",
      "지방세",
      "고용보험",
      "국민연금",
      "건강보험",
      "장기요양",
      "공제합계",
      "실수령액",
    );

    const detailRows = records.map((r) => {
      const site = sites.find((s) => s.site_id === r.site_id);
      const pb = extractPayBreakdown(r);
      const workH = Math.round((Number(r.work_minutes ?? 0) / 60) * 10) / 10;
      const mealAmt = Number((r as any).meal_allowance_amount ?? 0);
      const vehicleAmt = Number((r as any).vehicle_allowance_amount ?? 0);
      const extraAmt = Number((r as any).extra_non_taxable_allowance_amount ?? 0);
      const weeklyPay = getWeeklyHolidayPay(r);
      const calcPay = r.calculated_pay != null ? Math.round(Number(r.calculated_pay)) : 0;
      const totalGross = calcPay + weeklyPay + mealAmt + vehicleAmt + extraAmt;
      const totalDeductions = Number((r as any).total_deductions ?? 0);
      const row: any[] = [
        r.work_date.replace(/-/g, "."),
        site?.site_name || "-",
        r.worker_name,
        r.job_type || "보통인부",
        workH,
        Number((r as any).overtime_hours ?? 0),
        Number((r as any).night_hours ?? 0),
        pb.regularPay ?? 0,
        pb.overtimePay ?? 0,
        pb.nightPay ?? 0,
        pb.holidayPay ?? 0,
        weeklyPay,
      ];
      if (dpSettings.enable_meal_allowance) row.push(mealAmt);
      if (dpSettings.enable_vehicle_allowance) row.push(vehicleAmt);
      if (dpSettings.enable_extra_non_taxable) row.push(extraAmt);
      row.push(
        totalGross,
        Number((r as any).income_tax ?? 0),
        Number((r as any).local_income_tax ?? 0),
        Number((r as any).employment_insurance ?? 0),
        Number((r as any).national_pension ?? 0),
        Number((r as any).health_insurance ?? 0),
        Number((r as any).long_term_care_insurance ?? 0),
        totalDeductions,
        totalGross - totalDeductions,
      );
      return row;
    });
    const ws2 = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
    XLSX.utils.book_append_sheet(wb, ws2, "상세기록");

    const fileName = `노무대장_${year}년${mm}월_${selectedSiteName.replace(/[|\/\\:*?"<>]/g, "_")}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-white w-full max-w-6xl rounded-lg shadow-xl">
        {/* 버튼 영역 */}
        <div className="flex justify-end gap-2 p-4 print:hidden">
          <button
            onClick={handleExcel}
            className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
          >
            엑셀 저장
          </button>
          <button
            onClick={() => openPrintWindow(true)}
            className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            PDF 저장
          </button>
          <button
            onClick={() => openPrintWindow(false)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm"
          >
            인쇄
          </button>
          <button onClick={onClose} className="px-4 py-2 border rounded text-sm">
            닫기
          </button>
        </div>

        <div className="px-8 pb-8" id="labor-report-content" style={{ fontSize: "12px" }}>
          {/* 제목 */}
          <h1 className="text-center text-2xl font-bold mb-2">노 무 대 장</h1>
          <div className="text-center text-sm text-gray-600 mb-6">
            {selectedSiteName} | {payPeriod} | 지급일: {payDate}
          </div>

          {/* ── 상단 집계 테이블 ── */}
          <h2 className="text-sm font-bold mb-2 border-b pb-1">■ 급여 집계</h2>
          <table className="w-full border-collapse text-xs mb-8" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "8%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "6%" }} />
            </colgroup>
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-400 px-2 py-1.5 text-left">성명</th>
                <th className="border border-gray-400 px-2 py-1.5 text-left">주민번호</th>
                <th className="border border-gray-400 px-2 py-1.5 text-left">직종</th>
                <th className="border border-gray-400 px-2 py-1.5 text-left">고용일</th>
                <th className="border border-gray-400 px-2 py-1.5 text-left">지급기간</th>
                <th className="border border-gray-400 px-2 py-1.5 text-left">지급일</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">근무일수</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">총공수</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">지급총액</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">공제합계</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">실지급액</th>
              </tr>
            </thead>
            <tbody>
              {workerSummary.map((w) => {
                const totalGross =
                  w.totalFinalPay +
                  w.totalWeeklyHolidayPay +
                  w.totalMealAllowance +
                  w.totalVehicleAllowance +
                  w.totalExtraNonTaxable;
                return (
                  <tr key={w.name}>
                    <td className="border border-gray-400 px-2 py-1">{w.name}</td>
                    <td className="border border-gray-400 px-2 py-1">{w.ssnMasked || "-"}</td>
                    <td className="border border-gray-400 px-2 py-1">{Array.from(w.jobTypes).join(", ") || "-"}</td>
                    <td className="border border-gray-400 px-2 py-1">
                      {w.firstWorkDate ? formatDate(w.firstWorkDate) : "-"}
                    </td>
                    <td className="border border-gray-400 px-2 py-1">{payPeriod}</td>
                    <td className="border border-gray-400 px-2 py-1">{payDate}</td>
                    <td className="border border-gray-400 px-2 py-1 text-right">{w.days.size}일</td>
                    <td className="border border-gray-400 px-2 py-1 text-right">
                      {Math.round(
                        (w.records.reduce((s, r) => {
                          const wh =
                            (r as any).work_hours != null
                              ? Number((r as any).work_hours)
                              : Number(r.work_minutes ?? 0) / 60;
                          return s + wh;
                        }, 0) /
                          8) *
                          100,
                      ) / 100}
                      공수
                    </td>
                    <td className="border border-gray-400 px-2 py-1 text-right font-medium">
                      {formatCurrency(totalGross)}
                    </td>
                    <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(w.totalDeductions)}</td>
                    <td className="border border-gray-400 px-2 py-1 text-right font-medium">
                      {formatCurrency(totalGross - w.totalDeductions)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── 하단 상세 기록 ── */}
          <h2 className="text-sm font-bold mb-2 border-b pb-1">■ 상세 기록</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" style={{ tableLayout: "auto", minWidth: "1000px" }}>
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-400 px-1 py-1.5 whitespace-nowrap">날짜</th>
                  <th className="border border-gray-400 px-1 py-1.5 whitespace-nowrap">현장</th>
                  <th className="border border-gray-400 px-1 py-1.5 whitespace-nowrap">성명</th>
                  <th className="border border-gray-400 px-1 py-1.5 whitespace-nowrap">직종</th>
                  <th className="border border-gray-400 px-1 py-1.5 text-right whitespace-nowrap">근로시간</th>
                  <th className="border border-gray-400 px-1 py-1.5 text-right whitespace-nowrap">공수</th>
                  <th className="border border-gray-400 px-1 py-1.5 text-right whitespace-nowrap">연장(h)</th>
                  <th className="border border-gray-400 px-1 py-1.5 text-right whitespace-nowrap">야간(h)</th>
                  <th className="border border-gray-400 px-1 py-1.5 text-right whitespace-nowrap">기본급</th>
                  <th className="border border-gray-400 px-1 py-1.5 text-right whitespace-nowrap">연장수당</th>
                  <th className="border border-gray-400 px-1 py-1.5 text-right whitespace-nowrap">야간수당</th>
                  <th className="border border-gray-400 px-1 py-1.5 text-right whitespace-nowrap">휴일수당</th>
                  <th className="border border-gray-400 px-1 py-1.5 text-right whitespace-nowrap">주휴수당</th>
                  {dpSettings.enable_meal_allowance && (
                    <th className="border border-gray-400 px-2 py-1.5 text-right">식대</th>
                  )}
                  {dpSettings.enable_vehicle_allowance && (
                    <th className="border border-gray-400 px-2 py-1.5 text-right">차량</th>
                  )}
                  {dpSettings.enable_extra_non_taxable && (
                    <th className="border border-gray-400 px-2 py-1.5 text-right">
                      {dpSettings.extra_non_taxable_name || "기타"}
                    </th>
                  )}
                  <th className="border border-gray-400 px-2 py-1.5 text-right">지급총액</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right">소득세</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right">지방세</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right">고용보험</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right">국민연금</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right">건강보험</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right">장기요양</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right">공제합계</th>
                  <th className="border border-gray-400 px-2 py-1.5 text-right">실수령액</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const site = sites.find((s) => s.site_id === r.site_id);
                  const pb = extractPayBreakdown(r);
                  const workH = Math.round((Number(r.work_minutes ?? 0) / 60) * 10) / 10;
                  const overtimeH = Number((r as any).overtime_hours ?? 0);
                  const nightH = Number((r as any).night_hours ?? 0);
                  const mealAmt = Number((r as any).meal_allowance_amount ?? 0);
                  const vehicleAmt = Number((r as any).vehicle_allowance_amount ?? 0);
                  const extraAmt = Number((r as any).extra_non_taxable_allowance_amount ?? 0);
                  const weeklyHolidayPay = getWeeklyHolidayPay(r);
                  const calcPay = r.calculated_pay != null ? Math.round(Number(r.calculated_pay)) : 0;
                  const totalGross = calcPay + weeklyHolidayPay + mealAmt + vehicleAmt + extraAmt;
                  const totalDeductions = Number((r as any).total_deductions ?? 0);
                  return (
                    <tr key={r.id}>
                      <td className="border border-gray-400 px-2 py-1">{formatDate(r.work_date)}</td>
                      <td className="border border-gray-400 px-2 py-1">{site?.site_name || "-"}</td>
                      <td className="border border-gray-400 px-2 py-1">{r.worker_name}</td>
                      <td className="border border-gray-400 px-2 py-1">{r.job_type || "보통인부"}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">{workH}h</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">
                        {(() => {
                          const wh =
                            (r as any).work_hours != null
                              ? Number((r as any).work_hours)
                              : Number(r.work_minutes ?? 0) / 60;
                          return wh > 0 ? `${Math.round((wh / 8) * 100) / 100}공수` : "-";
                        })()}
                      </td>
                      <td className="border border-gray-400 px-2 py-1 text-right">{overtimeH > 0 ? overtimeH : "-"}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">{nightH > 0 ? nightH : "-"}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(pb.regularPay)}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(pb.overtimePay)}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(pb.nightPay)}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(pb.holidayPay)}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right">
                        {formatCurrency(weeklyHolidayPay)}
                      </td>
                      {dpSettings.enable_meal_allowance && (
                        <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(mealAmt)}</td>
                      )}
                      {dpSettings.enable_vehicle_allowance && (
                        <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(vehicleAmt)}</td>
                      )}
                      {dpSettings.enable_extra_non_taxable && (
                        <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(extraAmt)}</td>
                      )}
                      <td className="border border-gray-400 px-2 py-1 text-right font-medium">
                        {formatCurrency(totalGross)}
                      </td>
                      <td className="border border-gray-400 px-2 py-1 text-right">
                        {formatCurrency((r as any).income_tax)}
                      </td>
                      <td className="border border-gray-400 px-2 py-1 text-right">
                        {formatCurrency((r as any).local_income_tax)}
                      </td>
                      <td className="border border-gray-400 px-2 py-1 text-right">
                        {formatCurrency((r as any).employment_insurance)}
                      </td>
                      <td className="border border-gray-400 px-2 py-1 text-right">
                        {formatCurrency((r as any).national_pension)}
                      </td>
                      <td className="border border-gray-400 px-2 py-1 text-right">
                        {formatCurrency((r as any).health_insurance)}
                      </td>
                      <td className="border border-gray-400 px-2 py-1 text-right">
                        {formatCurrency((r as any).long_term_care_insurance)}
                      </td>
                      <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(totalDeductions)}</td>
                      <td className="border border-gray-400 px-2 py-1 text-right font-medium">
                        {formatCurrency(totalGross - totalDeductions)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-bold bg-gray-50">
                  <td className="border border-gray-400 px-2 py-1.5" colSpan={4}>
                    합계
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {Math.round((records.reduce((s, r) => s + Number(r.work_minutes ?? 0), 0) / 60) * 10) / 10}h
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {Math.round(
                      (records.reduce((s, r) => {
                        const wh =
                          (r as any).work_hours != null
                            ? Number((r as any).work_hours)
                            : Number(r.work_minutes ?? 0) / 60;
                        return s + wh;
                      }, 0) /
                        8) *
                        100,
                    ) / 100}
                    공수
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(records.reduce((s, r) => s + Number((r as any).overtime_hours ?? 0), 0))}
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(records.reduce((s, r) => s + Number((r as any).night_hours ?? 0), 0))}
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(records.reduce((s, r) => s + (extractPayBreakdown(r).regularPay ?? 0), 0))}
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(records.reduce((s, r) => s + (extractPayBreakdown(r).overtimePay ?? 0), 0))}
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(records.reduce((s, r) => s + (extractPayBreakdown(r).nightPay ?? 0), 0))}
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(records.reduce((s, r) => s + (extractPayBreakdown(r).holidayPay ?? 0), 0))}
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(
                      Array.from(new Set(records.map((r) => `${r._workerKey}|${getWeekStart(r.work_date)}`))).reduce(
                        (s, key) => s + Number(weeklyHolidayMap.get(key) ?? 0),
                        0,
                      ),
                    )}
                  </td>
                  {dpSettings.enable_meal_allowance && (
                    <td className="border border-gray-400 px-2 py-1.5 text-right">
                      {formatCurrency(records.reduce((s, r) => s + Number((r as any).meal_allowance_amount ?? 0), 0))}
                    </td>
                  )}
                  {dpSettings.enable_vehicle_allowance && (
                    <td className="border border-gray-400 px-2 py-1.5 text-right">
                      {formatCurrency(
                        records.reduce((s, r) => s + Number((r as any).vehicle_allowance_amount ?? 0), 0),
                      )}
                    </td>
                  )}
                  {dpSettings.enable_extra_non_taxable && (
                    <td className="border border-gray-400 px-2 py-1.5 text-right">
                      {formatCurrency(
                        records.reduce((s, r) => s + Number((r as any).extra_non_taxable_allowance_amount ?? 0), 0),
                      )}
                    </td>
                  )}
                  <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(grandTotal)}</td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(records.reduce((s, r) => s + Number((r as any).income_tax ?? 0), 0))}
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(records.reduce((s, r) => s + Number((r as any).local_income_tax ?? 0), 0))}
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(records.reduce((s, r) => s + Number((r as any).employment_insurance ?? 0), 0))}
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(records.reduce((s, r) => s + Number((r as any).national_pension ?? 0), 0))}
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(records.reduce((s, r) => s + Number((r as any).health_insurance ?? 0), 0))}
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(records.reduce((s, r) => s + Number((r as any).long_term_care_insurance ?? 0), 0))}
                  </td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(grandDeductions)}</td>
                  <td className="border border-gray-400 px-2 py-1.5 text-right">
                    {formatCurrency(grandTotal - grandDeductions)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 서명란 */}
          <div className="flex justify-end mt-8 text-sm">
            <div className="text-center">
              <p className="mb-8">위와 같이 노무비를 지급합니다.</p>
              <p>
                {year}년 {month}월 {paymentDay}일
              </p>
              <div className="flex gap-16 mt-4 justify-end">
                <div className="text-center">
                  <p>사업주</p>
                  <p className="mt-6">________________ (인)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
