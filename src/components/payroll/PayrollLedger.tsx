import { useState } from "react";
import DOMPurify from "dompurify";
import html2pdf from "html2pdf.js";
import { PayrollRecord } from "@/types/employee";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, FileDown } from "lucide-react";
import { useEmployeeStore } from "@/store/employeeStore";
import { usePayrollSettingsStore } from "@/store/payrollSettingsStore";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(amount);

const formatMinutesToHM = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}시간 ${m}분`;
};

const getDisplayPaymentItemName = (name: string) =>
  name
    .replace(/공휴일\s*근로수당/g, "공휴일근로가산수당")
    .replace(/휴일근로수당/g, "휴일근로가산수당")
    .replace(/연장근로수당/g, "연장근로가산수당")
    .replace(/야간근로수당/g, "야간근로가산수당")
    .replace(/야간\+연장수당/g, "야간+연장가산수당")
    .replace(/연장수당/g, "연장근로가산수당")
    .replace(/야간수당/g, "야간근로가산수당");

interface DailyPayrollSummary {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  department: string;
  totalWage: number;
  totalDeductions: number;
  netPay: number;
  workDays: number;
}

interface PayrollLedgerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payrollData: PayrollRecord[];
  month: string;
  dailyPayrollSummaries?: DailyPayrollSummary[];
  employees?: import("@/types/employee").Employee[];
}

export function PayrollLedger({
  open,
  onOpenChange,
  payrollData,
  month,
  dailyPayrollSummaries = [],
  employees: propEmployees,
}: PayrollLedgerProps) {
  const [includeDailyWorkers, setIncludeDailyWorkers] = useState(false);
const { currentOrganization } = useOrganization();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const storeEmployees = useEmployeeStore((state) => state.employees);
  const employees = propEmployees && propEmployees.length > 0 ? propEmployees : storeEmployees;
  const { paymentItems, deductionItems } = usePayrollSettingsStore();
  const { settings: orgSettings } = useOrganizationSettings();

  // 설정의 활성 항목 + 급여 데이터에 있는 모든 항목을 병합 (누락 방지)
  const mergedPaymentItems = (() => {
    const settingsActive = paymentItems.filter((item) => item.isActive);
    const itemMap = new Map<string, { id: string; name: string }>();
    settingsActive.forEach((item) => itemMap.set(item.id, { id: item.id, name: item.name }));
    // 모든 급여 레코드의 지급 항목 스캔
    payrollData.forEach((record) => {
      (record.paymentItems || []).forEach((pi: any) => {
        const id = pi.itemId || pi.id || pi.item_id;
        if (!id) return;

        if (!itemMap.has(id)) {
          itemMap.set(id, { id, name: pi.name || pi.itemName || id });
        }
      });
    });
    return Array.from(itemMap.values());
  })();

  const mergedDeductionItems = (() => {
    const settingsActive = deductionItems.filter((item) => item.isActive);
    const itemMap = new Map<string, { id: string; name: string }>();
    settingsActive.forEach((item) => itemMap.set(item.id, { id: item.id, name: item.name }));
    // 모든 급여 레코드의 공제 항목 스캔
    payrollData.forEach((record) => {
      (record.deductionItems || []).forEach((di: any) => {
        if (!itemMap.has(di.itemId)) {
          itemMap.set(di.itemId, { id: di.itemId, name: di.name || di.itemId });
        }
      });
    });
    return Array.from(itemMap.values());
  })();

  const activePaymentItems = mergedPaymentItems;
  const activeDeductionItems = mergedDeductionItems;

  // 체크박스 핸들러
  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? payrollData.map((r) => r.id) : []);
  };

  const handleSelectRecord = (recordId: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? [...prev, recordId] : prev.filter((id) => id !== recordId)));
  };

  const getTargetRecords = () =>
    selectedIds.length > 0 ? payrollData.filter((r) => selectedIds.includes(r.id)) : payrollData;

  // 지급 항목 값 계산
  const getPaymentItemValue = (record: PayrollRecord, itemId: string): number => {
    const recordItem = record.paymentItems?.find((pi) => pi.itemId === itemId);
    if (recordItem) return recordItem.amount;
    if (itemId === "base-salary") return record.baseSalary;
    if (itemId === "overtime") return record.overtime;
    if (itemId === "bonus") return record.bonus;
    return 0;
  };

  // 공제 항목 값 계산
  const getDeductionItemValue = (record: PayrollRecord, itemId: string): number => {
    const recordItem = record.deductionItems?.find((di) => di.itemId === itemId);
    if (recordItem) return recordItem.amount;
    return 0;
  };

  // 지급 항목 합계
  const getPaymentTotal = (record: PayrollRecord): number => {
    if (record.paymentItems && record.paymentItems.length > 0) {
      return record.paymentItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
    }

    return activePaymentItems.reduce((sum, item) => sum + getPaymentItemValue(record, item.id), 0);
  };

  // 공제 항목 합계
  const getDeductionTotal = (record: PayrollRecord): number => {
    return activeDeductionItems.reduce((sum, item) => sum + getDeductionItemValue(record, item.id), 0);
  };

  // 비고란: 일급/시급 직원의 단가 표시
  const getRemarkText = (record: PayrollRecord): string => {
    const emp = employees.find((e) => e.id === record.employeeId);
    if (!emp) return "";
    if (emp.payType === "daily" && emp.dailyRate) {
      return `일급 ${new Intl.NumberFormat("ko-KR").format(emp.dailyRate)}원`;
    }
    if (emp.payType === "hourly" && emp.hourlyRate) {
      return `시급 ${new Intl.NumberFormat("ko-KR").format(emp.hourlyRate)}원`;
    }
    return "";
  };

  const totalStats = {
    baseSalary: payrollData.reduce((sum, r) => sum + r.baseSalary, 0),
    overtime: payrollData.reduce((sum, r) => sum + r.overtime, 0),
    bonus: payrollData.reduce((sum, r) => sum + r.bonus, 0),
    deductions: payrollData.reduce((sum, r) => sum + r.deductions, 0),
    netSalary: payrollData.reduce((sum, r) => sum + r.netSalary, 0),
    paymentTotal: 0,
    deductionTotal: 0,
  };

  // 동적 항목별 합계 계산
  const paymentItemTotals = activePaymentItems.map((item) => ({
    id: item.id,
    name: item.name,
    total: payrollData.reduce((sum, r) => sum + getPaymentItemValue(r, item.id), 0),
  }));

  const deductionItemTotals = activeDeductionItems.map((item) => ({
    id: item.id,
    name: item.name,
    total: payrollData.reduce((sum, r) => sum + getDeductionItemValue(r, item.id), 0),
  }));

  totalStats.paymentTotal = paymentItemTotals.reduce((s, i) => s + i.total, 0);
  totalStats.deductionTotal = deductionItemTotals.reduce((s, i) => s + i.total, 0);

  const getHolidayNightShiftMinutes = (record: PayrollRecord): number => {
    return ((record.paymentItems || []) as any[]).reduce((sum, item) => {
      if (String(item.itemId || item.id || item.item_id || "").startsWith("hol-shift-tier")) {
        return sum + (item.shiftTierMinutes || item.shift_tier_minutes || 0);
      }
      return sum;
    }, 0);
  };

  const getDisplayNightShiftMinutes = (record: PayrollRecord): number => {
    return (record.nightShiftMinutes || 0) + getHolidayNightShiftMinutes(record);
  };
  // 근로시간 합계
  const totalWorkMinutesSum = payrollData.reduce((s, r) => s + (r.totalWorkMinutes || 0), 0);
  const regularWorkMinutesSum = payrollData.reduce((s, r) => s + (r.regularWorkMinutes || 0), 0);
  const overtimeMinutesSum = payrollData.reduce((s, r) => s + (r.overtimeMinutes || 0), 0);
  const nightWorkMinutesSum = payrollData.reduce((s, r) => s + (r.nightWorkMinutes || 0), 0);
  const nightShiftMinutesSum = payrollData.reduce((s, r) => s + getDisplayNightShiftMinutes(r), 0);
  const holidayWorkMinutesSum = payrollData.reduce((s, r) => s + (r.holidayWorkMinutes || 0), 0);

  // 직원별 블록 HTML 생성 (인쇄/PDF 공용)
  const generateEmployeeBlockHtml = (record: PayrollRecord, index: number): string => {
    const s = DOMPurify.sanitize;
    const emp = employees.find((e) => e.id === record.employeeId);
    const payTypeLabel = emp?.payType === "daily" ? "일급제" : emp?.payType === "hourly" ? "시급제" : "월급제";
    const empTypeLabel =
      emp?.employmentType === "regular"
        ? "정규직"
        : emp?.employmentType === "contract"
          ? "계약직"
          : emp?.employmentType === "daily"
            ? "일용직"
            : "프리랜서";
    const jobCategoryLabel = emp?.jobCategory === "production" ? "생산직" : "사무직";
    const remarkText = getRemarkText(record);

    // 생년월일: 주민등록번호 앞 6자리에서 추출 (YYMMDD → YY.MM.DD)
    const birthDate = (() => {
      const rn = emp?.residentNumber;
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

    // 적용 시급 계산
    const standardWorkHours = orgSettings.standard_work_hours || 8;
    const appliedHourlyRate = (() => {
      if (!emp) return 0;
      if (emp.payType === "monthly") return 0; // 월급제는 시급 해당 없음
      if (emp.payType === "hourly" && emp.hourlyRate) return emp.hourlyRate;
      if (emp.payType === "daily" && emp.dailyRate) return Math.round(emp.dailyRate / standardWorkHours);
      return 0;
    })();
    const appliedHourlyRateText =
      emp?.payType === "monthly"
        ? "해당 없음"
        : appliedHourlyRate > 0
          ? `${new Intl.NumberFormat("ko-KR").format(appliedHourlyRate)}원`
          : "해당 없음";

    // 지급 항목 행 생성 (2열 그리드)
    const payItems = activePaymentItems
  .map((item) => ({
    id: item.id,
    name: getDisplayPaymentItemName(item.name),
    amount: getPaymentItemValue(record, item.id),
  }))
  .filter((item) => item.amount !== 0);

    const dedItems = activeDeductionItems
      .map((item) => ({
        id: item.id,
        name: item.name,
        amount: getDeductionItemValue(record, item.id),
      }))
      .filter((item) => item.amount !== 0);

    const paymentTotal = getPaymentTotal(record);
    const deductionTotal = getDeductionTotal(record);

    const maxRows = Math.max(payItems.length, dedItems.length, 1);

    let itemRowsHtml = "";
    for (let i = 0; i < maxRows; i++) {
      const pay = payItems[i];
      const ded = dedItems[i];
      itemRowsHtml += `<tr>
        <td class="item-name">${pay ? s(pay.name) : ""}</td>
        <td class="item-amount">${pay ? formatCurrency(pay.amount) : ""}</td>
        <td class="item-name">${ded ? s(ded.name) : ""}</td>
        <td class="item-amount ded">${ded ? formatCurrency(ded.amount) : ""}</td>
      </tr>`;
    }

    // ===== 계산방법 테이블 생성 =====
    const fmtNum = (n: number) => new Intl.NumberFormat("ko-KR").format(n);
    const overtimeRate = orgSettings.overtime_multiplier || 1.5;
    const nightRate = orgSettings.night_shift_multiplier || 2.0;
    const overtimeHours = (record.overtimeMinutes || 0) / 60;
    const nightHours = ((record.nightWorkMinutes || 0) + (record.nightShiftMinutes || 0)) / 60;

    // 지급항목 계산방법 생성
    const calcPayRows = payItems.map((item) => {
      let formula = "";
      // 월급제는 모든 지급항목에 '월정액 지급' 표시
      if (emp?.payType === "monthly") {
        formula = "월정액 지급";
      } else if (item.id === "base-salary") {
        if (emp?.payType === "daily")
          formula = emp.dailyRate
            ? `${fmtNum(emp.dailyRate)}원 × ${record.presentDays + record.lateDays}일`
            : "해당 없음";
        else if (emp?.payType === "hourly")
          formula = emp.hourlyRate
            ? `${fmtNum(emp.hourlyRate)}원 × ${((record.totalWorkMinutes || 0) / 60).toFixed(1)}시간`
            : "해당 없음";
      } else if (item.id === "overtime") {
        if (appliedHourlyRate > 0 && overtimeHours > 0) {
          formula = `${fmtNum(appliedHourlyRate)}원 × ${overtimeRate} × ${overtimeHours.toFixed(1)}시간`;
        } else {
          formula = "해당 없음";
        }
      } else if (item.id === "night-shift-allowance" || item.name.includes("야간")) {
        if (appliedHourlyRate > 0 && nightHours > 0) {
          formula = `${fmtNum(appliedHourlyRate)}원 × ${nightRate}배 × ${nightHours.toFixed(1)}시간`;
        } else {
          formula = "해당 없음";
        }
      } else if (item.id === "holiday-work-allowance" || item.name.includes("휴일근로")) {
        if (appliedHourlyRate > 0 && item.amount > 0) {
          // payment_items에 저장된 breakdown 데이터 사용
          const savedItem = (record as any).paymentItems?.find((p: any) => p.itemId === "holiday-work-allowance");
          const hol8h = savedItem?.holidayWork8hMinutes || 0;
          const holOver8h = savedItem?.holidayWorkOver8hMinutes || 0;
          const holNight = savedItem?.holidayNightMinutes || 0;
          const holidayAlpha8h = orgSettings.holiday_alpha_8h || 0.5;
          const lines: string[] = [];
          if (hol8h > 0) {
            const h = (hol8h / 60).toFixed(1);
            lines.push(`8h이내: ${fmtNum(appliedHourlyRate)}원 × ${1.0 + holidayAlpha8h}배 × ${h}시간`);
          }
          const holOver8hNonNight = Math.max(0, holOver8h - holNight);
          if (holOver8hNonNight > 0) {
            const h = (holOver8hNonNight / 60).toFixed(1);
            lines.push(
              `8h초과: ${fmtNum(appliedHourlyRate)}원 × ${1.0 + (orgSettings.holiday_alpha_ot || 1.0)}배 × ${h}시간`,
            );
          }
          if (holNight > 0) {
            const compositeRate = 1.0 + (orgSettings.holiday_alpha_ot || 1.0) + 0.5;
            const h = (holNight / 60).toFixed(1);
            lines.push(`야간포함: ${fmtNum(appliedHourlyRate)}원 × ${compositeRate}배 × ${h}시간`);
          }
          formula = lines.length > 0 ? lines.join("<br/>") : "해당 없음";
        } else {
          formula = "해당 없음";
        }
      } else if (item.id === "weekly-holiday-allowance" || item.name.includes("주휴")) {
        if (appliedHourlyRate > 0 && item.amount > 0) {
          const hours = item.amount / appliedHourlyRate;
          formula = `${fmtNum(appliedHourlyRate)}원 × ${hours.toFixed(1)}시간`;
        } else {
          formula = "해당 없음";
        }
      } else if (item.id === "public-holiday-pay" || item.name.includes("공휴일 유급")) {
        if (appliedHourlyRate > 0 && item.amount > 0) {
          const hours = item.amount / appliedHourlyRate;
          formula = `${fmtNum(appliedHourlyRate)}원 × ${hours.toFixed(1)}시간`;
        } else {
          formula = "해당 없음";
        }
      } else if (item.id === "public-holiday-work-pay" || item.name.includes("공휴일 근로")) {
        if (appliedHourlyRate > 0 && item.amount > 0) {
          const hours = item.amount / (appliedHourlyRate * 0.5);
          formula = `${fmtNum(appliedHourlyRate)}원 × 0.5 × ${hours.toFixed(1)}시간`;
        } else {
          formula = "해당 없음";
        }
      } else {
        // 기타 수당: 고정금액이면 '월정액 지급', 비율이면 표기
        const settingsItem = paymentItems.find((pi) => pi.id === item.id);
        if (settingsItem?.calculationType === "percentage" && settingsItem.defaultValue) {
          formula = `기본급 × ${settingsItem.defaultValue}%`;
        } else {
          formula = "월정액 지급";
        }
      }
      return { name: item.name, amount: item.amount, formula };
    });

    // 공제항목 계산방법 생성
    const taxableAmount = paymentTotal; // 과세대상 급여액

const payrollEmployee = (record as any).employee;

const nationalPensionBaseRaw =
  Number((emp as any)?.national_pension_monthly_income) ||
  Number(payrollEmployee?.national_pension_monthly_income) ||
  Number((record as any).national_pension_monthly_income) ||
  paymentTotal;

const nationalPensionBase = Math.min(
  6_370_000,
  Math.max(400_000, nationalPensionBaseRaw),
);

const healthInsuranceBase =
  Number((emp as any)?.health_insurance_monthly_income) ||
  Number(payrollEmployee?.health_insurance_monthly_income) ||
  Number((record as any).health_insurance_monthly_income) ||
  paymentTotal;

const calcDedRows = dedItems.map((item) => {
      let formula = "";
      const settingsItem = deductionItems.find((di) => di.id === item.id);
      // 4대 보험 및 소득세 항목
      if (item.id === "national-pension") {
  formula = `${fmtNum(nationalPensionBase)}원 × ${settingsItem?.defaultValue ?? 4.75}%`;
} else if (item.id === "health-insurance") {
  formula = `${fmtNum(healthInsuranceBase)}원 × ${settingsItem?.defaultValue ?? 3.595}%`;
      } else if (item.id === "employment-insurance") {
        formula = `${fmtNum(taxableAmount)}원 × ${settingsItem?.defaultValue ?? 0.9}%`;
      } else if (item.id === "long-term-care") {
        formula = `건강보험료 × ${settingsItem?.defaultValue ?? 12.81}%`;
      } else if (item.id === "income-tax") {
        formula = `간이세액표 적용`;
      } else if (item.id === "local-income-tax" || item.name.includes("지방소득세")) {
        formula = `소득세 × 10%`;
      } else if (settingsItem?.calculationType === "percentage" && settingsItem.defaultValue) {
        formula = `${fmtNum(taxableAmount)}원 × ${settingsItem.defaultValue}%`;
      } else if (settingsItem?.calculationType === "fixed") {
        formula = "월정액 공제";
      } else {
        formula = item.amount > 0 ? "월정액 공제" : "해당 없음";
      }
      return { name: item.name, amount: item.amount, formula };
    });

    const maxCalcRows = Math.max(calcPayRows.length, calcDedRows.length, 1);
    let calcRowsHtml = "";
    for (let i = 0; i < maxCalcRows; i++) {
      const pay = calcPayRows[i];
      const ded = calcDedRows[i];
      calcRowsHtml += `<tr>
        <td class="item-name">${pay ? s(pay.name) : ""}</td>
        <td class="item-amount">${pay ? formatCurrency(pay.amount) : ""}</td>
        <td class="calc-formula">${pay ? s(pay.formula) : ""}</td>
        <td class="item-name">${ded ? s(ded.name) : ""}</td>
        <td class="item-amount ded">${ded ? formatCurrency(ded.amount) : ""}</td>
        <td class="calc-formula">${ded ? s(ded.formula) : ""}</td>
      </tr>`;
    }

    return `
      <div class="emp-block">
        <table class="emp-table">
          <colgroup>
            <col style="width:11%"><col style="width:14%"><col style="width:11%"><col style="width:14%">
            <col style="width:11%"><col style="width:14%"><col style="width:11%"><col style="width:14%">
          </colgroup>
          <thead>
            <tr class="emp-header">
              <th colspan="8">${s(record.employeeName)} (${s(record.employeeNumber)})</th>
            </tr>
          </thead>
          <tbody>
            <!-- 인사정보 -->
            <tr class="info-row">
              <td class="label">사원번호</td><td>${s(record.employeeNumber)}</td>
              <td class="label">성명</td><td>${s(record.employeeName)}</td>
              <td class="label">생년월일</td><td>${birthDate}</td>
              <td class="label">부서</td><td>${s(record.department)}</td>
            </tr>
            <tr class="info-row">
              <td class="label">직급</td><td>${emp?.position ? s(emp.position) : "-"}</td>
              <td class="label">직종</td><td>${jobCategoryLabel}</td>
              <td class="label">고용형태</td><td>${empTypeLabel}</td>
              <td class="label">급여유형</td><td>${payTypeLabel}</td>
            </tr>
            <tr class="info-row">
              <td class="label">입사일</td><td>${emp?.hireDate ? s(emp.hireDate) : "-"}</td>
              <td class="label">적용 시급</td><td>${appliedHourlyRateText}</td>
              <td class="label">비고</td><td colspan="3">${remarkText ? s(remarkText) : "-"}</td>
            </tr>
            <!-- 근태/근로시간 -->
            <tr>
              <td class="section-header" colspan="8">근태 및 근로시간</td>
            </tr>
            <tr class="info-row">
  <td class="label">출근일수</td><td>${record.presentDays + record.lateDays}일</td>
  <td class="label">지각시간</td><td>${(record as any).actualLateMinutes ? `${(record as any).actualLateMinutes}분` : "0분"}</td>
  <td class="label">조퇴시간</td><td>${(record as any).actualEarlyLeaveMinutes ? `${(record as any).actualEarlyLeaveMinutes}분` : "0분"}</td>
  <td class="label">결근일수</td><td>${record.absentDays}일</td>
</tr>
<tr class="info-row">
  <td class="label">휴가일수</td><td>${record.leaveDays}일</td>
  <td colspan="6"></td>
</tr>
            <tr class="info-row">
              <td class="label">총근로시간</td><td>${formatMinutesToHM(record.totalWorkMinutes || 0)}</td>
              <td class="label">정규근로</td><td>${formatMinutesToHM(record.regularWorkMinutes || 0)}</td>
              <td class="label">연장근로</td><td>${formatMinutesToHM(record.overtimeMinutes || 0)}</td>
              <td class="label">야간근로</td><td>${formatMinutesToHM(record.nightWorkMinutes || 0)}</td>
            </tr>
            <tr class="info-row">
              <td class="label">야간교대근로</td><td>${formatMinutesToHM(getDisplayNightShiftMinutes(record))}</td>
              <td class="label">휴일근로</td><td>${formatMinutesToHM(record.holidayWorkMinutes || 0)}</td>
              <td colspan="4"></td>
            </tr>
            <!-- 지급/공제 내역 -->
            <tr>
              <td class="section-header pay-header" colspan="4">지급내역</td>
              <td class="section-header ded-header" colspan="4">공제내역</td>
            </tr>
            <tr class="sub-header">
              <td class="label">항목명</td><td class="label">금액</td>
              <td class="label" colspan="2"></td>
              <td class="label" colspan="2"></td>
              <td class="label" colspan="2"></td>
            </tr>
          </tbody>
        </table>
        <table class="items-table">
          <colgroup>
            <col style="width:25%"><col style="width:25%"><col style="width:25%"><col style="width:25%">
          </colgroup>
          <thead>
            <tr class="sub-header">
              <th>항목명</th><th>금액</th><th>항목명</th><th>금액</th>
            </tr>
          </thead>
          <tbody>
            ${itemRowsHtml}
            <tr class="total-row">
              <td class="label">지급합계</td>
              <td class="total-amount pay-total">${formatCurrency(paymentTotal)}</td>
              <td class="label">공제합계</td>
              <td class="total-amount ded-total">${formatCurrency(deductionTotal)}</td>
            </tr>
            <tr class="net-row">
              <td class="label" colspan="2"></td>
              <td class="label net-label">실지급액</td>
              <td class="net-amount">${formatCurrency(record.netSalary)}</td>
            </tr>
          </tbody>
        </table>
        <!-- 임금 계산방법 -->
        <table class="calc-table">
          <colgroup>
            <col style="width:14%"><col style="width:14%"><col style="width:22%">
            <col style="width:14%"><col style="width:14%"><col style="width:22%">
          </colgroup>
          <thead>
            <tr>
              <th class="section-header" colspan="6">임금 계산방법</th>
            </tr>
            <tr>
              <th class="section-header pay-header" colspan="3">지급항목</th>
              <th class="section-header ded-header" colspan="3">공제항목</th>
            </tr>
            <tr class="sub-header">
              <th>항목명</th><th>금액</th><th>계산 방법</th>
              <th>항목명</th><th>금액</th><th>계산 방법</th>
            </tr>
          </thead>
          <tbody>
            ${calcRowsHtml}
          </tbody>
        </table>
      </div>
    `;
  };

  const getPrintStyles = (): string => `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Malgun Gothic', sans-serif; padding: 10px; }
    h2 { text-align: center; font-size: 16px; margin: 0 0 2px; }
    .legal-note { text-align: center; font-size: 8px; color: #888; margin: 0 0 2px; }
    .meta { display: flex; justify-content: space-between; font-size: 9px; margin-bottom: 8px; color: #555; }
    .emp-block { page-break-inside: avoid; margin-bottom: 12px; border: 1px solid #333; }
    .emp-table, .items-table { width: 100%; border-collapse: collapse; }
    .emp-table td, .emp-table th, .items-table td, .items-table th {
      border: 1px solid #aaa; padding: 3px 5px; font-size: 9px; text-align: center;
    }
    .emp-header th { background: #2c3e50; color: #fff; font-size: 10px; padding: 4px; text-align: left; }
    .label { background: #f5f5f5; font-weight: bold; text-align: left; white-space: nowrap; }
    .info-row td { text-align: left; }
    .section-header { background: #e8e8e8; font-weight: bold; text-align: center !important; font-size: 9px; padding: 3px; }
    .pay-header { background: #e6f4ea !important; color: #1a7f37; }
    .ded-header { background: #fce8e6 !important; color: #c62828; }
    .sub-header th, .sub-header td { background: #fafafa; font-weight: bold; font-size: 8px; }
    .item-name { text-align: left !important; }
    .item-amount { text-align: right !important; }
    .item-amount.ded { color: #c62828; }
    .total-row td { border-top: 2px solid #333; font-weight: bold; font-size: 10px; }
    .total-amount { text-align: right !important; }
    .pay-total { color: #1a7f37; }
    .ded-total { color: #c62828; }
    .net-row td { border-top: none; }
    .net-label { text-align: right !important; font-size: 10px; font-weight: bold; }
    .calc-table { width: 100%; border-collapse: collapse; border-top: 2px solid #333; }
    .calc-table td, .calc-table th {
      border: 1px solid #aaa; padding: 3px 5px; font-size: 9px; text-align: center;
    }
    .calc-formula { text-align: left !important; font-size: 8px; color: #555; }
    .net-amount { text-align: right !important; font-size: 12px; font-weight: bold; color: #1565c0; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      @page { size: A4 portrait; margin: 8mm; }
      .emp-block { page-break-inside: avoid; }
    }
  `;

  const handlePrint = () => {
    const targetRecords = getTargetRecords();
    const sanitizedMonth = DOMPurify.sanitize(month);
    const companyName = DOMPurify.sanitize(currentOrganization?.name || "회사명");

    const blocksHtml = targetRecords.map((r, i) => generateEmployeeBlockHtml(r, i)).join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html><html><head><title>임금대장 - ${sanitizedMonth}</title>
      <style>${getPrintStyles()}</style></head><body>
      <h2>임금대장</h2>
      <p class="legal-note">근로기준법 제48조에 따른 임금대장</p>
      <div class="meta"><span>회사명: ${companyName}</span><span>기준월: ${sanitizedMonth}</span></div>
      ${blocksHtml}
    </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  const handlePdfExport = () => {
    const targetRecords = getTargetRecords();
    const sanitizedMonth = DOMPurify.sanitize(month);
    const companyName = DOMPurify.sanitize(currentOrganization?.name || "회사명");

    const blocksHtml = targetRecords.map((r, i) => generateEmployeeBlockHtml(r, i)).join("");

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <style>${getPrintStyles()}</style>
      <h2>임금대장</h2>
      <p class="legal-note">근로기준법 제48조에 따른 임금대장</p>
      <div class="meta"><span>회사명: ${companyName}</span><span>기준월: ${sanitizedMonth}</span></div>
      ${blocksHtml}
    `;

    const safMonth = month.replace(/[^0-9-]/g, "");
    html2pdf()
      .set({
        margin: 8,
        filename: `임금대장_${safMonth}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css"] },
      })
      .from(wrapper)
      .save();
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div>
              <span>임금대장 - {month}</span>
              <p className="text-xs font-normal text-muted-foreground mt-0.5">근로기준법 제48조에 따른 임금대장</p>
            </div>
            <div className="flex gap-2">
  <Button variant="outline" size="sm" onClick={handlePdfExport}>
    <FileDown className="w-4 h-4 mr-2" />
    PDF
  </Button>
  <Button variant="outline" size="sm" onClick={handlePrint}>
    <Printer className="w-4 h-4 mr-2" />
    {selectedIds.length > 0 ? `선택 출력 (${selectedIds.length})` : "일괄 출력"}
  </Button>
</div>
          </DialogTitle>
        </DialogHeader>

        <div id="payroll-ledger-print">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-center text-base font-bold mb-1">임금대장</h1>
              <p className="text-center text-xs text-muted-foreground">기준월: {month}</p>
            </div>
            {dailyPayrollSummaries.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="include-daily"
                  checked={includeDailyWorkers}
                  onCheckedChange={(c) => setIncludeDailyWorkers(!!c)}
                />
                <Label htmlFor="include-daily" className="text-xs cursor-pointer">
                  일용직 포함하기 ({dailyPayrollSummaries.length}명)
                </Label>
              </div>
            )}
          </div>

          <Table className="text-[10px]">
            <TableHeader>
              {/* 그룹 헤더 행 */}
              <TableRow>
                <TableHead rowSpan={2} className="w-10 align-middle">
                  <Checkbox
                    checked={payrollData.length > 0 && selectedIds.length === payrollData.length}
                    onCheckedChange={(checked) => handleSelectAll(checked as boolean)}
                  />
                </TableHead>
                <TableHead rowSpan={2} className="text-center px-1 py-0.5 text-[10px] align-middle">
                  No
                </TableHead>
                <TableHead rowSpan={2} className="text-center px-1 py-0.5 text-[10px] align-middle">
                  사번
                </TableHead>
                <TableHead rowSpan={2} className="text-center px-1 py-0.5 text-[10px] align-middle">
                  성명
                </TableHead>
                <TableHead rowSpan={2} className="text-center px-1 py-0.5 text-[10px] align-middle">
                  부서
                </TableHead>
                <TableHead colSpan={4} className="text-center px-1 py-0.5 text-[10px] bg-muted/50 border-b">
  근태
</TableHead>
                <TableHead
                  colSpan={6}
                  className="text-center px-1 py-0.5 text-[10px] bg-blue-50 dark:bg-blue-950/30 border-b"
                >
                  근로시간
                </TableHead>
                <TableHead
                  colSpan={activePaymentItems.length + 1}
                  className="text-center px-1 py-0.5 text-[10px] bg-green-50 dark:bg-green-950/30 border-b font-bold"
                >
                  지급내역
                </TableHead>
                <TableHead
                  colSpan={activeDeductionItems.length + 1}
                  className="text-center px-1 py-0.5 text-[10px] bg-red-50 dark:bg-red-950/30 border-b font-bold"
                >
                  공제내역
                </TableHead>
                <TableHead
                  rowSpan={2}
                  className="text-right px-1 py-0.5 text-[10px] bg-yellow-50 dark:bg-yellow-950/30 align-middle font-bold"
                >
                  실지급액
                </TableHead>
                <TableHead rowSpan={2} className="text-center px-1 py-0.5 text-[10px] align-middle">
                  비고
                </TableHead>
              </TableRow>
              {/* 상세 헤더 행 */}
              <TableRow>
                <TableHead className="text-center px-1 py-0.5 text-[10px] bg-muted/50">출근</TableHead>
<TableHead className="text-center px-1 py-0.5 text-[10px] bg-muted/50">지각</TableHead>
<TableHead className="text-center px-1 py-0.5 text-[10px] bg-muted/50">조퇴</TableHead>
<TableHead className="text-center px-1 py-0.5 text-[10px] bg-muted/50">결근</TableHead>
                <TableHead className="text-center px-1 py-0.5 text-[10px] bg-blue-50 dark:bg-blue-950/30 whitespace-nowrap">
                  총근로
                </TableHead>
                <TableHead className="text-center px-1 py-0.5 text-[10px] bg-blue-50 dark:bg-blue-950/30 whitespace-nowrap">
                  정규
                </TableHead>
                <TableHead className="text-center px-1 py-0.5 text-[10px] bg-blue-50 dark:bg-blue-950/30 whitespace-nowrap">
                  연장
                </TableHead>
                <TableHead className="text-center px-1 py-0.5 text-[10px] bg-blue-50 dark:bg-blue-950/30 whitespace-nowrap">
                  야간
                </TableHead>
                <TableHead className="text-center px-1 py-0.5 text-[10px] bg-blue-50 dark:bg-blue-950/30 whitespace-nowrap">
                  야간교대근로
                </TableHead>
                <TableHead className="text-center px-1 py-0.5 text-[10px] bg-blue-50 dark:bg-blue-950/30 whitespace-nowrap">
                  휴일근로
                </TableHead>
                {activePaymentItems.map((item) => (
  <TableHead
    key={item.id}
    className="text-right px-1 py-0.5 text-[10px] bg-green-50 dark:bg-green-950/30 whitespace-nowrap"
  >
    {getDisplayPaymentItemName(item.name)}
  </TableHead>
))}
                <TableHead className="text-right px-1 py-0.5 text-[10px] bg-green-100 dark:bg-green-900/40 whitespace-nowrap font-bold">
                  지급합계
                </TableHead>
                {activeDeductionItems.map((item) => (
                  <TableHead
                    key={item.id}
                    className="text-right px-1 py-0.5 text-[10px] bg-red-50 dark:bg-red-950/30 whitespace-nowrap"
                  >
                    {item.name}
                  </TableHead>
                ))}
                <TableHead className="text-right px-1 py-0.5 text-[10px] bg-red-100 dark:bg-red-900/40 whitespace-nowrap font-bold">
                  공제합계
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollData.map((record, index) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(record.id)}
                      onCheckedChange={(checked) => handleSelectRecord(record.id, checked as boolean)}
                    />
                  </TableCell>
                  <TableCell className="text-center px-1 py-1">{index + 1}</TableCell>
                  <TableCell className="text-center px-1 py-1">{record.employeeNumber}</TableCell>
                  <TableCell className="text-center px-1 py-1">{record.employeeName}</TableCell>
                  <TableCell className="text-center px-1 py-1">{record.department}</TableCell>
                  <TableCell className="text-center px-1 py-1">{record.presentDays + record.lateDays}</TableCell>
<TableCell className="text-center px-1 py-1">
  {(record as any).actualLateMinutes ? `${(record as any).actualLateMinutes}분` : "0분"}
</TableCell>
<TableCell className="text-center px-1 py-1">
  {(record as any).actualEarlyLeaveMinutes ? `${(record as any).actualEarlyLeaveMinutes}분` : "0분"}
</TableCell>
<TableCell className="text-center px-1 py-1">{record.absentDays}</TableCell>
                  <TableCell className="text-center px-1 py-1 bg-blue-50/50 dark:bg-blue-950/20 whitespace-nowrap">
                    {formatMinutesToHM(record.totalWorkMinutes || 0)}
                  </TableCell>
                  <TableCell className="text-center px-1 py-1 bg-blue-50/50 dark:bg-blue-950/20 whitespace-nowrap">
                    {formatMinutesToHM(record.regularWorkMinutes || 0)}
                  </TableCell>
                  <TableCell className="text-center px-1 py-1 bg-blue-50/50 dark:bg-blue-950/20 whitespace-nowrap">
                    {formatMinutesToHM(record.overtimeMinutes || 0)}
                  </TableCell>
                  <TableCell className="text-center px-1 py-1 bg-blue-50/50 dark:bg-blue-950/20 whitespace-nowrap">
                    {formatMinutesToHM(record.nightWorkMinutes || 0)}
                  </TableCell>
                  <TableCell className="text-center px-1 py-1 bg-blue-50/50 dark:bg-blue-950/20 whitespace-nowrap">
                    {formatMinutesToHM(getDisplayNightShiftMinutes(record))}
                  </TableCell>
                  <TableCell className="text-center px-1 py-1 bg-blue-50/50 dark:bg-blue-950/20 whitespace-nowrap">
                    {formatMinutesToHM(record.holidayWorkMinutes || 0)}
                  </TableCell>
                  {activePaymentItems.map((item) => (
                    <TableCell key={item.id} className="text-right px-1 py-1 whitespace-nowrap">
                      {formatCurrency(getPaymentItemValue(record, item.id))}
                    </TableCell>
                  ))}
                  <TableCell className="text-right px-1 py-1 whitespace-nowrap font-bold bg-green-50/50 dark:bg-green-950/20">
                    {formatCurrency(getPaymentTotal(record))}
                  </TableCell>
                  {activeDeductionItems.map((item) => (
                    <TableCell key={item.id} className="text-right px-1 py-1 text-destructive whitespace-nowrap">
                      {formatCurrency(getDeductionItemValue(record, item.id))}
                    </TableCell>
                  ))}
                  <TableCell className="text-right px-1 py-1 whitespace-nowrap font-bold text-destructive bg-red-50/50 dark:bg-red-950/20">
                    {formatCurrency(getDeductionTotal(record))}
                  </TableCell>
                  <TableCell className="text-right px-1 py-1 font-semibold whitespace-nowrap">
                    {formatCurrency(record.netSalary)}
                  </TableCell>
                  <TableCell className="text-center px-1 py-1 whitespace-nowrap text-[9px] text-muted-foreground">
                    {getRemarkText(record)}
                  </TableCell>
                </TableRow>
              ))}

              {/* 일용직 데이터 (확정분만) */}
              {includeDailyWorkers &&
                dailyPayrollSummaries.map((ds, i) => (
                  <TableRow key={`daily-${ds.employeeId}`} className="bg-accent/30">
                    <TableCell />
                    <TableCell className="text-center px-1 py-1">{payrollData.length + i + 1}</TableCell>
                    <TableCell className="text-center px-1 py-1">{ds.employeeNumber}</TableCell>
                    <TableCell className="text-center px-1 py-1">
                      {ds.employeeName}
                      <span className="ml-1 text-[9px] text-muted-foreground">(일용)</span>
                    </TableCell>
                    <TableCell className="text-center px-1 py-1">{ds.department}</TableCell>
                    <TableCell className="text-center px-1 py-1">{ds.workDays}</TableCell>
<TableCell className="text-center px-1 py-1">-</TableCell>
<TableCell className="text-center px-1 py-1">-</TableCell>
<TableCell className="text-center px-1 py-1">-</TableCell>
<TableCell className="text-center px-1 py-1">-</TableCell>
                    <TableCell className="text-center px-1 py-1">-</TableCell>
                    <TableCell className="text-center px-1 py-1">-</TableCell>
                    <TableCell className="text-center px-1 py-1">-</TableCell>
                    <TableCell className="text-center px-1 py-1">-</TableCell>
                    <TableCell className="text-center px-1 py-1">-</TableCell>
                    {activePaymentItems.map((item, idx) => (
                      <TableCell key={item.id} className="text-right px-1 py-1 whitespace-nowrap">
                        {idx === 0 ? formatCurrency(ds.totalWage) : "-"}
                      </TableCell>
                    ))}
                    <TableCell className="text-right px-1 py-1 whitespace-nowrap font-bold bg-green-50/50 dark:bg-green-950/20">
                      {formatCurrency(ds.totalWage)}
                    </TableCell>
                    {activeDeductionItems.map((item, idx) => (
                      <TableCell key={item.id} className="text-right px-1 py-1 text-destructive whitespace-nowrap">
                        {idx === 0 ? formatCurrency(ds.totalDeductions) : "-"}
                      </TableCell>
                    ))}
                    <TableCell className="text-right px-1 py-1 whitespace-nowrap font-bold text-destructive bg-red-50/50 dark:bg-red-950/20">
                      {formatCurrency(ds.totalDeductions)}
                    </TableCell>
                    <TableCell className="text-right px-1 py-1 font-semibold whitespace-nowrap">
                      {formatCurrency(ds.netPay)}
                    </TableCell>
                    <TableCell className="text-center px-1 py-1 whitespace-nowrap text-[9px] text-muted-foreground">
                      {(() => {
                        const emp = employees.find((e) => e.id === ds.employeeId);
                        if (emp?.payType === "daily" && emp.dailyRate)
                          return `일급 ${new Intl.NumberFormat("ko-KR").format(emp.dailyRate)}원`;
                        if (emp?.payType === "hourly" && emp.hourlyRate)
                          return `시급 ${new Intl.NumberFormat("ko-KR").format(emp.hourlyRate)}원`;
                        return "";
                      })()}
                    </TableCell>
                  </TableRow>
                ))}

              <TableRow className="bg-muted font-semibold">
                <TableCell />
                <TableCell colSpan={8} className="text-center">
                  합계
                  {includeDailyWorkers && dailyPayrollSummaries.length > 0 && (
                    <span className="text-[10px] font-normal text-muted-foreground ml-1">(일용직 포함)</span>
                  )}
                </TableCell>
                <TableCell className="text-center px-1 py-1 whitespace-nowrap">
                  {formatMinutesToHM(totalWorkMinutesSum)}
                </TableCell>
                <TableCell className="text-center px-1 py-1 whitespace-nowrap">
                  {formatMinutesToHM(regularWorkMinutesSum)}
                </TableCell>
                <TableCell className="text-center px-1 py-1 whitespace-nowrap">
                  {formatMinutesToHM(overtimeMinutesSum)}
                </TableCell>
                <TableCell className="text-center px-1 py-1 whitespace-nowrap">
                  {formatMinutesToHM(nightWorkMinutesSum)}
                </TableCell>
                <TableCell className="text-center px-1 py-1 whitespace-nowrap">
                  {formatMinutesToHM(nightShiftMinutesSum)}
                </TableCell>
                <TableCell className="text-center px-1 py-1 whitespace-nowrap">
                  {formatMinutesToHM(holidayWorkMinutesSum)}
                </TableCell>
                {paymentItemTotals.map((item, idx) => {
                  const dailyExtra =
                    includeDailyWorkers && idx === 0 ? dailyPayrollSummaries.reduce((s, d) => s + d.totalWage, 0) : 0;
                  return (
                    <TableCell key={item.id} className="text-right px-1 py-1 whitespace-nowrap">
                      {formatCurrency(item.total + dailyExtra)}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right px-1 py-1 whitespace-nowrap font-bold bg-green-50/50 dark:bg-green-950/20">
                  {formatCurrency(
                    totalStats.paymentTotal +
                      (includeDailyWorkers ? dailyPayrollSummaries.reduce((s, d) => s + d.totalWage, 0) : 0),
                  )}
                </TableCell>
                {deductionItemTotals.map((item, idx) => {
                  const dailyExtra =
                    includeDailyWorkers && idx === 0
                      ? dailyPayrollSummaries.reduce((s, d) => s + d.totalDeductions, 0)
                      : 0;
                  return (
                    <TableCell key={item.id} className="text-right px-1 py-1 text-destructive whitespace-nowrap">
                      {formatCurrency(item.total + dailyExtra)}
                    </TableCell>
                  );
                })}
                <TableCell className="text-right px-1 py-1 whitespace-nowrap font-bold text-destructive bg-red-50/50 dark:bg-red-950/20">
                  {formatCurrency(
                    totalStats.deductionTotal +
                      (includeDailyWorkers ? dailyPayrollSummaries.reduce((s, d) => s + d.totalDeductions, 0) : 0),
                  )}
                </TableCell>
                <TableCell className="text-right px-1 py-1 whitespace-nowrap">
                  {formatCurrency(
                    totalStats.netSalary +
                      (includeDailyWorkers ? dailyPayrollSummaries.reduce((s, d) => s + d.netPay, 0) : 0),
                  )}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
