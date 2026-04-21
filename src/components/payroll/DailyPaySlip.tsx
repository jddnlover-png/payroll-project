import { useState } from 'react';
import DOMPurify from 'dompurify';
import html2pdf from 'html2pdf.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Printer, ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);

const formatTime = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}시간 ${m}분`;
};

interface DailyPayrollRecord {
  id: string;
  employee_id: string;
  work_date: string;
  work_minutes: number;
  stay_minutes: number;
  break_minutes: number;
  policy_deduction_minutes: number;
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
    position: string | null;
    bank_name: string | null;
    account_number: string | null;
    pay_type: string;
    daily_rate: number | null;
    hourly_rate: number | null;
  };
}

interface DailyPaySlipProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: DailyPayrollRecord | null;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

export function DailyPaySlip({
  open, onOpenChange, record,
  onPrevious, onNext, hasPrevious, hasNext,
}: DailyPaySlipProps) {
  const { currentOrganization } = useOrganization();

  if (!record || !record.employee) return null;

  const emp = record.employee;
  const companyName = currentOrganization?.name || '회사명';

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const s = DOMPurify.sanitize;

    // 지급 항목 구성
    const paymentRows = [
      { name: emp.pay_type === 'hourly' ? '시급 기준' : '일당', amount: record.base_daily_wage },
      ...(record.overtime_pay > 0 ? [{ name: '연장근로수당', amount: record.overtime_pay }] : []),
      ...(record.night_pay > 0 ? [{ name: '야간근로수당', amount: record.night_pay }] : []),
    ];

    const deductionRows = [
      ...(record.income_tax > 0 ? [{ name: '소득세', amount: record.income_tax }] : []),
      ...(record.local_income_tax > 0 ? [{ name: '지방소득세', amount: record.local_income_tax }] : []),
      ...(record.employment_insurance > 0 ? [{ name: '고용보험', amount: record.employment_insurance }] : []),
      ...(record.national_pension > 0 ? [{ name: '국민연금', amount: record.national_pension }] : []),
      ...(record.health_insurance > 0 ? [{ name: '건강보험', amount: record.health_insurance }] : []),
    ];

    const payHtml = paymentRows.map(r => `<tr><td>${s(r.name)}</td><td>${formatCurrency(r.amount)}</td></tr>`).join('');
    const dedHtml = deductionRows.map(r => `<tr><td>${s(r.name)}</td><td class="text-red">-${formatCurrency(r.amount)}</td></tr>`).join('');

    printWindow.document.write(`<!DOCTYPE html><html><head>
      <title>일용직 급여명세서 - ${s(emp.name)}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: A4; margin: 10mm; }
        body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; padding: 15px; background: #fff; color: #333; line-height: 1.3; font-size: 11px; }
        .header { text-align: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #2563eb; }
        .company-name { font-size: 11px; color: #666; margin-bottom: 4px; }
        .title { font-size: 18px; font-weight: bold; color: #1e40af; margin-bottom: 4px; }
        .subtitle { font-size: 12px; color: #666; background: #f1f5f9; display: inline-block; padding: 2px 12px; border-radius: 10px; }
        .content-wrapper { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .section { margin-bottom: 10px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
        .section-header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 6px 10px; font-weight: bold; font-size: 11px; }
        .section-header.payment { background: linear-gradient(135deg, #10b981, #059669); }
        .section-header.deduction { background: linear-gradient(135deg, #ef4444, #dc2626); }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 4px 8px; border-bottom: 1px solid #f1f5f9; font-size: 10px; }
        td:first-child { color: #64748b; width: 50%; }
        td:last-child { text-align: right; font-weight: 600; color: #1e293b; }
        tr:last-child td { border-bottom: none; }
        .text-red { color: #dc2626; }
        .total-row { background: #f8fafc; font-weight: bold; }
        .total-row td:first-child { color: #1e293b; }
        .net-salary { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; border-radius: 6px; padding: 12px; text-align: center; margin-bottom: 10px; }
        .net-salary-label { font-size: 11px; opacity: 0.9; margin-bottom: 4px; }
        .net-salary-amount { font-size: 20px; font-weight: bold; }
        .footer { text-align: center; color: #94a3b8; font-size: 9px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
        .full-width { grid-column: 1 / -1; }
        @media print { body { padding: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; } .section { break-inside: avoid; } }
      </style></head><body>
      <div class="header">
        <div class="company-name">${s(companyName)}</div>
        <div class="title">일용직 급여명세서</div>
        <div class="subtitle">${s(record.work_date)}</div>
      </div>
      <div class="content-wrapper">
        <div class="section">
          <div class="section-header">📋 직원 정보</div>
          <table>
            <tr><td>성명</td><td>${s(emp.name)}</td></tr>
            <tr><td>사원번호</td><td>${s(emp.employee_number)}</td></tr>
            <tr><td>부서</td><td>${s(emp.department || '-')}</td></tr>
            <tr><td>직급</td><td>${s(emp.position || '-')}</td></tr>
            <tr><td>급여계좌</td><td>${s(emp.bank_name ? `${emp.bank_name} ${emp.account_number || ''}` : '-')}</td></tr>
            <tr><td>정산방식</td><td>${record.settlement_type === 'business_income_3_3' ? '사업소득(3.3%)' : '근로소득(일용직)'}</td></tr>
          </table>
        </div>
        <div class="section">
          <div class="section-header">⏰ 근무 현황</div>
          <table>
            <tr><td>체류시간</td><td>${formatTime(record.stay_minutes)}</td></tr>
            <tr><td>휴게시간</td><td>${record.break_minutes}분</td></tr>
            <tr><td>정책차감</td><td>${record.policy_deduction_minutes}분</td></tr>
            <tr><td>인정근무</td><td>${formatTime(record.work_minutes)}</td></tr>
            ${record.overtime_minutes > 0 ? `<tr><td>초과근무</td><td>${formatTime(record.overtime_minutes)}</td></tr>` : ''}
            ${record.night_minutes > 0 ? `<tr><td>야간근무</td><td>${formatTime(record.night_minutes)}</td></tr>` : ''}
          </table>
        </div>
        <div class="section">
          <div class="section-header payment">💰 지급 내역</div>
          <table>
            ${payHtml}
            <tr class="total-row"><td>지급액 합계</td><td>${formatCurrency(record.total_wage)}</td></tr>
          </table>
        </div>
        <div class="section">
          <div class="section-header deduction">📉 공제 내역</div>
          <table>
            ${dedHtml.length > 0 ? dedHtml : '<tr><td>공제 없음</td><td>₩0</td></tr>'}
            <tr class="total-row"><td>공제액 합계</td><td class="text-red">-${formatCurrency(record.total_deductions)}</td></tr>
          </table>
        </div>
      </div>
      <div class="net-salary">
        <div class="net-salary-label">실지급액</div>
        <div class="net-salary-amount">${formatCurrency(record.net_pay)}</div>
      </div>
      <div class="footer">
        <p>본 명세서는 ${s(record.work_date)} 근무분 급여입니다.</p>
        <p style="margin-top: 8px;">${s(companyName)} | 발급일: ${new Date().toLocaleDateString('ko-KR')}</p>
      </div>
    </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  const handlePdfExport = () => {
    const s = DOMPurify.sanitize;
    const paymentRows = [
      { name: emp.pay_type === 'hourly' ? '시급 기준' : '일당', amount: record.base_daily_wage },
      ...(record.overtime_pay > 0 ? [{ name: '연장근로수당', amount: record.overtime_pay }] : []),
      ...(record.night_pay > 0 ? [{ name: '야간근로수당', amount: record.night_pay }] : []),
    ];
    const deductionRows = [
      ...(record.income_tax > 0 ? [{ name: '소득세', amount: record.income_tax }] : []),
      ...(record.local_income_tax > 0 ? [{ name: '지방소득세', amount: record.local_income_tax }] : []),
      ...(record.employment_insurance > 0 ? [{ name: '고용보험', amount: record.employment_insurance }] : []),
      ...(record.national_pension > 0 ? [{ name: '국민연금', amount: record.national_pension }] : []),
      ...(record.health_insurance > 0 ? [{ name: '건강보험', amount: record.health_insurance }] : []),
    ];
    const payHtml = paymentRows.map(r => `<tr><td>${s(r.name)}</td><td>${formatCurrency(r.amount)}</td></tr>`).join('');
    const dedHtml = deductionRows.map(r => `<tr><td>${s(r.name)}</td><td class="text-red">-${formatCurrency(r.amount)}</td></tr>`).join('');

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body, div { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #333; line-height: 1.3; font-size: 11px; }
        .header { text-align: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #2563eb; }
        .company-name { font-size: 11px; color: #666; margin-bottom: 4px; }
        .title { font-size: 18px; font-weight: bold; color: #1e40af; margin-bottom: 4px; }
        .subtitle { font-size: 12px; color: #666; background: #f1f5f9; display: inline-block; padding: 2px 12px; border-radius: 10px; }
        .content-wrapper { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .section { margin-bottom: 10px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
        .section-header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 6px 10px; font-weight: bold; font-size: 11px; }
        .section-header.payment { background: linear-gradient(135deg, #10b981, #059669); }
        .section-header.deduction { background: linear-gradient(135deg, #ef4444, #dc2626); }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 4px 8px; border-bottom: 1px solid #f1f5f9; font-size: 10px; }
        td:first-child { color: #64748b; width: 50%; }
        td:last-child { text-align: right; font-weight: 600; color: #1e293b; }
        .text-red { color: #dc2626; }
        .total-row { background: #f8fafc; font-weight: bold; }
        .total-row td:first-child { color: #1e293b; }
        .net-salary { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; border-radius: 6px; padding: 12px; text-align: center; margin-bottom: 10px; }
        .net-salary-label { font-size: 11px; opacity: 0.9; margin-bottom: 4px; }
        .net-salary-amount { font-size: 20px; font-weight: bold; }
        .footer { text-align: center; color: #94a3b8; font-size: 9px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
      </style>
      <div class="header">
        <div class="company-name">${s(companyName)}</div>
        <div class="title">일용직 급여명세서</div>
        <div class="subtitle">${s(record.work_date)}</div>
      </div>
      <div class="content-wrapper">
        <div class="section"><div class="section-header">📋 직원 정보</div><table>
          <tr><td>성명</td><td>${s(emp.name)}</td></tr>
          <tr><td>사원번호</td><td>${s(emp.employee_number)}</td></tr>
          <tr><td>부서</td><td>${s(emp.department || '-')}</td></tr>
          <tr><td>정산방식</td><td>${record.settlement_type === 'business_income_3_3' ? '사업소득(3.3%)' : '근로소득(일용직)'}</td></tr>
        </table></div>
        <div class="section"><div class="section-header">⏰ 근무 현황</div><table>
          <tr><td>인정근무</td><td>${formatTime(record.work_minutes)}</td></tr>
          ${record.overtime_minutes > 0 ? `<tr><td>초과근무</td><td>${formatTime(record.overtime_minutes)}</td></tr>` : ''}
          ${record.night_minutes > 0 ? `<tr><td>야간근무</td><td>${formatTime(record.night_minutes)}</td></tr>` : ''}
        </table></div>
        <div class="section"><div class="section-header payment">💰 지급 내역</div><table>
          ${payHtml}
          <tr class="total-row"><td>지급액 합계</td><td>${formatCurrency(record.total_wage)}</td></tr>
        </table></div>
        <div class="section"><div class="section-header deduction">📉 공제 내역</div><table>
          ${dedHtml.length > 0 ? dedHtml : '<tr><td>공제 없음</td><td>₩0</td></tr>'}
          <tr class="total-row"><td>공제액 합계</td><td class="text-red">-${formatCurrency(record.total_deductions)}</td></tr>
        </table></div>
      </div>
      <div class="net-salary"><div class="net-salary-label">실지급액</div><div class="net-salary-amount">${formatCurrency(record.net_pay)}</div></div>
      <div class="footer"><p>본 명세서는 ${s(record.work_date)} 근무분 급여입니다.</p><p style="margin-top:8px">${s(companyName)} | 발급일: ${new Date().toLocaleDateString('ko-KR')}</p></div>
    `;

    const safeName = emp.name.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    html2pdf().set({
      margin: 10,
      filename: `일용직급여명세서_${safeName}_${record.work_date}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(wrapper).save();
  };

  // 지급 항목
  const paymentItems = [
    { name: emp.pay_type === 'hourly' ? '시급 기준' : '일당', amount: record.base_daily_wage },
    ...(record.overtime_pay > 0 ? [{ name: '연장근로수당', amount: record.overtime_pay }] : []),
    ...(record.night_pay > 0 ? [{ name: '야간근로수당', amount: record.night_pay }] : []),
  ];

  const deductionItems = [
    ...(record.income_tax > 0 ? [{ name: '소득세', amount: record.income_tax }] : []),
    ...(record.local_income_tax > 0 ? [{ name: '지방소득세', amount: record.local_income_tax }] : []),
    ...(record.employment_insurance > 0 ? [{ name: '고용보험', amount: record.employment_insurance }] : []),
    ...(record.national_pension > 0 ? [{ name: '국민연금', amount: record.national_pension }] : []),
    ...(record.health_insurance > 0 ? [{ name: '건강보험', amount: record.health_insurance }] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasPrevious && (
                <Button variant="ghost" size="icon" onClick={onPrevious}><ChevronLeft className="w-4 h-4" /></Button>
              )}
              <span>일용직 급여명세서</span>
              {hasNext && (
                <Button variant="ghost" size="icon" onClick={onNext}><ChevronRight className="w-4 h-4" /></Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePdfExport}>
                <FileDown className="w-4 h-4 mr-2" />PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />출력
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* 직원 정보 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">직원 정보</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">성명</span><span className="font-medium">{emp.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">사원번호</span><span className="font-medium">{emp.employee_number}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">부서</span><span className="font-medium">{emp.department || '-'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">근무일</span><span className="font-medium">{record.work_date}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">정산방식</span>
              <span className="font-medium">{record.settlement_type === 'business_income_3_3' ? '사업소득(3.3%)' : '근로소득'}</span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">급여계좌</span>
              <span className="font-medium">{emp.bank_name ? `${emp.bank_name} ${emp.account_number || ''}` : '-'}</span>
            </div>
          </CardContent>
        </Card>

        {/* 근무 현황 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">근무 현황</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">체류시간</span><span>{formatTime(record.stay_minutes)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">휴게시간</span><span>{record.break_minutes}분</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">인정근무</span><span className="font-medium text-primary">{formatTime(record.work_minutes)}</span></div>
            {record.overtime_minutes > 0 && <div className="flex justify-between"><span className="text-muted-foreground">초과근무</span><span>{formatTime(record.overtime_minutes)}</span></div>}
            {record.night_minutes > 0 && <div className="flex justify-between"><span className="text-muted-foreground">야간근무</span><span>{formatTime(record.night_minutes)}</span></div>}
          </CardContent>
        </Card>

        {/* 지급 내역 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-green-600">💰 지급 내역</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {paymentItems.map((item, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-muted-foreground">{item.name}</span>
                <span className="font-medium">{formatCurrency(item.amount)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between font-bold">
              <span>지급액 합계</span><span>{formatCurrency(record.total_wage)}</span>
            </div>
          </CardContent>
        </Card>

        {/* 공제 내역 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-destructive">📉 공제 내역</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {deductionItems.length > 0 ? deductionItems.map((item, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-muted-foreground">{item.name}</span>
                <span className="text-destructive">-{formatCurrency(item.amount)}</span>
              </div>
            )) : (
              <div className="text-muted-foreground">공제 없음</div>
            )}
            <Separator />
            <div className="flex justify-between font-bold">
              <span>공제액 합계</span><span className="text-destructive">-{formatCurrency(record.total_deductions)}</span>
            </div>
          </CardContent>
        </Card>

        {/* 실지급액 */}
        <div className="bg-primary text-primary-foreground rounded-lg p-4 text-center">
          <div className="text-sm opacity-90">실지급액</div>
          <div className="text-2xl font-bold">{formatCurrency(record.net_pay)}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
