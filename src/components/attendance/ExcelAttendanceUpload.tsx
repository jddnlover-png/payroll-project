import { useState, useRef } from 'react';
import { useEmployees } from '@/hooks/useEmployees';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { detectShiftType } from '@/hooks/useAttendance';
import { buildCheckOutTimestamp } from '@/utils/workHoursCalculation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, Download, FileSpreadsheet, Check, AlertCircle } from 'lucide-react';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

interface ExcelRow {
  사원번호: string;
  이름: string;
  날짜?: string;
  출근시간?: string;
  퇴근시간?: string;
  출근일시?: string;
  퇴근일시?: string;
  상태?: string;
}

interface ParsedAttendance {
  employeeId?: string;
  employeeNumber: string;
  employeeName: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: 'present' | 'late' | 'absent' | 'leave';
  isValid: boolean;
  error?: string;
}

export function ExcelAttendanceUpload() {
  const { activeEmployees: employees } = useEmployees();
  const { currentOrganization } = useOrganization();
  const { settings } = useOrganizationSettings();
  const queryClient = useQueryClient();
  const [parsedData, setParsedData] = useState<ParsedAttendance[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const statusMap: Record<string, 'present' | 'late' | 'absent' | 'leave'> = {
    '출근': 'present',
    '정상': 'present',
    '지각': 'late',
    '결근': 'absent',
    '휴가': 'leave',
  };

  const cellToText = (value: unknown): string => {
    if (value === null || value === undefined) return '';

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'object') {
      const obj = value as {
        text?: string;
        result?: unknown;
        richText?: Array<{ text?: string }>;
      };

      if (obj.text) return String(obj.text);
      if (obj.result !== undefined) return cellToText(obj.result);
      if (Array.isArray(obj.richText)) {
        return obj.richText.map((item) => item.text || '').join('');
      }
    }

    return String(value).trim();
  };

  const normalizeHeader = (value: unknown): string => {
    return cellToText(value).replace(/\s/g, '').trim();
  };

  const parseExcelDate = (value: unknown): string => {
    if (!value) return '';

    if (typeof value === 'string') {
      const text = value.trim();

      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
        const [y, m, d] = text.split('-');
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }

      if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) {
        const [y, m, d] = text.split('/');
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }

      if (/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(text)) {
        const [y, m, d] = text.split('.');
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }

      if (/^\d{8}$/.test(text)) {
        return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
      }

      const parsedDateTime = parseDateTime(text);
      if (parsedDateTime) return parsedDateTime.date;
    }

    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    if (typeof value === 'number') {
      const text = String(Math.floor(value));
      if (/^\d{8}$/.test(text)) {
        return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
      }

      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return '';
  };

  const parseExcelTime = (value: unknown): string | null => {
    if (!value) return null;

    if (typeof value === 'string') {
      const text = value.trim();

      if (!text || text === '//::' || text === '::' || text === '-' || text === '--') {
        return null;
      }

      const parsedDateTime = parseDateTime(text);
      if (parsedDateTime) return parsedDateTime.time;

      if (/^\d{1,2}:\d{2}$/.test(text)) {
        const [h, m] = text.split(':');
        return `${h.padStart(2, '0')}:${m}`;
      }

      if (/^\d{1,2}:\d{2}:\d{2}$/.test(text)) {
        const [h, m] = text.split(':');
        return `${h.padStart(2, '0')}:${m}`;
      }
    }

    if (value instanceof Date) {
      const hours = String(value.getUTCHours()).padStart(2, '0');
      const minutes = String(value.getUTCMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }

    if (typeof value === 'number') {
      const timeFraction = value % 1;
      if (timeFraction > 0 || value === 0) {
        const totalMinutes = Math.round(timeFraction * 24 * 60);
        const hours = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
    }

    return null;
  };

  const parseDateTime = (value: unknown): { date: string; time: string } | null => {
    if (!value) return null;

    if (value instanceof Date) {
      const y = value.getFullYear();
      const mo = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      const h = String(value.getHours()).padStart(2, '0');
      const mi = String(value.getMinutes()).padStart(2, '0');
      return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
    }

    if (typeof value === 'string') {
      const text = value.trim();

      if (!text || text === '//::' || text === '::' || text === '-' || text === '--') {
        return null;
      }

      const match = text.match(
        /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})[\s:T]*(\d{1,2}):(\d{2})/
      );

      if (match) {
        const [, y, mo, d, h, mi] = match;
        return {
          date: `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`,
          time: `${h.padStart(2, '0')}:${mi}`,
        };
      }
    }

    if (typeof value === 'number' && value > 1) {
      const excelEpoch = new Date(1899, 11, 30);
      const dt = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
      const y = dt.getFullYear();
      const mo = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const h = String(dt.getHours()).padStart(2, '0');
      const mi = String(dt.getMinutes()).padStart(2, '0');
      return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
    }

    return null;
  };

  const matchEmployee = (
    employeeName: string,
    employeeNumber?: string
  ): {
    employee?: typeof employees[number];
    isValid: boolean;
    error?: string;
  } => {
    const name = employeeName.trim();
    const number = String(employeeNumber || '').trim();

    if (!name) {
      return {
        isValid: false,
        error: '직원명 없음',
      };
    }

    const nameMatches = employees.filter((emp) => emp.name === name);

    if (nameMatches.length === 0) {
      return {
        isValid: false,
        error: '등록되지 않은 직원',
      };
    }

    if (nameMatches.length === 1) {
      return {
        employee: nameMatches[0],
        isValid: true,
      };
    }

    if (!number) {
      return {
        isValid: false,
        error: '동명이인 직원이 존재하여 이름만으로 식별할 수 없습니다. 엑셀에 사원번호 열을 추가 후 다시 업로드해주세요.',
      };
    }

    const employee = nameMatches.find((emp) => emp.employee_number === number);

    if (!employee) {
      return {
        isValid: false,
        error: '동명이인 직원 중 사원번호가 일치하는 직원이 없습니다.',
      };
    }

    return {
      employee,
      isValid: true,
    };
  };

  const getStatusByTime = (
    checkIn: string | null,
    checkOut: string | null,
    statusText?: string
  ): 'present' | 'late' | 'absent' | 'leave' => {
    const mappedStatus = statusMap[String(statusText || '').trim()];
    if (mappedStatus) return mappedStatus;

    if (!checkIn && !checkOut) return 'absent';

    if (checkIn) {
      const [h, m] = checkIn.split(':').map(Number);
      const checkInMinutes = h * 60 + m;
      const [startH, startM] = settings.work_start_time.split(':').map(Number);
      const workStartMinutes = startH * 60 + startM;

      if (checkInMinutes > workStartMinutes + settings.late_threshold) {
        return 'late';
      }
    }

    return 'present';
  };

  const detectSecomFormat = (worksheet: ExcelJS.Worksheet): boolean => {
    const firstRow = worksheet.getRow(1);
    const colA = firstRow.getCell(1).value;
    const colH = firstRow.getCell(8).value;

    if (colA instanceof Date) return true;
    if (typeof colA === 'string' && /^\d{4}-\d{2}-\d{2}/.test(colA)) return true;

    if (colH instanceof Date) return true;
    if (typeof colH === 'string' && /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(colH)) return true;

    return false;
  };

  const parseSecomData = (worksheet: ExcelJS.Worksheet): ParsedAttendance[] => {
    const parsed: ParsedAttendance[] = [];

    worksheet.eachRow((row) => {
      const colA = row.getCell(1).value;
      const colC = row.getCell(3).value;
      const colH = row.getCell(8).value;
      const colI = row.getCell(9).value;

      const employeeName = cellToText(colC);
      if (!employeeName) return;

      const date = parseExcelDate(colA);
      if (!date) return;

      const parsedCI = parseDateTime(colH);
      const parsedCO = parseDateTime(colI);

      const checkIn = parsedCI?.time || parseExcelTime(colH);
      const checkOut = parsedCO?.time || parseExcelTime(colI);

      const matchResult = matchEmployee(employeeName);
      const status = getStatusByTime(checkIn, checkOut);

      parsed.push({
        employeeId: matchResult.employee?.id,
        employeeNumber: matchResult.employee?.employee_number || '',
        employeeName,
        date,
        checkIn,
        checkOut,
        status,
        isValid: matchResult.isValid,
        error: matchResult.error,
      });
    });

    return parsed;
  };

  const findHeaderRow = (worksheet: ExcelJS.Worksheet): number => {
    let bestRow = 1;
    let bestScore = 0;

    worksheet.eachRow((row, rowNumber) => {
      let score = 0;

      row.eachCell((cell) => {
        const text = normalizeHeader(cell.value);

        if (/이름|성명|사원명|직원명|직원/.test(text)) score += 3;
        if (/사번|사원번호|직원번호/.test(text)) score += 2;
        if (/일자|날짜|근무일/.test(text)) score += 3;
        if (/출근시간|출근일시|출근/.test(text)) score += 4;
        if (/퇴근시간|퇴근일시|퇴근/.test(text)) score += 4;
        if (/근태|상태/.test(text)) score += 1;
      });

      if (score > bestScore) {
        bestScore = score;
        bestRow = rowNumber;
      }
    });

    return bestRow;
  };

  const findColumnIndex = (
    headers: string[],
    patterns: RegExp[]
  ): number | null => {
    const index = headers.findIndex((header) =>
      patterns.some((pattern) => pattern.test(header))
    );

    return index >= 0 ? index + 1 : null;
  };

  const parseGenericAttendanceData = (worksheet: ExcelJS.Worksheet): ParsedAttendance[] => {
    const parsed: ParsedAttendance[] = [];
    const headerRowNumber = findHeaderRow(worksheet);
    const headerRow = worksheet.getRow(headerRowNumber);

    const headers: string[] = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = normalizeHeader(cell.value);
    });

    const employeeNameCol = findColumnIndex(headers, [
      /^(이름|성명|사원명|직원명|직원)$/,
      /이름/,
      /성명/,
      /직원/,
    ]);

    const employeeNumberCol = findColumnIndex(headers, [
      /사원번호/,
      /직원번호/,
      /사번/,
    ]);

    const dateCol = findColumnIndex(headers, [
      /일자/,
      /날짜/,
      /근무일/,
    ]);

    const checkInCol = findColumnIndex(headers, [
      /출근시간/,
      /출근일시/,
      /^출근$/,
      /출근/,
    ]);

    const checkOutCol = findColumnIndex(headers, [
      /퇴근시간/,
      /퇴근일시/,
      /^퇴근$/,
      /퇴근/,
    ]);

    const statusCol = findColumnIndex(headers, [
      /상태/,
      /근태/,
    ]);

    if (!employeeNameCol || (!dateCol && !checkInCol && !checkOutCol)) {
      return [];
    }

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;

      const employeeName = cellToText(row.getCell(employeeNameCol).value);
      if (!employeeName) return;

      const employeeNumber = employeeNumberCol
        ? cellToText(row.getCell(employeeNumberCol).value)
        : '';

      const rawDate = dateCol ? row.getCell(dateCol).value : null;
      const rawCheckIn = checkInCol ? row.getCell(checkInCol).value : null;
      const rawCheckOut = checkOutCol ? row.getCell(checkOutCol).value : null;
      const rawStatus = statusCol ? cellToText(row.getCell(statusCol).value) : '';

      const parsedCI = parseDateTime(rawCheckIn);
      const parsedCO = parseDateTime(rawCheckOut);

      const date =
        parseExcelDate(rawDate) ||
        parsedCI?.date ||
        parsedCO?.date ||
        '';

      if (!date) return;

      const checkIn = parsedCI?.time || parseExcelTime(rawCheckIn);
      const checkOut = parsedCO?.time || parseExcelTime(rawCheckOut);

      const matchResult = matchEmployee(employeeName, employeeNumber);
      const status = getStatusByTime(checkIn, checkOut, rawStatus);

      parsed.push({
        employeeId: matchResult.employee?.id,
        employeeNumber: matchResult.employee?.employee_number || employeeNumber,
        employeeName,
        date,
        checkIn,
        checkOut,
        status,
        isValid: matchResult.isValid,
        error: matchResult.error,
      });
    });

    return parsed;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
const workbook = new ExcelJS.Workbook();

try {
  await workbook.xlsx.load(arrayBuffer);
} catch {
  const sheetWorkbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
  });

  const convertedBuffer = XLSX.write(sheetWorkbook, {
    bookType: 'xlsx',
    type: 'array',
  });

  await workbook.xlsx.load(convertedBuffer);
}

if (workbook.worksheets.length === 0 && file.name.toLowerCase().endsWith('.xls')) {
  const sheetWorkbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
  });

  const convertedBuffer = XLSX.write(sheetWorkbook, {
    bookType: 'xlsx',
    type: 'array',
  });

  await workbook.xlsx.load(convertedBuffer);
}

const worksheet = workbook.worksheets[0];
if (!worksheet) {
  toast.error('엑셀 파일에서 시트를 찾을 수 없습니다. 파일을 xlsx 형식으로 저장 후 다시 업로드해주세요.');
  return;
}

      let parsed: ParsedAttendance[] = [];

      if (detectSecomFormat(worksheet)) {
        parsed = parseSecomData(worksheet);
        toast.success(`세콤 형식 감지: ${parsed.length}개의 근태 데이터를 불러왔습니다.`);
      } else {
        parsed = parseGenericAttendanceData(worksheet);

        if (parsed.length > 0) {
          toast.success(`범용 근태자료 감지: ${parsed.length}개의 근태 데이터를 불러왔습니다.`);
        } else {
          const headers: string[] = [];
          worksheet.getRow(1).eachCell((cell, colNumber) => {
            headers[colNumber - 1] = String(cell.value || '');
          });

          const jsonData: ExcelRow[] = [];
          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;

            const rowData: Record<string, unknown> = {};
            row.eachCell((cell, colNumber) => {
              const header = headers[colNumber - 1];
              if (header) {
                rowData[header] = cell.value;
              }
            });

            if (Object.keys(rowData).length > 0) {
              jsonData.push(rowData as unknown as ExcelRow);
            }
          });

          const hasDateTimeFormat = headers.includes('출근일시') || headers.includes('퇴근일시');

          parsed = jsonData.map((row) => {
            const employeeNumber = String(row.사원번호 || '').trim();
            const employeeName = String(row.이름 || '').trim();

            let date = '';
            let checkIn: string | null = null;
            let checkOut: string | null = null;

            if (hasDateTimeFormat) {
              const parsedCI = parseDateTime(row.출근일시);
              const parsedCO = parseDateTime(row.퇴근일시);

              if (parsedCI) {
                date = parsedCI.date;
                checkIn = parsedCI.time;
              }

              if (parsedCO) {
                checkOut = parsedCO.time;
                if (!date) date = parsedCO.date;
              }
            } else {
              date = parseExcelDate(row.날짜);
              checkIn = parseExcelTime(row.출근시간);
              checkOut = parseExcelTime(row.퇴근시간);
            }

            const matchResult = matchEmployee(employeeName, employeeNumber);
            const status = getStatusByTime(checkIn, checkOut, row.상태);

            let isValid = matchResult.isValid;
            let error = matchResult.error;

            if (!date) {
              isValid = false;
              error = '날짜 형식 오류';
            }

            return {
              employeeId: matchResult.employee?.id,
              employeeNumber: matchResult.employee?.employee_number || employeeNumber,
              employeeName,
              date,
              checkIn,
              checkOut,
              status,
              isValid,
              error,
            };
          });

          toast.success(`${parsed.length}개의 근태 데이터를 불러왔습니다.`);
        }
      }

      setParsedData(parsed);
    } catch (error) {
      console.error('엑셀 파싱 오류:', error);
      toast.error('엑셀 파일을 읽는 중 오류가 발생했습니다. xls 파일이면 xlsx로 저장 후 다시 업로드해주세요.');
    }
  };

  const handleUpload = async () => {
    const validData = parsedData.filter((row) => row.isValid);

    if (validData.length === 0) {
      toast.error('등록할 유효한 데이터가 없습니다.');
      return;
    }

    if (!currentOrganization?.id) {
      toast.error('조직 정보가 없습니다.');
      return;
    }

    try {
      const records = validData.map((row) => {
        const employee = row.employeeId
          ? employees.find((emp) => emp.id === row.employeeId)
          : employees.find((emp) => emp.name === row.employeeName);

        let workType: string | null = null;
        if (row.checkIn) {
          const checkInDate = new Date(`${row.date}T${row.checkIn}:00+09:00`);
          workType = detectShiftType(checkInDate, settings.work_start_time, settings.shift_tier1_start);
        }

        const checkOutTimestamp = (row.checkIn && row.checkOut)
          ? buildCheckOutTimestamp(row.date, row.checkIn, row.checkOut)
          : (row.checkOut ? `${row.date}T${row.checkOut}:00+09:00` : null);

        return {
          organization_id: currentOrganization.id,
          employee_id: employee!.id,
          date: row.date,
          check_in: row.checkIn ? `${row.date}T${row.checkIn}:00+09:00` : null,
          check_out: checkOutTimestamp,
          status: row.status,
          work_type: workType,
        };
      });

      const { error } = await supabase
        .from('attendance_records')
        .upsert(records, {
          onConflict: 'organization_id,employee_id,date',
          ignoreDuplicates: false,
        });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['attendance', currentOrganization.id] });
      toast.success(`${validData.length}건의 근태 데이터가 등록되었습니다.`);
      setParsedData([]);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('근태 데이터 등록 오류:', error);
      toast.error('근태 데이터 등록 중 오류가 발생했습니다.');
    }
  };

  const downloadTemplate = async () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('근태현황');

    worksheet.columns = [
      { header: '사원번호', key: '사원번호', width: 12 },
      { header: '이름', key: '이름', width: 10 },
      { header: '날짜', key: '날짜', width: 12 },
      { header: '출근시간', key: '출근시간', width: 10 },
      { header: '퇴근시간', key: '퇴근시간', width: 10 },
      { header: '상태', key: '상태', width: 8 },
    ];

    employees.forEach((emp) => {
      for (let day = 1; day <= daysInMonth; day++) {
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        worksheet.addRow([
          emp.employee_number || '',
          emp.name || '',
          date,
          '',
          '',
          '출근',
        ]);
      }
    });

    worksheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `근태현황_${selectedMonth}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success('템플릿이 다운로드되었습니다.');
  };

  const validCount = parsedData.filter((row) => row.isValid).length;
  const invalidCount = parsedData.length - validCount;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            엑셀 일괄 업로드
          </CardTitle>
          <CardDescription>
            엑셀 파일로 1개월 근태 데이터를 일괄 등록할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="month-select" className="mb-2 block">
                템플릿 다운로드용 월 선택
              </Label>
              <div className="flex gap-2">
                <Input
                  id="month-select"
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-40"
                />
                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="w-4 h-4 mr-2" />
                  템플릿 다운로드
                </Button>
              </div>
            </div>

            <div className="flex-1">
              <Label htmlFor="file-upload" className="mb-2 block">
                엑셀 파일 업로드
              </Label>
              <div className="flex gap-2">
                <Input
                  id="file-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg text-sm">
            <p className="font-medium mb-2">📌 사용 방법</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>월을 선택하고 "템플릿 다운로드"를 클릭하여 양식을 받습니다.</li>
              <li>엑셀에서 각 직원의 출근시간, 퇴근시간, 상태를 입력합니다.</li>
              <li>상태: 출근, 지각, 결근, 휴가 중 하나를 입력합니다.</li>
              <li>시간 형식: HH:MM 또는 YYYY/MM/DD:HH:mm 형식을 지원합니다.</li>
              <li>출근시간과 퇴근시간이 모두 비어 있고 날짜가 있는 행은 결근으로 등록됩니다.</li>
              <li>작성된 파일을 업로드하고 "일괄 등록" 버튼을 클릭합니다.</li>
            </ol>

            <p className="font-medium mt-3 mb-2">📌 범용 근태자료 자동 업로드</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>이름, 날짜, 출근시간, 퇴근시간 컬럼을 자동으로 감지합니다.</li>
              <li>컬럼 위치가 달라도 헤더명과 날짜/시간 패턴을 기준으로 읽어옵니다.</li>
              <li>출근시간/퇴근시간에 날짜와 시간이 함께 있는 형식도 지원합니다.</li>
              <li>예: 2026/01/02:08:47, 2026-01-02 08:47, 2026.01.02 08:47</li>
              <li>※ 동일한 이름의 직원이 있는 경우 사원번호 열이 필요합니다.</li>
            </ul>

            <p className="font-medium mt-3 mb-2">📌 세콤/ADT 근태자료 지원</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>세콤, ADT, 기존 템플릿, 일반 근태 엑셀 양식을 함께 지원합니다.</li>
              <li>직원 이름이 시스템에 등록된 이름과 정확히 일치해야 합니다.</li>
              <li>동명이인 직원이 있으면 사원번호까지 일치해야 등록됩니다.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {parsedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>데이터 미리보기</span>
              <div className="flex gap-2">
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  <Check className="w-3 h-3 mr-1" />
                  유효 {validCount}건
                </Badge>
                {invalidCount > 0 && (
                  <Badge variant="secondary" className="bg-red-100 text-red-800">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    오류 {invalidCount}건
                  </Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="max-h-96 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>상태</TableHead>
                    <TableHead>사원번호</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead>날짜</TableHead>
                    <TableHead>출근시간</TableHead>
                    <TableHead>퇴근시간</TableHead>
                    <TableHead>근태상태</TableHead>
                    <TableHead>비고</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 100).map((row, index) => (
                    <TableRow key={index} className={!row.isValid ? 'bg-red-50' : ''}>
                      <TableCell>
                        {row.isValid ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-600" />
                        )}
                      </TableCell>
                      <TableCell>{row.employeeNumber}</TableCell>
                      <TableCell>{row.employeeName}</TableCell>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.checkIn || '-'}</TableCell>
                      <TableCell>{row.checkOut || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {row.status === 'present' && '출근'}
                          {row.status === 'late' && '지각'}
                          {row.status === 'absent' && '결근'}
                          {row.status === 'leave' && '휴가'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-red-600 text-sm">
                        {row.error}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {parsedData.length > 100 && (
              <p className="text-sm text-muted-foreground mt-2">
                * 처음 100건만 미리보기로 표시됩니다. (전체 {parsedData.length}건)
              </p>
            )}

            <div className="flex justify-end mt-4">
              <Button onClick={handleUpload} disabled={validCount === 0}>
                <Upload className="w-4 h-4 mr-2" />
                유효한 {validCount}건 일괄 등록
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}