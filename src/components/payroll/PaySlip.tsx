import { useState } from "react";
import DOMPurify from "dompurify";
import html2pdf from "html2pdf.js";
import { PayrollRecord, Employee } from "@/types/employee";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Printer, ChevronLeft, ChevronRight, Mail, Loader2, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEmployeeStore } from "@/store/employeeStore";
import { usePayrollSettingsStore } from "@/store/payrollSettingsStore";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { useProductionTaxExempt } from "@/hooks/useProductionTaxExempt";
import { ANNUAL_EXEMPT_LIMIT } from "@/utils/productionTaxExemption";

const formatMinutesToTime = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}시간 ${String(m).padStart(2, "0")}분`;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(amount);

interface PaySlipProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: PayrollRecord | null;
  employee: Employee | null;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

export function PaySlip({
  open,
  onOpenChange,
  record,
  employee,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: PaySlipProps) {
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState(employee?.email || "");
  const [isSending, setIsSending] = useState(false);
  const companySettings = useEmployeeStore((state) => state.companySettings);
  const { paymentItems, deductionItems } = usePayrollSettingsStore();
  const { settings: orgSettings } = useOrganizationSettings();

  // 생산직 비과세 연간 누적 데이터
  const recordYear = record ? parseInt(record.month.split("-")[0]) : new Date().getFullYear();
  const recordMonth = record ? parseInt(record.month.split("-")[1]) : new Date().getMonth() + 1;
  const { getYearlyExempt, getAccumulatedExempt } = useProductionTaxExempt(recordYear);
  const yearlyExempt = record && employee?.jobCategory === "production" ? getYearlyExempt(record.employeeId) : null;
  const accumulatedBeforeThisMonth =
    record && employee?.jobCategory === "production" ? getAccumulatedExempt(record.employeeId, recordMonth) : 0;

  // 활성화된 항목만 필터링 (fallback용)
  const activePaymentItems = paymentItems.filter((item) => item.isActive);
  const activeDeductionItems = deductionItems.filter((item) => item.isActive);

  if (!record || !employee) return null;

  const fmtNum = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

  // 적용 시급 계산
  const standardWorkHours = orgSettings.standard_work_hours || 8;
  const appliedHourlyRate = (() => {
    if (employee.payType === "monthly") return 0; // 월급제는 시급 해당 없음
    if (employee.payType === "hourly" && employee.hourlyRate) return employee.hourlyRate;
    if (employee.payType === "daily" && employee.dailyRate) return Math.round(employee.dailyRate / standardWorkHours);
    return 0;
  })();
  const appliedHourlyRateText =
    employee.payType === "monthly"
      ? "해당 없음"
      : appliedHourlyRate > 0
        ? `${fmtNum(appliedHourlyRate)}원`
        : "해당 없음";

  const overtimeRate = orgSettings.overtime_multiplier || 1.5;
  const nightRate = orgSettings.night_shift_multiplier || 2.0;
  const overtimeHours = (record.overtimeMinutes || 0) / 60;
  const nightHours = ((record.nightWorkMinutes || 0) + (record.nightShiftMinutes || 0)) / 60;
  // 저장된 지급 항목 직접 사용 (야간근로수당 등 동적 항목 포함)
  const displayPaymentItems: { itemId: string; name: string; amount: number }[] =
    record.paymentItems && record.paymentItems.length > 0
      ? (record.paymentItems as any[])
      : activePaymentItems.map((item) => {
          let amount = 0;
          if (item.id === "base-salary") amount = record.baseSalary;
          else if (item.id === "overtime") amount = record.overtime;
          else if (item.id === "bonus") amount = record.bonus;
          return { itemId: item.id, name: item.name, amount };
        });

  // 공제항목 표준 순서
  const DEDUCTION_ORDER = [
    "income-tax",
    "local-income-tax",
    "national-pension",
    "health-insurance",
    "employment-insurance",
    "long-term-care",
  ];
  const sortDeductions = (items: { itemId: string; name: string; amount: number }[]) => {
    return [...items].sort((a, b) => {
      const ai = DEDUCTION_ORDER.indexOf(a.itemId);
      const bi = DEDUCTION_ORDER.indexOf(b.itemId);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  };

  const totalPayments = displayPaymentItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const sortedDeductionItems = record.deductionItems ? sortDeductions(record.deductionItems as any[]) : null;
  const totalDeductions = sortedDeductionItems
    ? sortedDeductionItems.reduce((sum, item) => sum + item.amount, 0)
    : record.deductions;

  // 계산방법 생성 함수
  const getPaymentFormula = (item: { itemId: string; name: string; amount: number }): string => {
    // 월급제는 모든 지급항목에 '월정액 지급' 표시
    if (employee.payType === "monthly") return "월정액 지급";

    if (item.itemId === "base-salary") {
      if (employee.payType === "daily")
        return employee.dailyRate
          ? `${fmtNum(employee.dailyRate)}원 × ${record.presentDays + record.lateDays}일`
          : "해당 없음";
      if (employee.payType === "hourly")
        return employee.hourlyRate
          ? `${fmtNum(employee.hourlyRate)}원 × ${((record.totalWorkMinutes || 0) / 60).toFixed(1)}시간`
          : "해당 없음";
    } else if (item.itemId === "overtime") {
      if (appliedHourlyRate > 0 && overtimeHours > 0)
        return `${fmtNum(appliedHourlyRate)}원 × ${overtimeRate} × ${overtimeHours.toFixed(1)}시간`;
      return "해당 없음";
    } else if (
      item.itemId === "night-shift-allowance" ||
      (item.name.includes("야간") && !item.itemId?.startsWith("night-shift-tier"))
    ) {
      const nightAlpha = (orgSettings.night_shift_multiplier || 2.0) - 1.0; // 가산분 (예: 0.5)
      const nightWorkHours = (record.nightWorkMinutes || 0) / 60; // 주간조 야간시간만
      if (appliedHourlyRate > 0 && nightWorkHours > 0)
        return `${fmtNum(appliedHourlyRate)}원 × ${nightAlpha.toFixed(1)}가산 × ${nightWorkHours.toFixed(1)}시간`;
      return "해당 없음";
    } else if (item.itemId?.startsWith("night-shift-tier") || item.itemId?.startsWith("hol-shift-tier")) {
      const tierMinutes = (item as any).shiftTierMinutes || 0;
      const tierMultiplier = (item as any).shiftTierMultiplier || 1.5;
      const alphaRate = tierMultiplier - 1.0;
      if (appliedHourlyRate > 0 && tierMinutes > 0)
        return `${fmtNum(appliedHourlyRate)}원 × ${alphaRate.toFixed(1)} × ${(tierMinutes / 60).toFixed(1)}시간`;
      return "해당 없음";
    } else if (item.itemId === "holiday-work-allowance" || item.name.includes("휴일근로")) {
      if (appliedHourlyRate > 0 && item.amount > 0) {
        const hol8h = (item as any).holidayWork8hMinutes || 0;
        const holOver8h = (item as any).holidayWorkOver8hMinutes || 0;
        const holNight = (item as any).holidayNightMinutes || 0;
        const holidayAlpha8h = orgSettings.holiday_alpha_8h || 0.5;
        const lines: string[] = [];
        if (hol8h > 0) {
          const h = (hol8h / 60).toFixed(1);
          lines.push(`8h이내: ${fmtNum(appliedHourlyRate)}원 × ${1.0 + holidayAlpha8h}배 × ${h}시간`);
        }
        // 8h초과 중 비야간 부분 (holOver8h는 이미 nonNightMin에서 산출되므로 night 차감 불필요)
        if (holOver8h > 0) {
          const h = (holOver8h / 60).toFixed(1);
          lines.push(
            `8h초과: ${fmtNum(appliedHourlyRate)}원 × ${1.0 + (orgSettings.holiday_alpha_ot || 1.0)}배 × ${h}시간`,
          );
        }
        if (holNight > 0) {
          const nightRate = orgSettings.night_shift_multiplier || 2.0;
          const compositeRate = 1.0 + (orgSettings.holiday_alpha_ot || 1.0) + 0.5;
          const h = (holNight / 60).toFixed(1);
          lines.push(`야간포함: ${fmtNum(appliedHourlyRate)}원 × ${compositeRate}배 × ${h}시간`);
        }
        return lines.length > 0 ? lines.join(" / ") : "해당 없음";
      }
      return "해당 없음";
    } else if (item.itemId === "weekly-holiday-allowance" || item.name.includes("주휴")) {
      if (appliedHourlyRate > 0 && item.amount > 0) {
        const hours = item.amount / appliedHourlyRate;
        return `${fmtNum(appliedHourlyRate)}원 × ${hours.toFixed(1)}시간`;
      }
      return "해당 없음";
    } else if (item.itemId === "public-holiday-pay" || item.name.includes("공휴일 유급")) {
      if (appliedHourlyRate > 0 && item.amount > 0) {
        const hours = item.amount / appliedHourlyRate;
        return `${fmtNum(appliedHourlyRate)}원 × ${hours.toFixed(1)}시간`;
      }
      return "해당 없음";
    } else if (item.itemId === "public-holiday-work-pay" || item.name.includes("공휴일 근로")) {
      if (appliedHourlyRate > 0 && item.amount > 0) {
        const hours = item.amount / (appliedHourlyRate * 0.5);
        return `${fmtNum(appliedHourlyRate)}원 × 0.5 × ${hours.toFixed(1)}시간`;
      }
      return "해당 없음";
    } else {
      const si = paymentItems.find((pi) => pi.id === item.itemId);
      if (si?.calculationType === "percentage" && si.defaultValue) return `기본급 × ${si.defaultValue}%`;
      return "월정액 지급";
    }
    return "해당 없음";
  };

  // ── 공제 계산방법 표시용 기준값 분리 ──
  // exemptLimit 기반 비과세 항목 자동 계산
  const staticExemptDisplay = displayPaymentItems.reduce((sum, item) => {
    const payrollItem = paymentItems.find((p) => p.id === item.itemId);
    if (payrollItem?.exemptLimit && item.amount > 0) {
      return sum + Math.min(item.amount, payrollItem.exemptLimit);
    }
    return sum;
  }, 0);

  // 생산직 비과세
  const thisMonthExemptForCalc = (() => {
    if (employee?.jobCategory !== "production" || !yearlyExempt) return 0;
    const rec = yearlyExempt.monthlyBreakdown.find((r) => r.month === recordMonth);
    return rec?.exemptAmount ?? 0;
  })();

  // 소득세 기준: 생산직비과세 + 모든 비과세한도 항목 제외
  const taxBase = Math.max(0, totalPayments - thisMonthExemptForCalc - staticExemptDisplay);

  // 4대보험 기준: 비과세 제외 안 함 (법적 기준)
  const insuranceBase = totalPayments;

  const getDeductionFormula = (item: { itemId: string; name: string; amount: number }): string => {
    const si = deductionItems.find((di) => di.id === item.itemId);
    // 4대보험: insuranceBase 기준 (비과세 제외 안 함)
    if (item.itemId === "national-pension") return `${fmtNum(insuranceBase)}원 × ${si?.defaultValue ?? 4.5}%`;
    if (item.itemId === "health-insurance") return `${fmtNum(insuranceBase)}원 × ${si?.defaultValue ?? 3.545}%`;
    if (item.itemId === "employment-insurance") return `${fmtNum(insuranceBase)}원 × ${si?.defaultValue ?? 0.9}%`;
    if (item.itemId === "long-term-care") return `건강보험료 × ${si?.defaultValue ?? 12.81}%`;
    // 소득세: taxBase 기준 (모든 비과세 제외)
    if (item.itemId === "income-tax") return `${fmtNum(taxBase)}원 기준 간이세액표 적용`;
    if (item.itemId === "local-income-tax" || item.name.includes("지방소득세")) return "소득세 × 10%";
    if (si?.calculationType === "percentage" && si.defaultValue)
      return `${fmtNum(insuranceBase)}원 × ${si.defaultValue}%`;
    return item.amount > 0 ? "월정액 공제" : "해당 없음";
  };

  const generatePaymentItemsHtml = () => {
    return displayPaymentItems
      .filter((item) => item.amount !== 0 || item.itemId === "base-salary")
      .map((item) => {
        const isBase = item.itemId === "base-salary";
        const sanitizedName = DOMPurify.sanitize(item.name);
        return `
          <tr>
            <td>${sanitizedName}${isBase && employee?.payType === "monthly" ? ' <span style="font-size:8px;color:#888;">(주휴수당 포함)</span>' : ""}</td>
            <td class="${isBase ? "" : "text-green"}">${isBase ? "" : "+"}${formatCurrency(item.amount)}</td>
          </tr>
        `;
      })
      .join("");
  };

  // 공제 항목 HTML 생성 (sanitized)
  const generateDeductionItemsHtml = () => {
    if (sortedDeductionItems && sortedDeductionItems.length > 0) {
      return sortedDeductionItems
        .map((item) => {
          const sanitizedName = DOMPurify.sanitize(item.name);
          const isRefund = item.amount < 0;
          return `
          <tr>
            <td>${sanitizedName}</td>
            <td class="${isRefund ? "text-green" : "text-red"}">${isRefund ? "+" : "-"}${formatCurrency(Math.abs(item.amount))}</td>
          </tr>
        `;
        })
        .join("");
    }
    return `
      <tr>
        <td>4대보험 및 기타공제</td>
        <td class="text-red">-${formatCurrency(record.deductions)}</td>
      </tr>
    `;
  };

  const generatePrintHtml = () => {
    const sanitizedCompanyName = DOMPurify.sanitize(companySettings.companyName || "회사명");
    const sanitizedEmployeeName = DOMPurify.sanitize(record.employeeName);
    const sanitizedMonth = DOMPurify.sanitize(record.month);
    const sanitizedEmployeeNumber = DOMPurify.sanitize(record.employeeNumber);
    const sanitizedDepartment = DOMPurify.sanitize(record.department);
    const sanitizedPosition = DOMPurify.sanitize(employee.position || "-");
    const jobCategoryLabel = employee.jobCategory === "production" ? "생산직" : "사무직";

    // 생년월일: 주민등록번호 앞 6자리에서 추출
    const birthDate = (() => {
      const rn = employee.residentNumber;
      if (!rn) return "-";
      const digits = rn.replace(/[^0-9]/g, "");
      if (digits.length < 6) return "-";
      const yy = digits.substring(0, 2);
      const mm = digits.substring(2, 4);
      const dd = digits.substring(4, 6);
      const centuryDigit = digits.length >= 7 ? digits[6] : "";
      const century = centuryDigit === "3" || centuryDigit === "4" ? "20" : "19";
      return `${century}${yy}.${mm}.${dd}`;
    })();

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>급여명세서 - ${sanitizedEmployeeName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            @page { size: A4; margin: 8mm; }
            body { 
  font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; 
  padding: 6px; max-width: 100%; margin: 0 auto; 
  background: #fff; color: #333; line-height: 1.2; font-size: 10px;
}
.header { text-align: center; margin-bottom: 5px; padding-bottom: 4px; border-bottom: 2px solid #2563eb; }
.company-name { font-size: 10px; color: #666; margin-bottom: 1px; }
.title { font-size: 15px; font-weight: bold; color: #1e40af; margin-bottom: 1px; }
.month { font-size: 10px; color: #666; background: #f1f5f9; display: inline-block; padding: 1px 8px; border-radius: 8px; }
.content-wrapper { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.section { margin-bottom: 3px; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; }
.section-header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 3px 6px; font-weight: bold; font-size: 10px; }
.section-header.payment { background: linear-gradient(135deg, #10b981, #059669); }
.section-header.deduction { background: linear-gradient(135deg, #ef4444, #dc2626); }
table { width: 100%; border-collapse: collapse; }
td { padding: 2px 5px; border-bottom: 1px solid #f1f5f9; font-size: 9.5px; }
td:first-child { color: #64748b; width: 50%; }
td:last-child { text-align: right; font-weight: 600; color: #1e293b; }
.calc-table td:last-child { text-align: left; font-weight: normal; color: #555; }
.calc-table td.formula { text-align: left !important; color: #555 !important; font-size: 8.5px; white-space: normal !important; overflow: hidden; word-break: keep-all; line-height: 1.5; font-weight: normal !important; }
tr:last-child td { border-bottom: none; }
.text-green { color: #059669; }
.text-red { color: #dc2626; }
.total-row { background: #f8fafc; font-weight: bold; }
.total-row td:first-child { color: #1e293b; }
.net-salary { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; border-radius: 4px; padding: 6px; text-align: center; margin-top: 4px; }
.net-salary-label { font-size: 10px; opacity: 0.9; margin-bottom: 1px; }
.net-salary-amount { font-size: 16px; font-weight: bold; }
.footer { text-align: center; color: #94a3b8; font-size: 8px; padding: 6px 4px 8px 4px; border-top: 1px solid #e2e8f0; margin-top: 4px; }
.full-width { grid-column: 1 / -1; }
.calc-section { border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; margin-bottom: 3px; }
.calc-section .section-header { background: linear-gradient(135deg, #6366f1, #4f46e5); }
.calc-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.calc-table td { padding: 3px 4px; font-size: 9px; border-bottom: 1px solid #f1f5f9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.5; }
.calc-table .cat-row td { text-align: center; font-weight: bold; font-size: 9px; }
.calc-table .head-row { background: #fafafa; font-weight: bold; }
.calc-table td.formula { text-align: left !important; color: #555; font-size: 7.5px; white-space: normal !important; overflow: hidden; word-break: keep-all; line-height: 1.3; }
@media print {
  body { padding: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .section, .calc-section { break-inside: avoid; page-break-inside: avoid; }
}
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">${sanitizedCompanyName}</div>
            <div class="title">급 여 명 세 서</div>
            <div class="month">${sanitizedMonth}</div>
          </div>
          <div class="content-wrapper">
  <div class="section full-width" style="margin-bottom:3px;">
  <div class="section-header">📋 직원 정보 / 근태 / 근로시간</div>
  <table style="width:100%;table-layout:fixed;">
    <colgroup>
      <col style="width:10%;"/><col style="width:18%;"/>
      <col style="width:10%;"/><col style="width:22%;"/>
      <col style="width:13%;"/><col style="width:27%;"/>
    </colgroup>
    <tr>
      <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">성명</td>
      <td style="border-right:1px solid #e2e8f0;overflow:hidden;text-overflow:ellipsis;">${sanitizedEmployeeName}</td>
      <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">사번/직종</td>
      <td style="border-right:1px solid #e2e8f0;overflow:hidden;text-overflow:ellipsis;">${sanitizedEmployeeNumber} / ${jobCategoryLabel}</td>
      <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">출근일수</td>
      <td style="white-space:nowrap;">${record.presentDays + record.lateDays}일 (지각 ${record.lateDays}일)</td>
    </tr>
    <tr>
      <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">입사일</td>
      <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">${DOMPurify.sanitize(employee.hireDate || "-")}</td>
      <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">고용/급여</td>
      <td style="border-right:1px solid #e2e8f0;overflow:hidden;text-overflow:ellipsis;">${employee.employmentType === "regular" ? "정규직" : employee.employmentType === "contract" ? "계약직" : employee.employmentType === "daily" ? "일용직" : "프리랜서"} / ${employee.payType === "daily" ? "일급제" : employee.payType === "hourly" ? "시급제" : "월급제"}</td>
      <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">결근/휴가</td>
      <td style="white-space:nowrap;">${record.absentDays}일 / ${record.leaveDays}일</td>
    </tr>
    <tr>
      <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">시급</td>
      <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">${appliedHourlyRateText}</td>
      <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">부서/직급</td>
      <td style="border-right:1px solid #e2e8f0;overflow:hidden;text-overflow:ellipsis;">${sanitizedDepartment} / ${sanitizedPosition}</td>
      <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">총/정규</td>
      <td style="white-space:nowrap;">${formatMinutesToTime(record.totalWorkMinutes || 0)} / ${formatMinutesToTime(record.regularWorkMinutes || 0)}</td>
    </tr>
    <tr>
      <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">급여계좌</td>
      <td colspan="3" style="border-right:1px solid #e2e8f0;overflow:hidden;text-overflow:ellipsis;">${DOMPurify.sanitize(employee.bankName ? `${employee.bankName} ${employee.accountNumber || ""}` : "-")}</td>
      <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">연장/야간</td>
      <td style="white-space:nowrap;">${formatMinutesToTime(record.overtimeMinutes || 0)} / ${formatMinutesToTime((record.nightWorkMinutes || 0) + (record.nightShiftMinutes || 0))}</td>
    </tr>
  </table>
</div>
            <div class="section">
              <div class="section-header payment">💰 지급 내역</div>
              <table>
                ${generatePaymentItemsHtml()}
                <tr class="total-row"><td>지급액 합계</td><td>${formatCurrency(totalPayments)}</td></tr>
              </table>
            </div>
            <div class="section">
  <div class="section-header deduction">📉 공제 내역</div>
  <table>
    ${generateDeductionItemsHtml()}
    <tr class="total-row">
      <td>공제액 합계</td>
      <td class="${totalDeductions < 0 ? "text-green" : "text-red"}">${totalDeductions < 0 ? "+" : "-"}${formatCurrency(Math.abs(totalDeductions))}</td>
    </tr>
  </table>
</div>
            ${""}
            <div class="calc-section full-width">
  <div class="section-header">📊 임금 계산방법</div>
  <table class="calc-table">
    <colgroup>
  <col style="width:10%;"/>
  <col style="width:9%;"/>
  <col style="width:31%;"/>
  <col style="width:10%;"/>
  <col style="width:9%;"/>
  <col style="width:31%;"/>
</colgroup>
    <tr class="cat-row"><td colspan="3" style="background:#e6f4ea;color:#1a7f37;">지급항목</td><td colspan="3" style="background:#fce8e6;color:#c62828;">공제항목</td></tr>
    <tr class="head-row"><td>항목</td><td style="text-align:right;">금액</td><td>계산방법</td><td>항목</td><td style="text-align:right;">금액</td><td>계산방법</td></tr>
    ${(() => {
      const payCalcItems = displayPaymentItems.filter((i) => i.amount !== 0 || i.itemId === "base-salary");
      const dedCalcItems = sortedDeductionItems || [];
      const maxLen = Math.max(payCalcItems.length, dedCalcItems.length);
      let rows = "";
      for (let i = 0; i < maxLen; i++) {
        const p = payCalcItems[i];
        const d = dedCalcItems[i];
        rows += "<tr>";
        rows += p
          ? `<td>${DOMPurify.sanitize(p.name)}</td><td style="text-align:right;">${formatCurrency(p.amount)}</td><td class="formula">${DOMPurify.sanitize(getPaymentFormula(p))}</td>`
          : "<td></td><td></td><td></td>";
        rows += d
          ? `<td>${DOMPurify.sanitize(d.name)}</td><td style="text-align:right;color:#c62828;">${formatCurrency(d.amount)}</td><td class="formula">${DOMPurify.sanitize(getDeductionFormula(d))}</td>`
          : "<td></td><td></td><td></td>";
        rows += "</tr>";
      }
      if (employee?.jobCategory === "production" && yearlyExempt) {
        const thisMonthRecord = yearlyExempt.monthlyBreakdown.find((r) => r.month === recordMonth);
        const thisMonthExempt = thisMonthRecord?.exemptAmount ?? 0;
        const newAccumulated = accumulatedBeforeThisMonth + thisMonthExempt;
        const remainingLimit = Math.max(0, ANNUAL_EXEMPT_LIMIT - newAccumulated);
        const usageRate = Math.min(100, Math.round((newAccumulated / ANNUAL_EXEMPT_LIMIT) * 100));
        rows += `<tr style="background:#fffbeb;">
      <td colspan="6" style="padding:2px 6px;color:#92400e;font-size:8.5px;border-top:1px solid #fde68a;">
        🏭 생산직비과세(소§17) | 이번달: ${thisMonthExempt > 0 ? new Intl.NumberFormat("ko-KR").format(thisMonthExempt) + "원" : "미적용"} | 연간누적: ${new Intl.NumberFormat("ko-KR").format(newAccumulated)} / ${new Intl.NumberFormat("ko-KR").format(ANNUAL_EXEMPT_LIMIT)}원 | 잔여: ${new Intl.NumberFormat("ko-KR").format(remainingLimit)}원 (${usageRate}% 소진)
      </td>
    </tr>`;
      }
      return rows;
    })()}
              </table>
            </div>
          </div>
          <div class="net-salary">
            <div class="net-salary-label">실지급액</div>
            <div class="net-salary-amount">${formatCurrency(record.netSalary)}</div>
          </div>
          <div class="footer">
            <p>본 명세서는 ${sanitizedMonth} 귀속 급여입니다. | ${sanitizedCompanyName} | 발급일: ${new Date().toLocaleDateString("ko-KR")}</p>
            <p style="margin-top: 4px; font-weight: 500;">귀하의 노고에 감사드립니다.</p>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(generatePrintHtml());
    printWindow.document.close();
    printWindow.print();
  };

  const handlePdfExport = () => {
    const container = document.createElement("div");
    container.innerHTML = generatePrintHtml();
    const body = container.querySelector("body");
    const content = body ? body.innerHTML : container.innerHTML;

    const wrapper = document.createElement("div");
    // Copy styles
    const styleEl = container.querySelector("style");
    if (styleEl) {
      const s = document.createElement("style");
      s.textContent = styleEl.textContent;
      wrapper.appendChild(s);
    }
    wrapper.innerHTML += content;

    const sanitizedName = record.employeeName.replace(/[^a-zA-Z0-9가-힣]/g, "_");
    const sanitizedMonth = record.month.replace(/[^0-9-]/g, "");

    html2pdf()
      .set({
        margin: 10,
        filename: `급여명세서_${sanitizedName}_${sanitizedMonth}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(wrapper)
      .save();
  };

  const handleSendEmail = async () => {
    if (!emailAddress.trim()) {
      toast.error("이메일 주소를 입력해주세요.");
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-payslip-email", {
        body: {
          employeeName: record.employeeName,
          employeeEmail: emailAddress,
          month: record.month,
          employeeNumber: record.employeeNumber,
          department: record.department,
          presentDays: record.presentDays,
          lateDays: record.lateDays,
          absentDays: record.absentDays,
          leaveDays: record.leaveDays,
          overtimeHours: record.overtimeHours,
          baseSalary: record.baseSalary,
          overtime: record.overtime,
          bonus: record.bonus,
          deductions: record.deductions,
          netSalary: record.netSalary,
          companyName: companySettings.companyName,
          companyLogoUrl: companySettings.companyLogoUrl,
        },
      });

      if (error) throw error;

      toast.success(`${record.employeeName}님에게 급여명세서가 발송되었습니다.`);
      setEmailDialogOpen(false);
    } catch (error: any) {
      console.error("Email send error:", error);
      toast.error(`이메일 발송 실패: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {hasPrevious && (
                <Button variant="ghost" size="icon" onClick={onPrevious}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              )}
              <span>급여명세서</span>
              {hasNext && (
                <Button variant="ghost" size="icon" onClick={onNext}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setEmailDialogOpen(true)}>
                <Mail className="w-4 h-4 mr-1" />
                이메일
              </Button>
              <Button variant="outline" size="sm" onClick={handlePdfExport}>
                <FileDown className="w-4 h-4 mr-1" />
                PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-1" />
                출력
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div id="payslip-print">
          <h1 style={{ textAlign: "center", borderBottom: "2px solid hsl(var(--primary))", paddingBottom: "8px" }}>
            급여명세서
          </h1>

          {/* 직원 정보 */}
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">직원 정보</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">성명</span>
                <span className="font-medium">{record.employeeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">생년월일</span>
                <span className="font-medium">
                  {(() => {
                    const rn = employee.residentNumber;
                    if (!rn) return "-";
                    const digits = rn.replace(/[^0-9]/g, "");
                    if (digits.length < 6) return "-";
                    const yy = digits.substring(0, 2);
                    const mm = digits.substring(2, 4);
                    const dd = digits.substring(4, 6);
                    const cd = digits.length >= 7 ? digits[6] : "";
                    const c = cd === "3" || cd === "4" ? "20" : "19";
                    return `${c}${yy}.${mm}.${dd}`;
                  })()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">사원번호</span>
                <span className="font-medium">{record.employeeNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">부서</span>
                <span className="font-medium">{record.department}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">직급</span>
                <span className="font-medium">{employee.position || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">직종</span>
                <span className="font-medium">{employee.jobCategory === "production" ? "생산직" : "사무직"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">급여월</span>
                <span className="font-medium">{record.month}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">입사일</span>
                <span className="font-medium">{employee.hireDate || "-"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">고용형태</span>
                <span className="font-medium">
                  {employee.employmentType === "regular"
                    ? "정규직"
                    : employee.employmentType === "contract"
                      ? "계약직"
                      : employee.employmentType === "daily"
                        ? "일용직"
                        : "프리랜서"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">급여유형</span>
                <span className="font-medium">
                  {employee.payType === "daily" ? "일급제" : employee.payType === "hourly" ? "시급제" : "월급제"}
                </span>
              </div>
              {employee.payType === "hourly" && employee.hourlyRate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">시급</span>
                  <span className="font-medium">{new Intl.NumberFormat("ko-KR").format(employee.hourlyRate)}원</span>
                </div>
              )}
              {employee.payType === "daily" && employee.dailyRate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">일급</span>
                  <span className="font-medium">{new Intl.NumberFormat("ko-KR").format(employee.dailyRate)}원</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">적용 시급</span>
                <span className="font-medium">{appliedHourlyRateText}</span>
              </div>
              <div className="flex justify-between col-span-2">
                <span className="text-muted-foreground">급여계좌</span>
                <span className="font-medium">
                  {employee.bankName ? `${employee.bankName} ${employee.accountNumber || ""}` : "-"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 근태 정보 */}
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">근태 현황</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">출근일수</span>
                <span className="font-medium">{record.presentDays + record.lateDays}일</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">지각일수</span>
                <span className="font-medium">{record.lateDays}일</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">결근일수</span>
                <span className="font-medium">{record.absentDays}일</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">휴가일수</span>
                <span className="font-medium">{record.leaveDays}일</span>
              </div>
            </CardContent>
          </Card>

          {/* 근로시간 상세 (모든 직원) */}
          <Card className="mb-4">
            <CardHeader className="pb-2 bg-accent/50">
              <CardTitle className="text-sm">⏱ 근로시간 상세</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm pt-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">총근로시간</span>
                <span className="font-medium">{formatMinutesToTime(record.totalWorkMinutes || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">정규근로시간</span>
                <span className="font-medium">{formatMinutesToTime(record.regularWorkMinutes || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">연장근로시간</span>
                <span className="font-medium">{formatMinutesToTime(record.overtimeMinutes || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">야간근로시간</span>
                <span className="font-medium">{formatMinutesToTime(record.nightWorkMinutes || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">야간교대근로시간</span>
                <span className="font-medium">{formatMinutesToTime(record.nightShiftMinutes || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">휴일근로시간</span>
                <span className="font-medium">{formatMinutesToTime(record.holidayWorkMinutes || 0)}</span>
              </div>
            </CardContent>
          </Card>

          {/* 지급 내역 */}
          <Card className="mb-4">
            <CardHeader className="pb-2 bg-primary/10">
              <CardTitle className="text-sm">지급 내역</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-4">
              {displayPaymentItems
                .filter((item) => item.amount !== 0 || item.itemId === "base-salary")
                .map((item) => (
                  <div key={item.itemId} className="flex justify-between text-sm">
                    <span>
                      {item.name}
                      {item.itemId === "base-salary" && employee?.payType === "monthly" && (
                        <span className="text-[10px] text-muted-foreground ml-1">(주휴수당 포함)</span>
                      )}
                    </span>
                    <span className={`font-medium ${item.itemId !== "base-salary" ? "text-green-600" : ""}`}>
                      {item.itemId !== "base-salary" ? "+" : ""}
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>지급액 합계</span>
                <span>{formatCurrency(totalPayments)}</span>
              </div>
            </CardContent>
          </Card>

          {/* 공제 내역 */}
          <Card className="mb-4">
            <CardHeader className="pb-2 bg-destructive/10">
              <CardTitle className="text-sm">공제 내역</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-4">
              {sortedDeductionItems && sortedDeductionItems.length > 0 ? (
                sortedDeductionItems.map((item) => (
                  <div key={item.itemId} className="flex justify-between text-sm">
                    <span>{item.name}</span>
                    <span className={`font-medium ${item.amount < 0 ? "text-green-600" : "text-destructive"}`}>
                      {item.amount < 0 ? "+" : "-"}
                      {formatCurrency(Math.abs(item.amount))}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between text-sm">
                  <span>4대보험 및 기타공제</span>
                  <span className="font-medium text-destructive">-{formatCurrency(record.deductions)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>공제액 합계</span>
                <span className={totalDeductions < 0 ? "text-green-600" : "text-destructive"}>
                  {totalDeductions < 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(totalDeductions))}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 생산직 비과세 현황 (생산직만 표시) */}
          {employee?.jobCategory === "production" && yearlyExempt && (
            <Card className="mb-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-800 dark:text-amber-300">
                  🏭 생산직 비과세 현황 (소득세법 시행령 제17조)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-2">
                {(() => {
                  const thisMonthRecord = yearlyExempt.monthlyBreakdown.find((r) => r.month === recordMonth);
                  const thisMonthExempt = thisMonthRecord?.exemptAmount ?? 0;
                  const thisMonthTaxable = thisMonthRecord?.taxableAmount ?? 0;
                  const thisMonthEligible = thisMonthRecord?.isEligible ?? false;
                  const newAccumulated = accumulatedBeforeThisMonth + thisMonthExempt;
                  const remainingLimit = Math.max(0, ANNUAL_EXEMPT_LIMIT - newAccumulated);

                  return (
                    <div className="space-y-1.5 text-sm">
                      {/* 이번 달 적용 결과 */}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">이번 달 비과세 적용</span>
                        <span className={`font-medium ${thisMonthEligible ? "text-green-600" : "text-red-500"}`}>
                          {thisMonthEligible ? `${new Intl.NumberFormat("ko-KR").format(thisMonthExempt)}원` : "미적용"}
                        </span>
                      </div>
                      {thisMonthTaxable > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">이번 달 한도 초과 (과세 전환)</span>
                          <span className="font-medium text-red-500">
                            {new Intl.NumberFormat("ko-KR").format(thisMonthTaxable)}원
                          </span>
                        </div>
                      )}
                      <div className="border-t border-amber-200 pt-1.5 mt-1.5">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">연간 누적 비과세</span>
                          <span className="font-medium">
                            {new Intl.NumberFormat("ko-KR").format(newAccumulated)}원
                            <span className="text-xs text-muted-foreground ml-1">
                              / {new Intl.NumberFormat("ko-KR").format(ANNUAL_EXEMPT_LIMIT)}원
                            </span>
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">잔여 한도</span>
                          <span className={`font-medium ${remainingLimit === 0 ? "text-red-500" : "text-blue-600"}`}>
                            {new Intl.NumberFormat("ko-KR").format(remainingLimit)}원
                          </span>
                        </div>
                      </div>
                      {/* 연간 월별 누적 바 */}
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>연간 한도 사용률</span>
                          <span>{Math.min(100, Math.round((newAccumulated / ANNUAL_EXEMPT_LIMIT) * 100))}%</span>
                        </div>
                        <div className="w-full bg-amber-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              newAccumulated >= ANNUAL_EXEMPT_LIMIT ? "bg-red-500" : "bg-amber-500"
                            }`}
                            style={{
                              width: `${Math.min(100, (newAccumulated / ANNUAL_EXEMPT_LIMIT) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      {/* 비적용 사유 표시 */}
                      {!thisMonthEligible && thisMonthRecord && (
                        <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded p-2 mt-1">
                          ⚠ 이번 달 비과세 미적용 — 급여 재계산 시 설정을 확인해주세요
                        </div>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* 임금 계산방법 */}
          <Card className="mb-4">
            <CardHeader className="pb-2 bg-accent/50">
              <CardTitle className="text-sm">📊 임금 계산방법</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* 지급항목 */}
              <div>
                <div className="text-xs font-bold text-green-700 dark:text-green-400 mb-2 px-2 py-1 bg-green-50 dark:bg-green-950/30 rounded">
                  지급항목
                </div>
                <div className="space-y-1.5">
                  {displayPaymentItems
                    .filter((i) => i.amount !== 0 || i.itemId === "base-salary")
                    .map((item) => (
                      <div key={item.itemId} className="grid grid-cols-[1fr_auto_1.2fr] gap-2 text-xs items-center">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-right whitespace-nowrap">{formatCurrency(item.amount)}</span>
                        <span className="text-muted-foreground text-[10px]">{getPaymentFormula(item)}</span>
                      </div>
                    ))}
                </div>
              </div>
              <Separator />
              {/* 공제항목 */}
              <div>
                <div className="text-xs font-bold text-red-700 dark:text-red-400 mb-2 px-2 py-1 bg-red-50 dark:bg-red-950/30 rounded">
                  공제항목
                </div>
                <div className="space-y-1.5">
                  {(sortedDeductionItems || []).map((item) => (
                    <div key={item.itemId} className="grid grid-cols-[1fr_auto_1.2fr] gap-2 text-xs items-center">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-right whitespace-nowrap text-destructive">
                        {formatCurrency(item.amount)}
                      </span>
                      <span className="text-muted-foreground text-[10px]">{getDeductionFormula(item)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 실지급액 */}
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="flex justify-between items-center py-6">
              <span className="text-lg font-semibold">실지급액</span>
              <span className="text-2xl font-bold">{formatCurrency(record.netSalary)}</span>
            </CardContent>
          </Card>

          <p style={{ textAlign: "center", marginTop: "20px", fontSize: "12px", color: "gray" }}>
            본 명세서는 {record.month} 귀속 급여입니다.
          </p>
          <p
            style={{
              textAlign: "center",
              marginTop: "12px",
              fontSize: "13px",
              fontWeight: 500,
              color: "hsl(var(--foreground))",
            }}
          >
            귀하의 노고에 감사드립니다.
          </p>
        </div>
      </DialogContent>

      {/* 이메일 발송 다이얼로그 */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>급여명세서 이메일 발송</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">받는 사람</label>
              <Input
                type="email"
                placeholder="이메일 주소 입력"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                className="mt-1"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {record.employeeName}님의 {record.month} 급여명세서를 발송합니다.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleSendEmail} disabled={isSending}>
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    발송 중...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    발송
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
