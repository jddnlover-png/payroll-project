import { useState } from 'react';
import DOMPurify from 'dompurify';
import html2pdf from 'html2pdf.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Printer, FileDown } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);

const formatTime = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
};

interface DailyPayrollRecord {
  id: string;
  employee_id: string;
  work_date: string;
  work_minutes: number;
  overtime_minutes: number;
  night_minutes: number;
  base_daily_wage: number;
  overtime_pay: number;
  night_pay: number;
  total_wage: number;
  settlement_type: string;
  income_tax: number;
  local_income_tax: number;
  employment_insurance: number;
  national_pension: number;
  health_insurance: number;
  total_deductions: number;
  net_pay: number;
  status: string;
  employee?: {
    name: string;
    employee_number: string;
    department: string | null;
  };
}

interface DailyPayrollLedgerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: DailyPayrollRecord[];
  month: string;
}

export function DailyPayrollLedger({ open, onOpenChange, records, month }: DailyPayrollLedgerProps) {
  const { currentOrganization } = useOrganization();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 확정된 레코드만
  const confirmedRecords = records.filter(r => r.status === 'confirmed');

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? confirmedRecords.map(r => r.id) : []);
  };

  const getTargetRecords = () =>
    selectedIds.length > 0 ? confirmedRecords.filter(r => selectedIds.includes(r.id)) : confirmedRecords;

  const totals = {
    workMinutes: confirmedRecords.reduce((s, r) => s + r.work_minutes, 0),
    baseDailyWage: confirmedRecords.reduce((s, r) => s + r.base_daily_wage, 0),
    overtimePay: confirmedRecords.reduce((s, r) => s + r.overtime_pay, 0),
    nightPay: confirmedRecords.reduce((s, r) => s + r.night_pay, 0),
    totalWage: confirmedRecords.reduce((s, r) => s + r.total_wage, 0),
    incomeTax: confirmedRecords.reduce((s, r) => s + r.income_tax, 0),
    localIncomeTax: confirmedRecords.reduce((s, r) => s + r.local_income_tax, 0),
    employmentInsurance: confirmedRecords.reduce((s, r) => s + r.employment_insurance, 0),
    nationalPension: confirmedRecords.reduce((s, r) => s + r.national_pension, 0),
    healthInsurance: confirmedRecords.reduce((s, r) => s + r.health_insurance, 0),
    totalDeductions: confirmedRecords.reduce((s, r) => s + r.total_deductions, 0),
    netPay: confirmedRecords.reduce((s, r) => s + r.net_pay, 0),
  };

  const handlePrint = () => {
    const targetRecords = getTargetRecords();
    const s = DOMPurify.sanitize;
    const companyName = s(currentOrganization?.name || '회사명');

    const headerCols = ['No', '날짜', '사원번호', '성명', '부서', '근무시간', '일당/시급', '초과수당', '야간수당', '총지급', '소득세', '지방소득세', '고용보험', '국민연금', '건강보험', '공제합계', '실지급액'];
    const headerHtml = headerCols.map(c => `<th>${c}</th>`).join('');

    const bodyHtml = targetRecords.map((r, i) => {
      const cells = [
        i + 1, s(r.work_date), s(r.employee?.employee_number || ''), s(r.employee?.name || ''),
        s(r.employee?.department || '-'), formatTime(r.work_minutes),
        formatCurrency(r.base_daily_wage), formatCurrency(r.overtime_pay), formatCurrency(r.night_pay),
        formatCurrency(r.total_wage), formatCurrency(r.income_tax), formatCurrency(r.local_income_tax),
        formatCurrency(r.employment_insurance), formatCurrency(r.national_pension), formatCurrency(r.health_insurance),
        formatCurrency(r.total_deductions), formatCurrency(r.net_pay),
      ];
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');

    const tTotals = getTargetRecords();
    const totalCells = [
      '', '', '', '', '', '',
      formatCurrency(tTotals.reduce((s, r) => s + r.base_daily_wage, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.overtime_pay, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.night_pay, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.total_wage, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.income_tax, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.local_income_tax, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.employment_insurance, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.national_pension, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.health_insurance, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.total_deductions, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.net_pay, 0)),
    ];
    const totalHtml = `<tr class="total-row"><td colspan="1">합계</td>${totalCells.map(c => `<td>${c}</td>`).join('')}</tr>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html><html><head><title>일용직 급여대장 - ${s(month)}</title>
      <style>
        body { font-family: 'Malgun Gothic', sans-serif; padding: 20px; }
        h1 { text-align: center; margin-bottom: 5px; }
        p { text-align: center; margin-bottom: 15px; color: #666; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #333; padding: 4px 6px; text-align: center; font-size: 10px; }
        th { background-color: #f0f0f0; font-weight: bold; }
        .total-row { background-color: #e8e8e8; font-weight: bold; }
        @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } @page { size: A4 landscape; margin: 5mm; } }
      </style></head><body>
      <h1>일용직 급여대장</h1>
      <p>${companyName} | 기준월: ${s(month)}</p>
      <table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}${totalHtml}</tbody></table>
    </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  const handlePdfExport = () => {
    const targetRecords = getTargetRecords();
    const s = DOMPurify.sanitize;
    const companyName = s(currentOrganization?.name || '회사명');

    const headerCols = ['No', '날짜', '사원번호', '성명', '부서', '근무시간', '일당/시급', '초과수당', '야간수당', '총지급', '소득세', '지방소득세', '고용보험', '국민연금', '건강보험', '공제합계', '실지급액'];
    const headerHtml = headerCols.map(c => `<th>${c}</th>`).join('');

    const bodyHtml = targetRecords.map((r, i) => {
      const cells = [
        i + 1, s(r.work_date), s(r.employee?.employee_number || ''), s(r.employee?.name || ''),
        s(r.employee?.department || '-'), formatTime(r.work_minutes),
        formatCurrency(r.base_daily_wage), formatCurrency(r.overtime_pay), formatCurrency(r.night_pay),
        formatCurrency(r.total_wage), formatCurrency(r.income_tax), formatCurrency(r.local_income_tax),
        formatCurrency(r.employment_insurance), formatCurrency(r.national_pension), formatCurrency(r.health_insurance),
        formatCurrency(r.total_deductions), formatCurrency(r.net_pay),
      ];
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    }).join('');

    const tTotals = targetRecords;
    const totalCells = [
      '', '', '', '', '', '',
      formatCurrency(tTotals.reduce((s, r) => s + r.base_daily_wage, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.overtime_pay, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.night_pay, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.total_wage, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.income_tax, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.local_income_tax, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.employment_insurance, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.national_pension, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.health_insurance, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.total_deductions, 0)),
      formatCurrency(tTotals.reduce((s, r) => s + r.net_pay, 0)),
    ];
    const totalHtml = `<tr class="total-row"><td colspan="1">합계</td>${totalCells.map(c => `<td>${c}</td>`).join('')}</tr>`;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <style>
        h1 { text-align: center; margin-bottom: 5px; font-size: 18px; }
        p { text-align: center; margin-bottom: 15px; color: #666; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #333; padding: 4px 3px; text-align: center; font-size: 8px; }
        th { background-color: #f0f0f0; font-weight: bold; }
        .total-row { background-color: #e8e8e8; font-weight: bold; }
      </style>
      <h1>일용직 급여대장</h1>
      <p>${companyName} | 기준월: ${s(month)}</p>
      <table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}${totalHtml}</tbody></table>
    `;

    const safeMonth = month.replace(/[^0-9-]/g, '');
    html2pdf().set({
      margin: 5,
      filename: `일용직급여대장_${safeMonth}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
    }).from(wrapper).save();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>일용직 급여대장 - {month}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePdfExport}>
                <FileDown className="w-4 h-4 mr-2" />PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                {selectedIds.length > 0 ? `선택 출력 (${selectedIds.length})` : '일괄 출력'}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {confirmedRecords.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            확정된 급여 기록이 없습니다. 먼저 급여를 확정해주세요.
          </div>
        ) : (
          <Table className="text-[11px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={confirmedRecords.length > 0 && selectedIds.length === confirmedRecords.length}
                    onCheckedChange={(c) => handleSelectAll(c as boolean)}
                  />
                </TableHead>
                <TableHead className="text-center px-1 py-1 text-[11px]">No</TableHead>
                <TableHead className="text-center px-1 py-1 text-[11px]">날짜</TableHead>
                <TableHead className="text-center px-1 py-1 text-[11px]">사원번호</TableHead>
                <TableHead className="text-center px-1 py-1 text-[11px]">성명</TableHead>
                <TableHead className="text-center px-1 py-1 text-[11px]">부서</TableHead>
                <TableHead className="text-center px-1 py-1 text-[11px]">근무시간</TableHead>
                <TableHead className="text-right px-1 py-1 text-[11px]">일당/시급</TableHead>
                <TableHead className="text-right px-1 py-1 text-[11px]">초과수당</TableHead>
                <TableHead className="text-right px-1 py-1 text-[11px]">야간수당</TableHead>
                <TableHead className="text-right px-1 py-1 text-[11px]">총지급</TableHead>
                <TableHead className="text-right px-1 py-1 text-[11px]">소득세</TableHead>
                <TableHead className="text-right px-1 py-1 text-[11px]">지방소득세</TableHead>
                <TableHead className="text-right px-1 py-1 text-[11px]">고용보험</TableHead>
                <TableHead className="text-right px-1 py-1 text-[11px]">국민연금</TableHead>
                <TableHead className="text-right px-1 py-1 text-[11px]">건강보험</TableHead>
                <TableHead className="text-right px-1 py-1 text-[11px]">공제합계</TableHead>
                <TableHead className="text-right px-1 py-1 text-[11px]">실지급액</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {confirmedRecords.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(r.id)}
                      onCheckedChange={(c) => setSelectedIds(prev => c ? [...prev, r.id] : prev.filter(id => id !== r.id))}
                    />
                  </TableCell>
                  <TableCell className="text-center px-1 py-1">{i + 1}</TableCell>
                  <TableCell className="text-center px-1 py-1">{r.work_date}</TableCell>
                  <TableCell className="text-center px-1 py-1">{r.employee?.employee_number}</TableCell>
                  <TableCell className="text-center px-1 py-1">{r.employee?.name}</TableCell>
                  <TableCell className="text-center px-1 py-1">{r.employee?.department || '-'}</TableCell>
                  <TableCell className="text-center px-1 py-1">{formatTime(r.work_minutes)}</TableCell>
                  <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(r.base_daily_wage)}</TableCell>
                  <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(r.overtime_pay)}</TableCell>
                  <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(r.night_pay)}</TableCell>
                  <TableCell className="text-right px-1 py-1 whitespace-nowrap font-medium">{formatCurrency(r.total_wage)}</TableCell>
                  <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(r.income_tax)}</TableCell>
                  <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(r.local_income_tax)}</TableCell>
                  <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(r.employment_insurance)}</TableCell>
                  <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(r.national_pension)}</TableCell>
                  <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(r.health_insurance)}</TableCell>
                  <TableCell className="text-right px-1 py-1 whitespace-nowrap text-destructive">{formatCurrency(r.total_deductions)}</TableCell>
                  <TableCell className="text-right px-1 py-1 whitespace-nowrap font-bold text-primary">{formatCurrency(r.net_pay)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted font-semibold">
                <TableCell />
                <TableCell colSpan={6} className="text-center px-1 py-1">합계</TableCell>
                <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(totals.baseDailyWage)}</TableCell>
                <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(totals.overtimePay)}</TableCell>
                <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(totals.nightPay)}</TableCell>
                <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(totals.totalWage)}</TableCell>
                <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(totals.incomeTax)}</TableCell>
                <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(totals.localIncomeTax)}</TableCell>
                <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(totals.employmentInsurance)}</TableCell>
                <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(totals.nationalPension)}</TableCell>
                <TableCell className="text-right px-1 py-1 whitespace-nowrap">{formatCurrency(totals.healthInsurance)}</TableCell>
                <TableCell className="text-right px-1 py-1 whitespace-nowrap text-destructive">{formatCurrency(totals.totalDeductions)}</TableCell>
                <TableCell className="text-right px-1 py-1 whitespace-nowrap font-bold text-primary">{formatCurrency(totals.netPay)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
