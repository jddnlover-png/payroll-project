import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const statusLabels: Record<string, string> = {
  present: '출근',
  late: '지각',
  absent: '결근',
  leave: '휴가',
  half_day: '반차',
};

function formatTime(timestamp: string | null): string {
  if (!timestamp) return '-';
  try {
    return format(new Date(timestamp), 'HH:mm');
  } catch {
    return '-';
  }
}

interface EditLogForExport {
  edited_at: string;
  previous_check_in: string | null;
  new_check_in: string | null;
  previous_check_out: string | null;
  new_check_out: string | null;
  previous_status: string | null;
  new_status: string | null;
  reason: string;
  employee?: {
    name: string;
    employee_number: string;
    department: string | null;
  };
  attendance_record?: {
    date: string;
  };
}

export async function exportEditLogsToExcel(logs: EditLogForExport[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('근태 수정 이력');

  // Define columns
  worksheet.columns = [
    { header: '수정일시', key: 'edited_at', width: 20 },
    { header: '근무일', key: 'work_date', width: 15 },
    { header: '직원명', key: 'name', width: 12 },
    { header: '사번', key: 'employee_number', width: 12 },
    { header: '부서', key: 'department', width: 12 },
    { header: '변경 전 출근', key: 'prev_check_in', width: 14 },
    { header: '변경 후 출근', key: 'new_check_in', width: 14 },
    { header: '변경 전 퇴근', key: 'prev_check_out', width: 14 },
    { header: '변경 후 퇴근', key: 'new_check_out', width: 14 },
    { header: '변경 전 상태', key: 'prev_status', width: 12 },
    { header: '변경 후 상태', key: 'new_status', width: 12 },
    { header: '수정 사유', key: 'reason', width: 30 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  // Add data rows
  logs.forEach((log) => {
    const row = worksheet.addRow({
      edited_at: format(new Date(log.edited_at), 'yyyy-MM-dd HH:mm', { locale: ko }),
      work_date: log.attendance_record?.date
        ? format(new Date(log.attendance_record.date + 'T00:00:00'), 'yyyy-MM-dd (EEE)', { locale: ko })
        : '-',
      name: log.employee?.name || '-',
      employee_number: log.employee?.employee_number || '-',
      department: log.employee?.department || '-',
      prev_check_in: formatTime(log.previous_check_in),
      new_check_in: formatTime(log.new_check_in),
      prev_check_out: formatTime(log.previous_check_out),
      new_check_out: formatTime(log.new_check_out),
      prev_status: statusLabels[log.previous_status || ''] || log.previous_status || '-',
      new_status: statusLabels[log.new_status || ''] || log.new_status || '-',
      reason: log.reason,
    });
    row.alignment = { vertical: 'middle' };
  });

  // Add borders to all cells
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `근태수정이력_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
