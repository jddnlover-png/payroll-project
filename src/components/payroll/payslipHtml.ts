import DOMPurify from "dompurify";
import { PayrollRecord, Employee } from "@/types/employee";
import { ANNUAL_EXEMPT_LIMIT } from "@/utils/productionTaxExemption";

const formatMinutesToTime = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}시간 ${String(m).padStart(2, "0")}분`;
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(amount);

const getDisplayPaymentItemName = (name: string) =>
  name
    .replace(/공휴일\s*근로수당/g, "공휴일근로가산수당")
    .replace(/휴일근로수당/g, "휴일근로가산수당")
    .replace(/연장근로수당/g, "연장근로가산수당")
    .replace(/야간근로수당/g, "야간근로가산수당")
    .replace(/야간\+연장수당/g, "야간+연장가산수당")
    .replace(/연장수당/g, "연장근로가산수당")
    .replace(/야간수당/g, "야간근로가산수당");

const fmtNum = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

interface PayslipHtmlParams {
  record: PayrollRecord;
  employee: Employee;
  companyName?: string;
  paymentItems: any[];
  deductionItems: any[];
  orgSettings: any;
  yearlyExempt?: any | null;
  accumulatedBeforeThisMonth?: number;
}

export function generatePayslipHtml({
  record,
  employee,
  companyName = "회사명",
  paymentItems,
  deductionItems,
  orgSettings,
  yearlyExempt = null,
  accumulatedBeforeThisMonth = 0,
}: PayslipHtmlParams) {
  const sanitizedCompanyName = DOMPurify.sanitize(companyName || "회사명");
  const sanitizedEmployeeName = DOMPurify.sanitize(record.employeeName);
  const sanitizedMonth = DOMPurify.sanitize(record.month);
  const sanitizedEmployeeNumber = DOMPurify.sanitize(record.employeeNumber);
  const sanitizedDepartment = DOMPurify.sanitize(record.department);
  const sanitizedPosition = DOMPurify.sanitize(employee.position || "-");
  const jobCategoryLabel = employee.jobCategory === "production" ? "생산직" : "사무직";

  const recordMonth = parseInt(record.month.split("-")[1]);

  const actualLateMinutes =
    (record as any).actualLateMinutes ??
    (record as any).actual_late_minutes ??
    (record as any).totalActualLateMinutes ??
    0;

  const actualEarlyLeaveMinutes =
    (record as any).actualEarlyLeaveMinutes ??
    (record as any).actual_early_leave_minutes ??
    (record as any).totalActualEarlyLeaveMinutes ??
    0;

  const formatPlainMinutes = (minutes: number) => `${minutes}분`;

  const standardWorkHours = orgSettings?.standard_work_hours || 8;
  const appliedHourlyRate = (() => {
    if (employee.payType === "monthly") return 0;
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

  const activePaymentItems = paymentItems.filter((item) => item.isActive);
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

  const DEDUCTION_ORDER = [
    "income-tax",
    "local-income-tax",
    "national-pension",
    "health-insurance",
    "employment-insurance",
    "long-term-care",
  ];

  const sortedDeductionItems =
    record.deductionItems && record.deductionItems.length > 0
      ? [...(record.deductionItems as any[])].sort((a, b) => {
          const ai = DEDUCTION_ORDER.indexOf(a.itemId);
          const bi = DEDUCTION_ORDER.indexOf(b.itemId);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        })
      : [];

  const totalPayments = displayPaymentItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const totalDeductions =
    sortedDeductionItems.length > 0
      ? sortedDeductionItems.reduce((sum, item) => sum + item.amount, 0)
      : record.deductions;

  const holidayShiftItems = displayPaymentItems.filter((item: any) =>
    String(item.itemId || "").startsWith("hol-shift-tier"),
  );

  const holidayNightShiftMinutes = holidayShiftItems.reduce(
    (sum: number, item: any) => sum + ((item.shiftTierMinutes || 0) as number),
    0,
  );

  const nonHolidayNightShiftMinutes = record.nightShiftMinutes || 0;
  const displayTotalNightShiftMinutes = nonHolidayNightShiftMinutes + holidayNightShiftMinutes;
  const displayHolidayWorkMinutes = Math.max((record as any).holidayWorkMinutes || 0, holidayNightShiftMinutes);

  const overtimeRate = orgSettings?.overtime_multiplier || 1.5;
  const overtimeHours = (record.overtimeMinutes || 0) / 60;

  const getPaymentFormula = (item: { itemId: string; name: string; amount: number }): string => {
    if (employee.payType === "monthly") return "월정액 지급";

    if (item.itemId === "base-salary") {
      if (employee.payType === "daily") {
        return employee.dailyRate
          ? `${fmtNum(employee.dailyRate)}원 × ${record.presentDays + record.lateDays}일`
          : "해당 없음";
      }

      if (employee.payType === "hourly") {
  if (!employee.hourlyRate) return "해당 없음";

  const baseHours =
    employee.hourlyRate > 0
      ? record.baseSalary / employee.hourlyRate
      : 0;

  return `${fmtNum(employee.hourlyRate)}원 × ${baseHours.toFixed(1)}시간`;
}
    }

    if (item.itemId === "overtime") {
      if (appliedHourlyRate > 0 && overtimeHours > 0) {
        return `${fmtNum(appliedHourlyRate)}원 × ${overtimeRate} × ${overtimeHours.toFixed(1)}시간`;
      }
      return "해당 없음";
    }

        if (
      item.itemId === "night-shift-allowance" ||
      (item.name.includes("야간") && !item.itemId?.startsWith("night-shift-tier"))
    ) {
      const nightAlpha = (orgSettings?.night_shift_multiplier || 2.0) - 1.0;

      if (appliedHourlyRate > 0 && item.amount > 0 && nightAlpha > 0) {
        const nightWorkHours = item.amount / (appliedHourlyRate * nightAlpha);
        return `${fmtNum(appliedHourlyRate)}원 × ${nightAlpha.toFixed(1)}가산 × ${nightWorkHours.toFixed(1)}시간`;
      }

      return "해당 없음";
    }

    if (item.itemId?.startsWith("night-shift-tier") || item.itemId?.startsWith("hol-shift-tier")) {
      const tierMinutes = (item as any).shiftTierMinutes || 0;
      const tierMultiplier = (item as any).shiftTierMultiplier || 1.5;
      const alphaRate = tierMultiplier - 1.0;
      if (appliedHourlyRate > 0 && tierMinutes > 0) {
        return `${fmtNum(appliedHourlyRate)}원 × ${alphaRate.toFixed(1)} × ${(tierMinutes / 60).toFixed(1)}시간`;
      }
      return "해당 없음";
    }

        if (item.itemId === "holiday-work-allowance" || item.name.includes("휴일근로")) {
      if (appliedHourlyRate > 0 && item.amount > 0) {
        const hol8h = (item as any).holidayWork8hMinutes || 0;
        const holOver8h = (item as any).holidayWorkOver8hMinutes || 0;
        const holidayAlpha8h = orgSettings?.holiday_alpha_8h || 0.5;
        const lines: string[] = [];

        if (hol8h > 0) {
          lines.push(
            `8h이내: ${fmtNum(appliedHourlyRate)}원 × ${1.0 + holidayAlpha8h}배 × ${(hol8h / 60).toFixed(1)}시간`,
          );
        }

        if (holOver8h > 0) {
          lines.push(
            `8h초과: ${fmtNum(appliedHourlyRate)}원 × ${1.0 + (orgSettings?.holiday_alpha_ot || 1.0)}배 × ${(holOver8h / 60).toFixed(1)}시간`,
          );
        }

        return lines.length > 0 ? lines.join(" / ") : "해당 없음";
      }
      return "해당 없음";
    }

    if (item.itemId === "weekly-holiday-allowance" || item.name.includes("주휴")) {
      if (appliedHourlyRate > 0 && item.amount > 0) {
        const hours = item.amount / appliedHourlyRate;
        return `${fmtNum(appliedHourlyRate)}원 × ${hours.toFixed(1)}시간`;
      }
      return "해당 없음";
    }

    if (item.itemId === "public-holiday-pay" || item.name.includes("공휴일 유급")) {
  if (appliedHourlyRate > 0 && item.amount > 0) {
    const hours = item.amount / appliedHourlyRate;
    return `${fmtNum(appliedHourlyRate)}원 × ${hours.toFixed(1)}시간`;
  }
  return "해당 없음";
}

if (item.itemId === "paid-leave-pay" || item.name.includes("휴가 유급")) {
  if (appliedHourlyRate > 0 && item.amount > 0) {
    const hours = item.amount / appliedHourlyRate;
    return `${fmtNum(appliedHourlyRate)}원 × ${hours.toFixed(1)}시간`;
  }
  return "해당 없음";
}

if (item.itemId === "public-holiday-work-pay" || item.name.includes("공휴일 근로")) {
  if (appliedHourlyRate > 0 && item.amount > 0) {
    const publicHolidayWorkMultiplier = 1.5;
    const hours = item.amount / (appliedHourlyRate * publicHolidayWorkMultiplier);

    return `${fmtNum(appliedHourlyRate)}원 × ${publicHolidayWorkMultiplier.toFixed(1)} × ${hours.toFixed(1)}시간`;
  }
  return "해당 없음";
}

    const si = paymentItems.find((pi) => pi.id === item.itemId);
    if (si?.calculationType === "percentage" && si.defaultValue) return `기본급 × ${si.defaultValue}%`;

    return "월정액 지급";
  };

  const staticExemptDisplay = displayPaymentItems.reduce((sum, item) => {
    const payrollItem = paymentItems.find((p) => p.id === item.itemId);
    if (payrollItem?.exemptLimit && item.amount > 0) {
      return sum + Math.min(item.amount, payrollItem.exemptLimit);
    }
    return sum;
  }, 0);

  const thisMonthExemptForCalc = (() => {
    if (employee?.jobCategory !== "production" || !yearlyExempt) return 0;
    const rec = yearlyExempt.monthlyBreakdown.find((r: any) => r.month === recordMonth);
    return rec?.exemptAmount ?? 0;
  })();

    const taxBase = Math.max(0, totalPayments - thisMonthExemptForCalc - staticExemptDisplay);
  const insuranceBase = totalPayments;

const getDeductionAmount = (itemId: string) => {
  const found = deductionItems.find((item: any) => item.itemId === itemId);
  return Math.abs(Number(found?.amount) || 0);
};

const nationalPensionAmount = getDeductionAmount("national-pension");
const healthInsuranceAmount = getDeductionAmount("health-insurance");

const nationalPensionBaseRaw =
  Number((employee as any)?.national_pension_monthly_income) ||
  Number((record as any)?.national_pension_monthly_income) ||
  totalPayments;

const nationalPensionBase = Math.min(
  6_370_000,
  Math.max(400_000, nationalPensionBaseRaw),
);

const healthInsuranceBase =
  Number((employee as any)?.health_insurance_monthly_income) ||
  Number((record as any)?.health_insurance_monthly_income) ||
  totalPayments;

  const publicHolidayPaidMinutesForDisplay = (() => {
  const publicHolidayItem = displayPaymentItems.find(
    (item) => item.itemId === "public-holiday-pay" || item.name.includes("공휴일 유급"),
  );

  if (!publicHolidayItem || appliedHourlyRate <= 0) return 0;

  return (
    (publicHolidayItem as any).publicHolidayMinutes ??
    Math.round((publicHolidayItem.amount / appliedHourlyRate) * 60)
  );
})();

const paidLeaveMinutesForDisplay = (() => {
  const paidLeaveItem = displayPaymentItems.find(
    (item) => item.itemId === "paid-leave-pay" || item.name.includes("휴가 유급"),
  );

  if (!paidLeaveItem || appliedHourlyRate <= 0) return 0;

  return (
    (paidLeaveItem as any).paidLeaveMinutes ??
    Math.round((paidLeaveItem.amount / appliedHourlyRate) * 60)
  );
})();

const calculatedTotalWorkMinutes =
  (record.regularWorkMinutes || 0) +
  publicHolidayPaidMinutesForDisplay +
  paidLeaveMinutesForDisplay;

const displayTotalWorkMinutes = Math.max(
  record.totalWorkMinutes || 0,
  calculatedTotalWorkMinutes,
);

  const getDeductionFormula = (item: { itemId: string; name: string; amount: number }): string => {
    const si = deductionItems.find((di) => di.id === item.itemId);

    if (item.itemId === "national-pension") {
  const rate = 4.75;
  return `${fmtNum(nationalPensionBase)}원 × ${rate}%`;
}

if (item.itemId === "health-insurance") {
  const rate = 3.595;
  return `${fmtNum(healthInsuranceBase)}원 × ${rate}%`;
}

if (item.itemId === "employment-insurance") {
  return `${fmtNum(insuranceBase)}원 × 0.9%`;
}

if (item.itemId === "long-term-care") {
  const rate = 12.81;
  return (employee as any)?.longTermCareReduction || (employee as any)?.long_term_care_reduction
    ? `건강보험료 × ${rate}% × 70% (경감 적용)`
    : `건강보험료 × ${rate}%`;
}
    if (item.itemId === "income-tax") return `${fmtNum(taxBase)}원 기준 간이세액표 적용`;
    if (item.itemId === "local-income-tax" || item.name.includes("지방소득세")) return "소득세 × 10%";
    if (si?.calculationType === "percentage" && si.defaultValue)
      return `${fmtNum(insuranceBase)}원 × ${si.defaultValue}%`;

    return item.amount > 0 ? "월정액 공제" : "해당 없음";
  };

  const paymentRows = displayPaymentItems
    .filter((item) => item.amount !== 0 || item.itemId === "base-salary")
    .map((item) => {
      const isBase = item.itemId === "base-salary";
      return `
        <tr>
          <td>${DOMPurify.sanitize(getDisplayPaymentItemName(item.name))}${
            isBase && employee?.payType === "monthly"
              ? ' <span style="font-size:8px;color:#888;">(주휴수당 포함)</span>'
              : ""
          }</td>
          <td class="${isBase ? "" : "text-green"}">${isBase ? "" : "+"}${formatCurrency(item.amount)}</td>
        </tr>
      `;
    })
    .join("");

  const deductionRows =
    sortedDeductionItems.length > 0
      ? sortedDeductionItems
          .map((item) => {
            const isRefund = item.amount < 0;
            return `
              <tr>
                <td>${DOMPurify.sanitize(item.name)}</td>
                <td class="${isRefund ? "text-green" : "text-red"}">${isRefund ? "+" : "-"}${formatCurrency(Math.abs(item.amount))}</td>
              </tr>
            `;
          })
          .join("")
      : `
        <tr>
          <td>4대보험 및 기타공제</td>
          <td class="text-red">-${formatCurrency(record.deductions)}</td>
        </tr>
      `;

  const calculationRows = (() => {
    const payCalcItems = displayPaymentItems.filter((i) => i.amount !== 0 || i.itemId === "base-salary");
    const dedCalcItems = sortedDeductionItems || [];
    const maxLen = Math.max(payCalcItems.length, dedCalcItems.length);
    let rows = "";

    for (let i = 0; i < maxLen; i++) {
      const p = payCalcItems[i];
      const d = dedCalcItems[i];

      rows += "<tr>";
      rows += p
        ? `<td>${DOMPurify.sanitize(getDisplayPaymentItemName(p.name))}</td><td style="text-align:right;">${formatCurrency(p.amount)}</td><td class="formula">${DOMPurify.sanitize(getPaymentFormula(p))}</td>`
        : "<td></td><td></td><td></td>";
      rows += d
        ? `<td>${DOMPurify.sanitize(d.name)}</td><td style="text-align:right;color:#c62828;">${formatCurrency(d.amount)}</td><td class="formula">${DOMPurify.sanitize(getDeductionFormula(d))}</td>`
        : "<td></td><td></td><td></td>";
      rows += "</tr>";
    }

    if (employee?.jobCategory === "production" && yearlyExempt) {
      const thisMonthRecord = yearlyExempt.monthlyBreakdown.find((r: any) => r.month === recordMonth);
      const thisMonthExempt = thisMonthRecord?.exemptAmount ?? 0;
      const newAccumulated = accumulatedBeforeThisMonth + thisMonthExempt;
      const remainingLimit = Math.max(0, ANNUAL_EXEMPT_LIMIT - newAccumulated);
      const usageRate = Math.min(100, Math.round((newAccumulated / ANNUAL_EXEMPT_LIMIT) * 100));

      rows += `<tr style="background:#fffbeb;">
        <td colspan="6" style="padding:2px 6px;color:#92400e;font-size:8.5px;border-top:1px solid #fde68a;">
          🏭 생산직비과세(소§17) | 이번달: ${
            thisMonthExempt > 0 ? new Intl.NumberFormat("ko-KR").format(thisMonthExempt) + "원" : "미적용"
          } | 연간누적: ${new Intl.NumberFormat("ko-KR").format(newAccumulated)} / ${new Intl.NumberFormat(
            "ko-KR",
          ).format(
            ANNUAL_EXEMPT_LIMIT,
          )}원 | 잔여: ${new Intl.NumberFormat("ko-KR").format(remainingLimit)}원 (${usageRate}% 소진)
        </td>
      </tr>`;
    }

    return rows;
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
            padding: 6px;
            max-width: 100%;
            margin: 0 auto;
            background: #fff;
            color: #333;
            line-height: 1.2;
            font-size: 10px;
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
          tr:last-child td { border-bottom: none; }
          .text-green { color: #059669; }
          .text-red { color: #dc2626; }
          .total-row { background: #f8fafc; font-weight: bold; }
          .total-row td:first-child { color: #1e293b; }
          .net-salary {
            background: linear-gradient(135deg, #1e40af, #3b82f6);
            color: white;
            border-radius: 4px;
            padding: 6px;
            text-align: center;
            margin-top: 4px;
          }
          .net-salary-label { font-size: 10px; opacity: 0.9; margin-bottom: 1px; }
          .net-salary-amount { font-size: 16px; font-weight: bold; }
          .footer {
            text-align: center;
            color: #94a3b8;
            font-size: 8px;
            padding: 6px 4px 8px 4px;
            border-top: 1px solid #e2e8f0;
            margin-top: 4px;
          }
          .full-width { grid-column: 1 / -1; }
          .calc-section { border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; margin-bottom: 3px; }
          .calc-section .section-header { background: linear-gradient(135deg, #6366f1, #4f46e5); }
          .calc-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .calc-table td {
            padding: 3px 4px;
            font-size: 9px;
            border-bottom: 1px solid #f1f5f9;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            line-height: 1.5;
          }
          .calc-table .cat-row td { text-align: center; font-weight: bold; font-size: 9px; }
          .calc-table .head-row { background: #fafafa; font-weight: bold; }
          .calc-table td.formula {
            text-align: left !important;
            color: #555;
            font-size: 7.5px;
            white-space: normal !important;
            overflow: hidden;
            word-break: keep-all;
            line-height: 1.3;
            font-weight: normal !important;
          }
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
                <td style="white-space:nowrap;">${record.presentDays + record.lateDays}일</td>
              </tr>
              <tr>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">입사일</td>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">${DOMPurify.sanitize(employee.hireDate || "-")}</td>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">고용/급여</td>
                <td style="border-right:1px solid #e2e8f0;overflow:hidden;text-overflow:ellipsis;">
                  ${
                    employee.employmentType === "regular"
                      ? "정규직"
                      : employee.employmentType === "contract"
                        ? "계약직"
                        : employee.employmentType === "daily"
                          ? "일용직"
                          : "프리랜서"
                  } / ${employee.payType === "daily" ? "일급제" : employee.payType === "hourly" ? "시급제" : "월급제"}
                </td>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">지각/조퇴</td>
                <td style="white-space:nowrap;">${formatPlainMinutes(actualLateMinutes)} / ${formatPlainMinutes(actualEarlyLeaveMinutes)}</td>
              </tr>
              <tr>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">시급</td>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">${appliedHourlyRateText}</td>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">부서/직급</td>
                <td style="border-right:1px solid #e2e8f0;overflow:hidden;text-overflow:ellipsis;">${sanitizedDepartment} / ${sanitizedPosition}</td>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">결근/휴가</td>
                <td style="white-space:nowrap;">${record.absentDays}일 / ${record.leaveDays}일</td>
              </tr>
              <tr>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">급여계좌</td>
                <td colspan="3" style="border-right:1px solid #e2e8f0;overflow:hidden;text-overflow:ellipsis;">
                  ${DOMPurify.sanitize(employee.bankName ? `${employee.bankName} ${employee.accountNumber || ""}` : "-")}
                </td>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">총근로시간</td>
<td style="white-space:nowrap;">
  ${formatMinutesToTime(displayTotalWorkMinutes)}
</td>
              </tr>
                            <tr>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">정규근로</td>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">
                  ${formatMinutesToTime(record.regularWorkMinutes || 0)}
                </td>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">연장근로</td>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">
                  ${formatMinutesToTime(record.overtimeMinutes || 0)}
                </td>
                <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">야간근로</td>
                <td style="white-space:nowrap;">
                  ${formatMinutesToTime(record.nightWorkMinutes || 0)}
                </td>
              </tr>
              <tr>
  <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">공휴일 유급</td>
  <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">
    ${formatMinutesToTime(publicHolidayPaidMinutesForDisplay)}
  </td>
  <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">휴가 유급</td>
  <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">
    ${formatMinutesToTime(paidLeaveMinutesForDisplay)}
  </td>
  <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">휴일근로</td>
  <td style="white-space:nowrap;">
    ${formatMinutesToTime(displayHolidayWorkMinutes)}
  </td>
</tr>
<tr>
  <td style="border-right:1px solid #e2e8f0;white-space:nowrap;">야간교대</td>
  <td colspan="5" style="white-space:nowrap;">
    ${formatMinutesToTime(displayTotalNightShiftMinutes)}
    ${
      holidayNightShiftMinutes > 0
        ? `(비휴일 ${formatMinutesToTime(nonHolidayNightShiftMinutes)} / 휴일 ${formatMinutesToTime(holidayNightShiftMinutes)})`
        : ""
    }
  </td>
</tr>
            </table>
          </div>

          <div class="section">
            <div class="section-header payment">💰 지급 내역</div>
            <table>
              ${paymentRows}
              <tr class="total-row"><td>지급액 합계</td><td>${formatCurrency(totalPayments)}</td></tr>
            </table>
          </div>

          <div class="section">
            <div class="section-header deduction">📉 공제 내역</div>
            <table>
              ${deductionRows}
              <tr class="total-row">
                <td>공제액 합계</td>
                <td class="${totalDeductions < 0 ? "text-green" : "text-red"}">
                  ${totalDeductions < 0 ? "+" : "-"}${formatCurrency(Math.abs(totalDeductions))}
                </td>
              </tr>
            </table>
          </div>

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
              <tr class="cat-row">
                <td colspan="3" style="background:#e6f4ea;color:#1a7f37;">지급항목</td>
                <td colspan="3" style="background:#fce8e6;color:#c62828;">공제항목</td>
              </tr>
              <tr class="head-row">
                <td>항목</td><td style="text-align:right;">금액</td><td>계산방법</td>
                <td>항목</td><td style="text-align:right;">금액</td><td>계산방법</td>
              </tr>
              ${calculationRows}
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
}
