import ExcelJS from 'exceljs';

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

const formatNumber = (num: number) => Math.round(num);

function downloadBuffer(buffer: ExcelJS.Buffer, filename: string) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const formatTime = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
};

// 일용직 급여대장 엑셀
export async function exportDailyPayrollLedger(records: DailyPayrollRecord[], month: string, companyName: string) {
  const confirmed = records.filter(r => r.status === 'confirmed');
  if (confirmed.length === 0) return false;

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('일용직 급여대장');

  const titleRow = ws.addRow(['일용직 급여대장']);
  titleRow.font = { bold: true, size: 16 };
  ws.mergeCells(1, 1, 1, 17);
  titleRow.alignment = { horizontal: 'center' };

  const subRow = ws.addRow([`${companyName} | 기준월: ${month}`]);
  subRow.alignment = { horizontal: 'center' };
  ws.mergeCells(2, 1, 2, 17);
  ws.addRow([]);

  const headers = ['No', '날짜', '사원번호', '성명', '부서', '근무시간', '일당/시급', '초과수당', '야간수당', '총지급', '소득세', '지방소득세', '고용보험', '국민연금', '건강보험', '공제합계', '실지급액'];
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  confirmed.forEach((r, i) => {
    const row = ws.addRow([
      i + 1, r.work_date, r.employee?.employee_number || '', r.employee?.name || '',
      r.employee?.department || '-', formatTime(r.work_minutes),
      formatNumber(r.base_daily_wage), formatNumber(r.overtime_pay), formatNumber(r.night_pay),
      formatNumber(r.total_wage), formatNumber(r.income_tax), formatNumber(r.local_income_tax),
      formatNumber(r.employment_insurance), formatNumber(r.national_pension), formatNumber(r.health_insurance),
      formatNumber(r.total_deductions), formatNumber(r.net_pay),
    ]);
    row.eachCell(cell => {
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  const totalRow = ws.addRow([
    '', '', '', '', '', '합계',
    formatNumber(confirmed.reduce((s, r) => s + r.base_daily_wage, 0)),
    formatNumber(confirmed.reduce((s, r) => s + r.overtime_pay, 0)),
    formatNumber(confirmed.reduce((s, r) => s + r.night_pay, 0)),
    formatNumber(confirmed.reduce((s, r) => s + r.total_wage, 0)),
    formatNumber(confirmed.reduce((s, r) => s + r.income_tax, 0)),
    formatNumber(confirmed.reduce((s, r) => s + r.local_income_tax, 0)),
    formatNumber(confirmed.reduce((s, r) => s + r.employment_insurance, 0)),
    formatNumber(confirmed.reduce((s, r) => s + r.national_pension, 0)),
    formatNumber(confirmed.reduce((s, r) => s + r.health_insurance, 0)),
    formatNumber(confirmed.reduce((s, r) => s + r.total_deductions, 0)),
    formatNumber(confirmed.reduce((s, r) => s + r.net_pay, 0)),
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  for (let c = 7; c <= 17; c++) {
    ws.getColumn(c).numFmt = '#,##0';
    ws.getColumn(c).width = 14;
  }
  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 10;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 10;

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer, `일용직_급여대장_${month}.xlsx`);
  return true;
}

// 일용직 급여명세서 엑셀 (직원별 시트)
export async function exportDailyPayslips(records: DailyPayrollRecord[], month: string, companyName: string) {
  const confirmed = records.filter(r => r.status === 'confirmed');
  if (confirmed.length === 0) return false;

  // 직원별 그룹
  const byEmployee = new Map<string, DailyPayrollRecord[]>();
  confirmed.forEach(r => {
    const key = r.employee_id;
    if (!byEmployee.has(key)) byEmployee.set(key, []);
    byEmployee.get(key)!.push(r);
  });

  const workbook = new ExcelJS.Workbook();

  byEmployee.forEach((empRecords, empId) => {
    const emp = empRecords[0].employee;
    const sheetName = `${emp?.name || empId}(${emp?.employee_number || ''})`.slice(0, 31);
    const ws = workbook.addWorksheet(sheetName);

    ws.getColumn(1).width = 20;
    ws.getColumn(2).width = 25;

    const titleRow = ws.addRow([companyName || '회사명']);
    titleRow.font = { size: 10, color: { argb: 'FF666666' } };
    const mainTitle = ws.addRow(['일용직 급여명세서']);
    mainTitle.font = { bold: true, size: 16 };
    ws.addRow([`기준월: ${month}`]);
    ws.addRow([]);

    // 직원 정보
    const infoHeader = ws.addRow(['[ 직원 정보 ]']);
    infoHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    infoHeader.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 2);

    const addInfoRow = (label: string, value: string) => {
      const r = ws.addRow([label, value]);
      r.eachCell(c => { c.border = { bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } } }; });
    };
    addInfoRow('성명', emp?.name || '-');
    addInfoRow('사원번호', emp?.employee_number || '-');
    addInfoRow('부서', emp?.department || '-');
    addInfoRow('총 근무일수', `${empRecords.length}일`);
    ws.addRow([]);

    // 일별 내역
    const detailHeader = ws.addRow(['[ 일별 급여 내역 ]']);
    detailHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
    detailHeader.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.mergeCells(ws.rowCount, 1, ws.rowCount, 2);

    empRecords.forEach(r => {
      addInfoRow(r.work_date, `총지급 ${Math.round(r.total_wage).toLocaleString()}원 / 공제 ${Math.round(r.total_deductions).toLocaleString()}원 / 실지급 ${Math.round(r.net_pay).toLocaleString()}원`);
    });
    ws.addRow([]);

    // 합계
    const totalWage = empRecords.reduce((s, r) => s + r.total_wage, 0);
    const totalDed = empRecords.reduce((s, r) => s + r.total_deductions, 0);
    const totalNet = empRecords.reduce((s, r) => s + r.net_pay, 0);

    const netRow = ws.addRow(['월 합계 실지급액', Math.round(totalNet)]);
    netRow.font = { bold: true, size: 14 };
    netRow.getCell(2).numFmt = '#,##0';
    netRow.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      c.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer, `일용직_급여명세서_${month}.xlsx`);
  return true;
}

// 현재 리스트 그대로 엑셀 내보내기
export async function exportDailyPayrollList(records: DailyPayrollRecord[], month: string) {
  if (records.length === 0) return false;

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('일용직 급여 목록');

  const headers = ['날짜', '사원번호', '성명', '부서', '근무시간', '일당/시급', '초과수당', '야간수당', '총지급', '정산방식', '소득세', '지방소득세', '고용보험', '국민연금', '건강보험', '공제합계', '실지급액', '상태'];
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  const statusMap: Record<string, string> = { auto_generated: '자동생성', modified: '수정됨', confirmed: '확정' };

  records.forEach(r => {
    const row = ws.addRow([
      r.work_date, r.employee?.employee_number || '', r.employee?.name || '',
      r.employee?.department || '-', formatTime(r.work_minutes),
      formatNumber(r.base_daily_wage), formatNumber(r.overtime_pay), formatNumber(r.night_pay),
      formatNumber(r.total_wage),
      r.settlement_type === 'business_income_3_3' ? '3.3%' : '근로소득',
      formatNumber(r.income_tax), formatNumber(r.local_income_tax),
      formatNumber(r.employment_insurance), formatNumber(r.national_pension), formatNumber(r.health_insurance),
      formatNumber(r.total_deductions), formatNumber(r.net_pay),
      statusMap[r.status] || r.status,
    ]);
    row.eachCell(cell => {
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  for (let c = 6; c <= 17; c++) {
    ws.getColumn(c).numFmt = '#,##0';
    ws.getColumn(c).width = 14;
  }
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 10;

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer, `일용직_급여목록_${month}.xlsx`);
  return true;
}
