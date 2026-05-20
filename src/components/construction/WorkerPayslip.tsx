/**
 * 노무임금명세서 (근로기준법 제48조)
 * - 노무대장 데이터 재구성 방식 (별도 계산 엔진 없음)
 */

import { useState } from "react";
import { DailyAttendanceRecord } from "@/hooks/useDailyAttendance";
import { supabase } from "@/integrations/supabase/client";

interface WeeklyHolidayMap {
  get: (key: string) => number | undefined;
}

interface Site {
  site_id: string;
  site_name: string;
}

interface PayslipProps {
  workerName: string;
  ssnMasked: string;
  phone?: string | null;
  jobType: string;
  firstWorkDate: string;
  year: number;
  month: number;
  lastDay: number;
  paymentDay: number;
  records: (DailyAttendanceRecord & { _workerKey: string })[];
  sites: Site[];
  weeklyHolidayMap: WeeklyHolidayMap;
  dpSettings: any;
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

export function WorkerPayslip({
  workerName,
  ssnMasked,
  phone,
  jobType,
  firstWorkDate,
  year,
  month,
  lastDay,
  paymentDay,
  records,
  sites,
  weeklyHolidayMap,
  dpSettings,
  onClose,
}: PayslipProps) {
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

  // 행별 계산
  const rows = records.map((r) => {
    const pb = extractPayBreakdown(r);
    const calcPay = r.calculated_pay != null ? Math.round(Number(r.calculated_pay)) : 0;
    const mealAmt = Number((r as any).meal_allowance_amount ?? 0);
    const vehicleAmt = Number((r as any).vehicle_allowance_amount ?? 0);
    const extraAmt = Number((r as any).extra_non_taxable_allowance_amount ?? 0);
    const rowWeekStart = getWeekStart(r.work_date);
    const rowWeeklyKey = `${r._workerKey}|${rowWeekStart}`;
    const weekRows = records.filter((x) => x._workerKey === r._workerKey && getWeekStart(x.work_date) === rowWeekStart);
    const lastScheduledRow = weekRows
      .filter((x) => new Date(x.work_date + "T00:00:00").getDay() === lastScheduledDayNum)
      .sort((a, b) => a.work_date.localeCompare(b.work_date))[0];
    const displayRow = lastScheduledRow ?? weekRows.sort((a, b) => b.work_date.localeCompare(a.work_date))[0];
    const weeklyHolidayPay = displayRow && displayRow.id === r.id ? Number(weeklyHolidayMap.get(rowWeeklyKey) ?? 0) : 0;
    const totalGross = calcPay + weeklyHolidayPay + mealAmt + vehicleAmt + extraAmt;
    const totalDeductions = Number((r as any).total_deductions ?? 0);
    const site = sites.find((s) => s.site_id === r.site_id);

    return {
      ...r,
      pb,
      mealAmt,
      vehicleAmt,
      extraAmt,
      weeklyHolidayPay,
      totalGross,
      totalDeductions,
      siteName: site?.site_name || "-",
      workMin: Number(r.work_minutes ?? 0),
    };
  });

  // 합계
  const totalDays = new Set(records.map((r) => r.work_date)).size;
  const totalWorkMin = rows.reduce((s, r) => s + r.workMin, 0);
  const totalRegularPay = rows.reduce((s, r) => s + (r.pb.regularPay ?? 0), 0);
  const totalOvertimePay = rows.reduce((s, r) => s + r.pb.overtimePay, 0);
  const totalNightPay = rows.reduce((s, r) => s + r.pb.nightPay, 0);
  const totalHolidayPay = rows.reduce((s, r) => s + r.pb.holidayPay, 0);
  const totalWeeklyHolidayPay = rows.reduce((s, r) => s + r.weeklyHolidayPay, 0);
  const totalMeal = rows.reduce((s, r) => s + r.mealAmt, 0);
  const totalVehicle = rows.reduce((s, r) => s + r.vehicleAmt, 0);
  const totalExtra = rows.reduce((s, r) => s + r.extraAmt, 0);
  const totalGross = rows.reduce((s, r) => s + r.totalGross, 0);
  const totalIncomeTax = rows.reduce((s, r) => s + Number((r as any).income_tax ?? 0), 0);
  const totalLocalTax = rows.reduce((s, r) => s + Number((r as any).local_income_tax ?? 0), 0);
  const totalEmployment = rows.reduce((s, r) => s + Number((r as any).employment_insurance ?? 0), 0);
  const totalPension = rows.reduce((s, r) => s + Number((r as any).national_pension ?? 0), 0);
  const totalHealth = rows.reduce((s, r) => s + Number((r as any).health_insurance ?? 0), 0);
  const totalLongTerm = rows.reduce((s, r) => s + Number((r as any).long_term_care_insurance ?? 0), 0);
    const totalDeductions = rows.reduce((s, r) => s + r.totalDeductions, 0);
  const totalNetPay = totalGross - totalDeductions;

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [isEmailSending, setIsEmailSending] = useState(false);

  const handleSendEmail = async () => {
    if (!emailAddress.trim()) {
      alert("이메일 주소를 입력해주세요.");
      return;
    }

    const content = document.getElementById("payslip-content");
    if (!content) {
      alert("임금명세서 본문을 찾을 수 없습니다.");
      return;
    }

    setIsEmailSending(true);

    try {
      const orgResult = await supabase.auth.getUser();

      if (!orgResult.data.user) {
        alert("로그인이 필요합니다.");
        return;
      }

      const { data: orgData } = await supabase
        .from("organization_members")
        .select("organization_id, organizations(name)")
        .eq("user_id", orgResult.data.user.id)
        .maybeSingle();

      const companyName = (orgData?.organizations as any)?.name || "급여관리시스템";
      const organizationId = orgData?.organization_id || "";

      if (!organizationId) {
        alert("조직 정보를 찾을 수 없습니다.");
        return;
      }

      const html = `
        <!DOCTYPE html>
        <html lang="ko">
          <head>
            <meta charset="UTF-8" />
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { font-family: 'Malgun Gothic', sans-serif; font-size: 12px; padding: 20px; color: #111827; }
              h1 { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 16px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; }
              th, td { border: 1px solid #555; padding: 4px 6px; }
              th { background-color: #e8e8e8; font-weight: bold; text-align: left; }
              .text-right { text-align: right; }
              .font-bold { font-weight: bold; }
              .bg-gray-50 { background-color: #f9fafb; }
              .bg-gray-100 { background-color: #f3f4f6; }
              .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
            </style>
          </head>
          <body>
            ${content.innerHTML}
          </body>
        </html>
      `;

      const { error } = await supabase.functions.invoke("send-document-email", {
        body: {
          organizationId,
          employeeName: workerName,
          employeeEmail: emailAddress.trim(),
          month: `${year}년 ${month}월`,
          companyName,
          html,
        },
      });

      if (error) {
        alert("이메일 발송에 실패했습니다: " + error.message);
      } else {
        alert(`${workerName}님께 임금명세서 이메일이 발송되었습니다.`);
        setEmailDialogOpen(false);
      }
    } catch (e: any) {
      alert("이메일 발송 오류: " + e.message);
    } finally {
      setIsEmailSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-white w-full max-w-4xl rounded-lg shadow-xl">
        {/* 버튼 영역 (인쇄 시 숨김) */}
        {/* 버튼 영역 (인쇄 시 숨김) */}
        <div className="flex justify-end gap-2 p-4 print:hidden">
                    <button
            onClick={() => setEmailDialogOpen(true)}
            className="px-4 py-2 bg-slate-700 text-white rounded text-sm hover:bg-slate-800"
          >
            이메일 발송
          </button>
          
          {/* 엑셀 저장 */}
          <button
            onClick={async () => {
              const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs" as any);
              const wb = XLSX.utils.book_new();

              // 시트1: 임금 요약
              const summaryData = [
                ["노무임금명세서"],
                ["성명", workerName, "주민번호", ssnMasked],
                ["직종", jobType, "연락처", phone || "-"],
                ["고용일", firstWorkDate ? firstWorkDate.replace(/-/g, ".") : "-", "지급기간", payPeriod],
                ["지급일", payDate, "근무일수", `${totalDays}일`],
                [],
                ["지급 내역", "금액"],
                ["기본급", totalRegularPay],
                ...(totalOvertimePay > 0 ? [["연장수당", totalOvertimePay]] : []),
                ...(totalNightPay > 0 ? [["야간수당", totalNightPay]] : []),
                ...(totalHolidayPay > 0 ? [["휴일수당", totalHolidayPay]] : []),
                ...(totalWeeklyHolidayPay > 0 ? [["주휴수당", totalWeeklyHolidayPay]] : []),
                ...(totalMeal > 0 ? [["식대", totalMeal]] : []),
                ...(totalVehicle > 0 ? [["차량운전보조금", totalVehicle]] : []),
                ...(totalExtra > 0 ? [[dpSettings.extra_non_taxable_name || "기타비과세", totalExtra]] : []),
                ["지급합계", totalGross],
                [],
                ["공제 내역", "금액"],
                ...(totalIncomeTax > 0 ? [["소득세", totalIncomeTax]] : []),
                ...(totalLocalTax > 0 ? [["지방소득세", totalLocalTax]] : []),
                ...(totalEmployment > 0 ? [["고용보험", totalEmployment]] : []),
                ...(totalPension > 0 ? [["국민연금", totalPension]] : []),
                ...(totalHealth > 0 ? [["건강보험", totalHealth]] : []),
                ...(totalLongTerm > 0 ? [["장기요양보험", totalLongTerm]] : []),
                ["공제합계", totalDeductions],
                [],
                ["실수령액", totalNetPay],
              ];
              const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
              XLSX.utils.book_append_sheet(wb, ws1, "임금요약");

              // 시트2: 일별 상세
              const detailHeaders = [
                "날짜",
                "현장",
                "근무시간(h)",
                "기본급",
                "연장수당",
                "야간수당",
                "휴일수당",
                "주휴수당",
              ];
              if (dpSettings.enable_meal_allowance) detailHeaders.push("식대");
              if (dpSettings.enable_vehicle_allowance) detailHeaders.push("차량운전보조금");
              if (dpSettings.enable_extra_non_taxable)
                detailHeaders.push(dpSettings.extra_non_taxable_name || "기타비과세");
              detailHeaders.push("지급액", "공제액", "실수령액");

              const detailRows = rows.map((r) => {
                const row: any[] = [
                  r.work_date.replace(/-/g, "."),
                  r.siteName,
                  Math.round((r.workMin / 60) * 10) / 10,
                  r.pb.regularPay ?? 0,
                  r.pb.overtimePay ?? 0,
                  r.pb.nightPay ?? 0,
                  r.pb.holidayPay ?? 0,
                  r.weeklyHolidayPay,
                ];
                if (dpSettings.enable_meal_allowance) row.push(r.mealAmt);
                if (dpSettings.enable_vehicle_allowance) row.push(r.vehicleAmt);
                if (dpSettings.enable_extra_non_taxable) row.push(r.extraAmt);
                row.push(r.totalGross, r.totalDeductions, r.totalGross - r.totalDeductions);
                return row;
              });
              const ws2 = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
              XLSX.utils.book_append_sheet(wb, ws2, "일별상세");

              const fileName = `임금명세서_${workerName}_${year}년${mm}월.xlsx`;
              XLSX.writeFile(wb, fileName);
            }}
            className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
          >
            엑셀 저장
          </button>

          {/* PDF 저장 */}
          <button
            onClick={() => {
              const printWindow = window.open("", "_blank", "width=1000,height=800");
              if (!printWindow) return;
              const content = document.getElementById("payslip-content");
              if (!content) return;
              printWindow.document.write(`
                <!DOCTYPE html>
                <html lang="ko">
                <head>
                  <meta charset="UTF-8" />
                  <title>노무임금명세서</title>
                  <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: 'Malgun Gothic', sans-serif; font-size: 11px; padding: 20px; }
                    h1 { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 4px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
                    th, td { border: 1px solid #555; padding: 3px 6px; }
                    th { background-color: #e8e8e8; font-weight: bold; }
                    .text-right { text-align: right; }
                    .font-bold { font-weight: bold; }
                    @media print { body { padding: 10px; } @page { size: A4 portrait; margin: 10mm; } }
                  </style>
                </head>
                <body>
                  ${content.innerHTML}
                  <script>window.onload=function(){window.print();};<\/script>
                </body>
                </html>
              `);
              printWindow.document.close();
            }}
            className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            PDF 저장
          </button>

          {/* 인쇄 */}
          <button
            onClick={() => {
              const printWindow = window.open("", "_blank", "width=1000,height=800");
              if (!printWindow) return;
              const content = document.getElementById("payslip-content");
              if (!content) return;
              printWindow.document.write(`
                <!DOCTYPE html>
                <html lang="ko">
                <head>
                  <meta charset="UTF-8" />
                  <title>임금명세서</title>
                  <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: 'Malgun Gothic', sans-serif; font-size: 12px; padding: 20px; }
                    h1 { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 16px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; }
                    th, td { border: 1px solid #555; padding: 4px 6px; }
                    th { background-color: #e8e8e8; font-weight: bold; text-align: left; }
                    .text-right { text-align: right; }
                    .font-bold { font-weight: bold; }
                    .bg-gray { background-color: #f5f5f5; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
                    .sign { text-align: right; margin-top: 30px; font-size: 11px; }
                    .sign p { margin-bottom: 6px; }
                    @media print {
                      body { padding: 10px; }
                      @page { size: A4; margin: 10mm; }
                    }
                  </style>
                </head>
                <body>
                  ${content.innerHTML}
                </body>
                </html>
              `);
              printWindow.document.close();
              printWindow.focus();
              setTimeout(() => {
                printWindow.print();
              }, 500);
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm"
          >
            인쇄
          </button>
          <button onClick={onClose} className="px-4 py-2 border rounded text-sm">
            닫기
          </button>
        </div>

        {/* 명세서 본문 */}
        <div className="px-8 pb-8" id="payslip-content">
          {/* 제목 */}
          <h1 className="text-center text-xl font-bold mb-6">임 금 명 세 서</h1>

          {/* 근로자 정보 */}
          <table className="w-full border-collapse mb-4 text-sm">
            <tbody>
              <tr>
                <td className="border border-gray-400 bg-gray-100 px-3 py-1.5 font-medium w-24">성명</td>
                <td className="border border-gray-400 px-3 py-1.5 w-40">{workerName}</td>
                <td className="border border-gray-400 bg-gray-100 px-3 py-1.5 font-medium w-24">주민번호</td>
                <td className="border border-gray-400 px-3 py-1.5">{ssnMasked || "-"}</td>
                <td className="border border-gray-400 bg-gray-100 px-3 py-1.5 font-medium w-24">직종</td>
                <td className="border border-gray-400 px-3 py-1.5">{jobType}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-100 px-3 py-1.5 font-medium">연락처</td>
                <td className="border border-gray-400 px-3 py-1.5">
                  {phone ? phone.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3") : "-"}
                </td>
                <td className="border border-gray-400 bg-gray-100 px-3 py-1.5 font-medium">고용일</td>
                <td className="border border-gray-400 px-3 py-1.5">
                  {firstWorkDate ? formatDate(firstWorkDate) : "-"}
                </td>
                <td className="border border-gray-400 bg-gray-100 px-3 py-1.5 font-medium">지급기간</td>
                <td className="border border-gray-400 px-3 py-1.5">{payPeriod}</td>
              </tr>

              <tr>
                <td className="border border-gray-400 bg-gray-100 px-3 py-1.5 font-medium">지급일</td>
                <td className="border border-gray-400 px-3 py-1.5">{payDate}</td>
                <td className="border border-gray-400 bg-gray-100 px-3 py-1.5 font-medium">근무일수</td>
                <td className="border border-gray-400 px-3 py-1.5">{totalDays}일</td>
                <td className="border border-gray-400 bg-gray-100 px-3 py-1.5 font-medium">총근무시간</td>
                <td className="border border-gray-400 px-3 py-1.5">
                  {Math.round((totalWorkMin / 60) * 10) / 10}h &nbsp;/&nbsp;
                  {Math.round(
                    (rows.reduce((s, r) => {
                      const wh = (r as any).work_hours != null ? Number((r as any).work_hours) : r.workMin / 60;
                      return s + wh;
                    }, 0) /
                      8) *
                      100,
                  ) / 100}
                  공수
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-100 px-3 py-1.5 font-medium">실수령액</td>
                <td className="border border-gray-400 px-3 py-1.5 font-bold text-right" colSpan={5}>
                  {formatCurrency(totalNetPay)}원
                </td>
              </tr>
            </tbody>
          </table>

          {/* 지급/공제 요약 */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* 지급 내역 */}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-gray-400 bg-gray-100 px-3 py-1.5 text-left" colSpan={2}>
                    지급 내역
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-400 px-3 py-1">기본급</td>
                  <td className="border border-gray-400 px-3 py-1 text-right">{formatCurrency(totalRegularPay)}</td>
                </tr>
                {totalOvertimePay > 0 && (
                  <tr>
                    <td className="border border-gray-400 px-3 py-1">연장수당</td>
                    <td className="border border-gray-400 px-3 py-1 text-right">{formatCurrency(totalOvertimePay)}</td>
                  </tr>
                )}
                {totalNightPay > 0 && (
                  <tr>
                    <td className="border border-gray-400 px-3 py-1">야간수당</td>
                    <td className="border border-gray-400 px-3 py-1 text-right">{formatCurrency(totalNightPay)}</td>
                  </tr>
                )}
                {totalHolidayPay > 0 && (
                  <tr>
                    <td className="border border-gray-400 px-3 py-1">휴일수당</td>
                    <td className="border border-gray-400 px-3 py-1 text-right">{formatCurrency(totalHolidayPay)}</td>
                  </tr>
                )}
                {totalWeeklyHolidayPay > 0 && (
                  <tr>
                    <td className="border border-gray-400 px-3 py-1">주휴수당</td>
                    <td className="border border-gray-400 px-3 py-1 text-right">
                      {formatCurrency(totalWeeklyHolidayPay)}
                    </td>
                  </tr>
                )}
                {totalMeal > 0 && (
                  <tr>
                    <td className="border border-gray-400 px-3 py-1">식대</td>
                    <td className="border border-gray-400 px-3 py-1 text-right">{formatCurrency(totalMeal)}</td>
                  </tr>
                )}
                {totalVehicle > 0 && (
                  <tr>
                    <td className="border border-gray-400 px-3 py-1">차량운전보조금</td>
                    <td className="border border-gray-400 px-3 py-1 text-right">{formatCurrency(totalVehicle)}</td>
                  </tr>
                )}
                {totalExtra > 0 && (
                  <tr>
                    <td className="border border-gray-400 px-3 py-1">
                      {dpSettings.extra_non_taxable_name || "기타수당"}
                    </td>
                    <td className="border border-gray-400 px-3 py-1 text-right">{formatCurrency(totalExtra)}</td>
                  </tr>
                )}
                <tr className="font-bold bg-gray-50">
                  <td className="border border-gray-400 px-3 py-1.5">지급합계</td>
                  <td className="border border-gray-400 px-3 py-1.5 text-right">{formatCurrency(totalGross)}</td>
                </tr>
              </tbody>
            </table>

            {/* 공제 내역 */}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-gray-400 bg-gray-100 px-3 py-1.5 text-left" colSpan={2}>
                    공제 내역
                  </th>
                </tr>
              </thead>
              <tbody>
                {totalIncomeTax > 0 && (
                  <tr>
                    <td className="border border-gray-400 px-3 py-1">소득세</td>
                    <td className="border border-gray-400 px-3 py-1 text-right">{formatCurrency(totalIncomeTax)}</td>
                  </tr>
                )}
                {totalLocalTax > 0 && (
                  <tr>
                    <td className="border border-gray-400 px-3 py-1">지방소득세</td>
                    <td className="border border-gray-400 px-3 py-1 text-right">{formatCurrency(totalLocalTax)}</td>
                  </tr>
                )}
                {totalEmployment > 0 && (
                  <tr>
                    <td className="border border-gray-400 px-3 py-1">고용보험</td>
                    <td className="border border-gray-400 px-3 py-1 text-right">{formatCurrency(totalEmployment)}</td>
                  </tr>
                )}
                {totalPension > 0 && (
                  <tr>
                    <td className="border border-gray-400 px-3 py-1">국민연금</td>
                    <td className="border border-gray-400 px-3 py-1 text-right">{formatCurrency(totalPension)}</td>
                  </tr>
                )}
                {totalHealth > 0 && (
                  <tr>
                    <td className="border border-gray-400 px-3 py-1">건강보험</td>
                    <td className="border border-gray-400 px-3 py-1 text-right">{formatCurrency(totalHealth)}</td>
                  </tr>
                )}
                {totalLongTerm > 0 && (
                  <tr>
                    <td className="border border-gray-400 px-3 py-1">장기요양보험</td>
                    <td className="border border-gray-400 px-3 py-1 text-right">{formatCurrency(totalLongTerm)}</td>
                  </tr>
                )}
                <tr className="font-bold bg-gray-50">
                  <td className="border border-gray-400 px-3 py-1.5">공제합계</td>
                  <td className="border border-gray-400 px-3 py-1.5 text-right">{formatCurrency(totalDeductions)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 일별 상세 내역 */}
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-400 px-2 py-1.5">날짜</th>
                <th className="border border-gray-400 px-2 py-1.5">현장</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">근무시간</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">공수</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">기본급</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">연장</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">야간</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">휴일</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">주휴</th>
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
                <th className="border border-gray-400 px-2 py-1.5 text-right">지급액</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">공제액</th>
                <th className="border border-gray-400 px-2 py-1.5 text-right">실수령</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="border border-gray-400 px-2 py-1">{formatDate(r.work_date)}</td>
                  <td className="border border-gray-400 px-2 py-1">{r.siteName}</td>
                  <td className="border border-gray-400 px-2 py-1 text-right">
                    {Math.round((r.workMin / 60) * 10) / 10}h
                  </td>
                  <td className="border border-gray-400 px-2 py-1 text-right">
                    {(() => {
                      const wh = (r as any).work_hours != null ? Number((r as any).work_hours) : r.workMin / 60;
                      return wh > 0 ? `${Math.round((wh / 8) * 100) / 100}공수` : "-";
                    })()}
                  </td>
                  <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(r.pb.regularPay)}</td>
                  <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(r.pb.overtimePay)}</td>
                  <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(r.pb.nightPay)}</td>
                  <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(r.pb.holidayPay)}</td>
                  <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(r.weeklyHolidayPay)}</td>
                  {dpSettings.enable_meal_allowance && (
                    <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(r.mealAmt)}</td>
                  )}
                  {dpSettings.enable_vehicle_allowance && (
                    <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(r.vehicleAmt)}</td>
                  )}
                  {dpSettings.enable_extra_non_taxable && (
                    <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(r.extraAmt)}</td>
                  )}
                  <td className="border border-gray-400 px-2 py-1 text-right font-medium">
                    {formatCurrency(r.totalGross)}
                  </td>
                  <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(r.totalDeductions)}</td>
                  <td className="border border-gray-400 px-2 py-1 text-right font-medium">
                    {formatCurrency(r.totalGross - r.totalDeductions)}
                  </td>
                </tr>
              ))}
              {/* 합계행 */}
              <tr className="font-bold bg-gray-50">
                <td className="border border-gray-400 px-2 py-1.5" colSpan={2}>
                  합계
                </td>
                <td className="border border-gray-400 px-2 py-1.5 text-right">
                  {Math.round((totalWorkMin / 60) * 10) / 10}h
                </td>
                <td className="border border-gray-400 px-2 py-1.5 text-right">
                  {Math.round(
                    (rows.reduce((s, r) => {
                      const wh = (r as any).work_hours != null ? Number((r as any).work_hours) : r.workMin / 60;
                      return s + wh;
                    }, 0) /
                      8) *
                      100,
                  ) / 100}
                  공수
                </td>
                <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totalRegularPay)}</td>
                <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totalOvertimePay)}</td>
                <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totalNightPay)}</td>
                <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totalHolidayPay)}</td>
                <td className="border border-gray-400 px-2 py-1.5 text-right">
                  {formatCurrency(totalWeeklyHolidayPay)}
                </td>
                {dpSettings.enable_meal_allowance && (
                  <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totalMeal)}</td>
                )}
                {dpSettings.enable_vehicle_allowance && (
                  <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totalVehicle)}</td>
                )}
                {dpSettings.enable_extra_non_taxable && (
                  <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totalExtra)}</td>
                )}
                <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totalGross)}</td>
                <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totalDeductions)}</td>
                <td className="border border-gray-400 px-2 py-1.5 text-right">{formatCurrency(totalNetPay)}</td>
              </tr>
            </tbody>
          </table>

          {/* 서명란 */}
          <div className="flex justify-end mt-6 text-sm">
            <div className="text-center">
              <p className="mb-8">위와 같이 임금을 지급합니다.</p>
              <p>
                {year}년 {month}월 {paymentDay}일
              </p>
              <div className="flex gap-16 mt-4 justify-end">
                <div className="text-center">
                  <p>사업주</p>
                  <p className="mt-6">________________ (인)</p>
                </div>
                <div className="text-center">
                  <p>근로자 확인</p>
                  <p className="mt-6">________________ (인)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
           {/* 이메일 발송 다이얼로그 */}
        {emailDialogOpen && (
          <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">임금명세서 이메일 발송</h2>
                <button onClick={() => setEmailDialogOpen(false)} className="text-gray-500 hover:text-gray-800">
                  ×
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">받는 사람</label>
                  <input
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="이메일 주소 입력"
                    className="mt-1 w-full border rounded px-3 py-2 text-sm"
                  />
                </div>

                <p className="text-sm text-gray-500">
                  {workerName}님의 {year}년 {month}월 임금명세서를 발송합니다.
                </p>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setEmailDialogOpen(false)}
                    className="px-4 py-2 border rounded text-sm"
                    disabled={isEmailSending}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSendEmail}
                    disabled={isEmailSending}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-60"
                  >
                    {isEmailSending ? "발송 중..." : "발송"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
