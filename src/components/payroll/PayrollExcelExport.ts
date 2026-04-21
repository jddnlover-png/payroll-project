import ExcelJS from 'exceljs';
import { PayrollRecord, Employee } from '@/types/employee';

interface PayrollItem {
  id: string;
  name: string;
  isActive: boolean;
  type?: string;
}

const formatNumber = (num: number) => Math.round(num);

const formatMinutesToHM = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}시간 ${m}분`;
};

// 임금대장 엑셀 내보내기
export async function exportPayrollLedger(
  payrollData: PayrollRecord[],
  employees: Employee[],
  paymentItems: PayrollItem[],
  deductionItems: PayrollItem[],
  month: string
) {
  const confirmedData = payrollData.filter(r => r.status === 'confirmed' || r.status === 'confirmed_paid');
  if (confirmedData.length === 0) return false;

  // 설정 항목 + 급여 데이터에 있는 모든 항목 병합 (누락 방지)
  const mergeItems = (settingsItems: PayrollItem[], records: PayrollRecord[], type: 'payment' | 'deduction') => {
    const itemMap = new Map<string, { id: string; name: string }>();
    settingsItems.filter(i => i.isActive).forEach(item => itemMap.set(item.id, { id: item.id, name: item.name }));
    records.forEach(record => {
      const items = type === 'payment' ? record.paymentItems : record.deductionItems;
      (items || []).forEach((pi: any) => {
        if (!itemMap.has(pi.itemId)) {
          itemMap.set(pi.itemId, { id: pi.itemId, name: pi.name || pi.itemId });
        }
      });
    });
    return Array.from(itemMap.values());
  };

  const activePayments = mergeItems(paymentItems, confirmedData, 'payment');
  const activeDeductions = mergeItems(deductionItems, confirmedData, 'deduction');

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('임금대장');

  // 총 칼럼 수: No, 사원번호, 성명, 부서, 고용형태, 급여유형, 출근일, 지각, 결근, 총근로시간, 정규근무, 연장근무, 야간근무, 야간교대, payments..., 지급합계, deductions..., 공제합계, 실지급액, 비고
  const totalCols = 14 + activePayments.length + 1 + activeDeductions.length + 1 + 1 + 1;

  // 타이틀
  const titleRow = ws.addRow(['임금대장']);
  titleRow.font = { bold: true, size: 16 };
  ws.mergeCells(1, 1, 1, totalCols);
  titleRow.alignment = { horizontal: 'center' };

  const monthRow = ws.addRow([`기준월: ${month}`]);
  monthRow.alignment = { horizontal: 'center' };
  ws.mergeCells(2, 1, 2, totalCols);

  const legalRow = ws.addRow(['근로기준법 제48조에 따른 임금대장']);
  legalRow.font = { size: 9, italic: true, color: { argb: 'FF888888' } };
  legalRow.alignment = { horizontal: 'center' };
  ws.mergeCells(3, 1, 3, totalCols);

  ws.addRow([]); // blank row

  // 헤더
  const headers = [
    'No', '사원번호', '성명', '부서', '고용형태', '급여유형',
    '출근일', '지각', '결근',
    '총근로시간', '정규근무시간', '연장근무시간', '야간근무시간', '야간교대근로시간',
    ...activePayments.map(i => i.name),
    '지급합계',
    ...activeDeductions.map(i => i.name),
    '공제합계',
    '실지급액',
    '비고',
  ];
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };
  headerRow.eachCell((cell, colNumber) => {
    const payStartCol = 15;
    const payEndCol = payStartCol + activePayments.length; // 지급합계 column
    const dedStartCol = payEndCol + 1;
    const dedEndCol = dedStartCol + activeDeductions.length; // 공제합계 column
    
    let bgColor = 'FFE0E0E0';
    if (colNumber >= payStartCol && colNumber <= payEndCol) bgColor = 'FFE6F4EA';
    if (colNumber >= dedStartCol && colNumber <= dedEndCol) bgColor = 'FFFCE8E6';
    
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });

  // Helper
  const getPayVal = (record: PayrollRecord, itemId: string): number => {
    const ri = record.paymentItems?.find(pi => pi.itemId === itemId);
    if (ri) return ri.amount;
    if (itemId === 'base-salary') return record.baseSalary;
    if (itemId === 'overtime') return record.overtime;
    if (itemId === 'bonus') return record.bonus;
    return 0;
  };
  const getDeductVal = (record: PayrollRecord, itemId: string): number => {
    const ri = record.deductionItems?.find(di => di.itemId === itemId);
    return ri ? ri.amount : 0;
  };

  const getEmploymentTypeLabel = (emp?: Employee) => {
    if (!emp) return '-';
    const map: Record<string, string> = { regular: '정규직', contract: '계약직', daily: '일용직', freelancer: '프리랜서' };
    return map[emp.employmentType] || emp.employmentType;
  };

  const getPayTypeLabel = (emp?: Employee) => {
    if (!emp) return '-';
    const map: Record<string, string> = { monthly: '월급제', hourly: '시급제', daily: '일급제' };
    return map[emp.payType] || emp.payType;
  };

  const getRemarkText = (emp?: Employee): string => {
    if (!emp) return '';
    if (emp.payType === 'daily' && emp.dailyRate) return `일급 ${new Intl.NumberFormat('ko-KR').format(emp.dailyRate)}원`;
    if (emp.payType === 'hourly' && emp.hourlyRate) return `시급 ${new Intl.NumberFormat('ko-KR').format(emp.hourlyRate)}원`;
    return '';
  };

  // Data rows
  confirmedData.forEach((record, idx) => {
    const emp = employees.find(e => e.id === record.employeeId);
    const paymentTotal = activePayments.reduce((s, i) => s + getPayVal(record, i.id), 0);
    const deductionTotal = activeDeductions.reduce((s, i) => s + getDeductVal(record, i.id), 0);
    const row = ws.addRow([
      idx + 1,
      record.employeeNumber,
      record.employeeName,
      record.department,
      getEmploymentTypeLabel(emp),
      getPayTypeLabel(emp),
      record.presentDays + record.lateDays,
      record.lateDays,
      record.absentDays,
      formatMinutesToHM(record.totalWorkMinutes || 0),
      formatMinutesToHM(record.regularWorkMinutes || 0),
      formatMinutesToHM(record.overtimeMinutes || 0),
      formatMinutesToHM(record.nightWorkMinutes || 0),
      formatMinutesToHM(record.nightShiftMinutes || 0),
      ...activePayments.map(i => formatNumber(getPayVal(record, i.id))),
      formatNumber(paymentTotal),
      ...activeDeductions.map(i => formatNumber(getDeductVal(record, i.id))),
      formatNumber(deductionTotal),
      formatNumber(record.netSalary),
      getRemarkText(emp),
    ]);
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    });
  });

  // 합계 row
  const grandPaymentTotal = activePayments.reduce((s, i) => s + confirmedData.reduce((ss, r) => ss + getPayVal(r, i.id), 0), 0);
  const grandDeductionTotal = activeDeductions.reduce((s, i) => s + confirmedData.reduce((ss, r) => ss + getDeductVal(r, i.id), 0), 0);
  const totalRow = ws.addRow([
    '', '', '', '', '', '', '', '', '합계',
    formatMinutesToHM(confirmedData.reduce((s, r) => s + (r.totalWorkMinutes || 0), 0)),
    formatMinutesToHM(confirmedData.reduce((s, r) => s + (r.regularWorkMinutes || 0), 0)),
    formatMinutesToHM(confirmedData.reduce((s, r) => s + (r.overtimeMinutes || 0), 0)),
    formatMinutesToHM(confirmedData.reduce((s, r) => s + (r.nightWorkMinutes || 0), 0)),
    formatMinutesToHM(confirmedData.reduce((s, r) => s + (r.nightShiftMinutes || 0), 0)),
    ...activePayments.map(i => formatNumber(confirmedData.reduce((s, r) => s + getPayVal(r, i.id), 0))),
    formatNumber(grandPaymentTotal),
    ...activeDeductions.map(i => formatNumber(confirmedData.reduce((s, r) => s + getDeductVal(r, i.id), 0))),
    formatNumber(grandDeductionTotal),
    formatNumber(confirmedData.reduce((s, r) => s + r.netSalary, 0)),
    '',
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'double' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });

  // 숫자 포맷 (지급/공제 칼럼)
  const numStart = 15;
  for (let c = numStart; c <= numStart + activePayments.length + activeDeductions.length; c++) {
    ws.getColumn(c).numFmt = '#,##0';
    ws.getColumn(c).width = 15;
  }
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 10;
  ws.getColumn(7).width = 8;
  ws.getColumn(8).width = 8;
  ws.getColumn(9).width = 8;
  ws.getColumn(10).width = 14;
  ws.getColumn(11).width = 14;
  ws.getColumn(12).width = 14;
  ws.getColumn(13).width = 14;
  ws.getColumn(14).width = 14;

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer, `임금대장_${month}.xlsx`);
  return true;
}

// 급여명세서 엑셀 내보내기 (각 직원 별도 시트)
export async function exportPayslips(
  payrollData: PayrollRecord[],
  employees: Employee[],
  paymentItems: PayrollItem[],
  deductionItems: PayrollItem[],
  month: string,
  companyName: string
) {
  const confirmedData = payrollData.filter(r => r.status === 'confirmed' || r.status === 'confirmed_paid');
  if (confirmedData.length === 0) return false;

  const activePayments = paymentItems.filter(i => i.isActive);

  const workbook = new ExcelJS.Workbook();

  const getPayVal = (record: PayrollRecord, itemId: string): number => {
    const ri = record.paymentItems?.find(pi => pi.itemId === itemId);
    if (ri) return ri.amount;
    if (itemId === 'base-salary') return record.baseSalary;
    if (itemId === 'overtime') return record.overtime;
    if (itemId === 'bonus') return record.bonus;
    return 0;
  };

  for (const record of confirmedData) {
    const emp = employees.find(e => e.id === record.employeeId);
    const sheetName = `${record.employeeName}(${record.employeeNumber})`.slice(0, 31);
    const ws = workbook.addWorksheet(sheetName);

    ws.getColumn(1).width = 20;
    ws.getColumn(2).width = 25;

    // 회사명 & 타이틀
    const titleRow = ws.addRow([companyName || '회사명']);
    titleRow.font = { size: 10, color: { argb: 'FF666666' } };
    const mainTitle = ws.addRow(['급 여 명 세 서']);
    mainTitle.font = { bold: true, size: 16 };
    ws.addRow([`귀속월: ${month}`]);
    ws.addRow([]);

    // 직원 정보
    const infoHeader = ws.addRow(['[ 직원 정보 ]']);
    infoHeader.font = { bold: true };
    infoHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    infoHeader.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 2);

    const addInfoRow = (label: string, value: string) => {
      const r = ws.addRow([label, value]);
      r.eachCell(c => { c.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } }; });
    };
    addInfoRow('성명', record.employeeName);
    addInfoRow('사원번호', record.employeeNumber);
    addInfoRow('부서', record.department);
    addInfoRow('직급', emp?.position || '-');
    addInfoRow('급여계좌', emp?.bankName ? `${emp.bankName} ${emp.accountNumber || ''}` : '-');
    ws.addRow([]);

    // 근태
    const attHeader = ws.addRow(['[ 근태 현황 ]']);
    attHeader.font = { bold: true };
    attHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    attHeader.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 2);

    addInfoRow('출근일수', `${record.presentDays}일`);
    addInfoRow('지각일수', `${record.lateDays}일`);
    addInfoRow('결근일수', `${record.absentDays}일`);
    addInfoRow('휴가일수', `${record.leaveDays}일`);
    addInfoRow('연장근무', `${record.overtimeHours}시간`);
    ws.addRow([]);

    // 지급
    const payHeader = ws.addRow(['[ 지급 내역 ]']);
    payHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
    payHeader.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 2);

    let totalPay = 0;
    activePayments.forEach(item => {
      const val = getPayVal(record, item.id);
      totalPay += val;
      const r = ws.addRow([item.name, formatNumber(val)]);
      r.getCell(2).numFmt = '#,##0';
      r.eachCell(c => { c.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } }; });
    });
    const payTotalRow = ws.addRow(['지급액 합계', formatNumber(totalPay)]);
    payTotalRow.font = { bold: true };
    payTotalRow.getCell(2).numFmt = '#,##0';
    payTotalRow.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FFF0' } }; });
    ws.addRow([]);

    // 공제
    const dedHeader = ws.addRow(['[ 공제 내역 ]']);
    dedHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };
    dedHeader.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 2);

    let totalDed = 0;
    if (record.deductionItems && record.deductionItems.length > 0) {
      record.deductionItems.forEach(item => {
        totalDed += item.amount;
        const r = ws.addRow([item.name, formatNumber(item.amount)]);
        r.getCell(2).numFmt = '#,##0';
        r.eachCell(c => { c.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } }; });
      });
    } else {
      totalDed = record.deductions;
      const r = ws.addRow(['공제액', formatNumber(record.deductions)]);
      r.getCell(2).numFmt = '#,##0';
    }
    const dedTotalRow = ws.addRow(['공제액 합계', formatNumber(totalDed)]);
    dedTotalRow.font = { bold: true };
    dedTotalRow.getCell(2).numFmt = '#,##0';
    dedTotalRow.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0F0' } }; });
    ws.addRow([]);

    // 실지급액
    const netRow = ws.addRow(['실지급액', formatNumber(record.netSalary)]);
    netRow.font = { bold: true, size: 14 };
    netRow.getCell(2).numFmt = '#,##0';
    netRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      c.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer, `급여명세서_${month}.xlsx`);
  return true;
}

function downloadBuffer(buffer: ExcelJS.Buffer, filename: string) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
