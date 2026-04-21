import { useState, useRef } from 'react';
import ExcelJS from 'exceljs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useQueryClient } from '@tanstack/react-query';

interface ParsedEmployee {
  rowNum: number;
  employee_number: string;
  name: string;
  resident_number: string | null;
  department: string;
  position: string;
  employment_type: string;
  pay_type: string;
  job_category: string;
  base_salary: number;
  hourly_rate: number | null;
  daily_rate: number | null;
  hire_date: string;
  email: string | null;
  phone: string | null;
  bank_name: string | null;
  account_number: string | null;
  errors: string[];
  warnings: string[];
}

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  '정규직': 'regular',
  '계약직': 'contract',
  '일용직': 'daily',
  '프리랜서': 'freelancer',
  'regular': 'regular',
  'contract': 'contract',
  'daily': 'daily',
  'freelancer': 'freelancer',
};

const PAY_TYPE_MAP: Record<string, string> = {
  '월급제': 'monthly',
  '시급제': 'hourly',
  '일급제': 'daily',
  '월급': 'monthly',
  '시급': 'hourly',
  '일급': 'daily',
  'monthly': 'monthly',
  'hourly': 'hourly',
  'daily': 'daily',
};

const JOB_CATEGORY_MAP: Record<string, string> = {
  '사무직': 'office',
  '생산직': 'production',
  'office': 'office',
  'production': 'production',
};

interface EmployeeBulkUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingEmployeeNumbers: string[];
  defaultDepartment: string;
  defaultPosition: string;
}

export function EmployeeBulkUpload({
  open,
  onOpenChange,
  existingEmployeeNumbers,
  defaultDepartment,
  defaultPosition,
}: EmployeeBulkUploadProps) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedData, setParsedData] = useState<ParsedEmployee[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [uploadResult, setUploadResult] = useState({ success: 0, fail: 0 });

  const handleDownloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('직원일괄등록');
    const guideWs = workbook.addWorksheet('작성가이드');

    // 메인 시트 헤더
    const headers = [
      { header: '사원번호*', key: 'employee_number', width: 15 },
      { header: '이름*', key: 'name', width: 12 },
      { header: '주민등록번호', key: 'resident_number', width: 18 },
      { header: '부서', key: 'department', width: 15 },
      { header: '직급', key: 'position', width: 12 },
      { header: '고용형태', key: 'employment_type', width: 12 },
      { header: '급여유형', key: 'pay_type', width: 10 },
      { header: '직종', key: 'job_category', width: 10 },
      { header: '기본급(월급)', key: 'base_salary', width: 15 },
      { header: '시급', key: 'hourly_rate', width: 12 },
      { header: '일급', key: 'daily_rate', width: 12 },
      { header: '입사일*', key: 'hire_date', width: 15 },
      { header: '이메일', key: 'email', width: 25 },
      { header: '전화번호', key: 'phone', width: 15 },
      { header: '은행명', key: 'bank_name', width: 12 },
      { header: '계좌번호', key: 'account_number', width: 20 },
    ];

    ws.columns = headers;

    // 헤더 스타일
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 30;

    // 필수 컬럼 강조 (연한 노란색 배경)
    const requiredCols = [1, 2, 12]; // 사원번호, 이름, 입사일
    for (let r = 2; r <= 101; r++) {
      requiredCols.forEach(c => {
        ws.getCell(r, c).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFDE7' },
        };
      });
    }

    // 드롭다운 유효성 검사
    for (let r = 2; r <= 101; r++) {
      // 주민등록번호 컬럼을 텍스트 형식으로 설정
      ws.getCell(r, 3).numFmt = '@';
      ws.getCell(r, 6).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"정규직,계약직,일용직,프리랜서"'],
        showErrorMessage: true,
        errorTitle: '입력 오류',
        error: '고용형태 항목에는 반드시 정규직, 계약직, 일용직, 프리랜서 중 하나를 정확히 입력해야 합니다.',
      };
      ws.getCell(r, 7).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"월급제,시급제,일급제"'],
        showErrorMessage: true,
        errorTitle: '입력 오류',
        error: '급여유형 항목에는 반드시 월급제, 시급제, 일급제 중 하나를 정확히 입력해야 합니다.',
      };
      ws.getCell(r, 8).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"사무직,생산직"'],
        showErrorMessage: true,
        errorTitle: '입력 오류',
        error: '직종 항목에는 반드시 사무직 또는 생산직 중 하나를 정확히 입력해야 합니다.',
      };
    }

    // 샘플 데이터
    ws.addRow({
      employee_number: 'EMP001',
      name: '홍길동',
      resident_number: '900101-1234567',
      department: '개발팀',
      position: '과장',
      employment_type: '정규직',
      pay_type: '월급제',
      job_category: '사무직',
      base_salary: 3000000,
      hourly_rate: '',
      daily_rate: '',
      hire_date: '2024-01-15',
      email: 'hong@company.com',
      phone: '010-1234-5678',
      bank_name: '국민은행',
      account_number: '123-456-789012',
    });
    ws.addRow({
      employee_number: 'EMP002',
      name: '김영희',
      resident_number: '',
      department: '',
      position: '',
      employment_type: '일용직',
      pay_type: '일급제',
      job_category: '생산직',
      base_salary: '',
      hourly_rate: '',
      daily_rate: 150000,
      hire_date: '2024-03-01',
      email: '',
      phone: '010-9876-5432',
      bank_name: '',
      account_number: '',
    });

    // 샘플 행 스타일
    [2, 3].forEach(r => {
      ws.getRow(r).font = { color: { argb: 'FF999999' }, italic: true };
    });

    // 가이드 시트
    guideWs.getColumn(1).width = 20;
    guideWs.getColumn(2).width = 60;

    const guideData = [
      ['📋 직원 일괄등록 작성 가이드', ''],
      ['', ''],
      ['항목', '설명'],
      ['사원번호*', '필수. 중복 불가. 예: EMP001, EMP002'],
      ['이름*', '필수. 직원의 실명을 입력하세요.'],
      ['주민등록번호', '선택. 뒷자리는 마스킹 처리되어 저장됩니다. 예: 900101-1234567'],
      ['부서', '미입력 시 "기본부서"로 자동 배정됩니다.'],
      ['직급', '미입력 시 "미지정"으로 자동 배정됩니다.'],
      ['고용형태', '정규직 / 계약직 / 일용직 / 프리랜서 (미입력 시 정규직). 반드시 이 중 하나를 정확히 입력해야 합니다.'],
      ['급여유형', '월급제 / 시급제 / 일급제 (미입력 시 월급제). 반드시 이 중 하나를 정확히 입력해야 합니다.'],
      ['직종', '사무직 / 생산직 (미입력 시 사무직). 반드시 사무직 또는 생산직 중 하나를 정확히 입력해야 합니다.'],
      ['기본급(월급)', '월급제인 경우 월 기본급을 숫자로 입력. 예: 3000000'],
      ['시급', '시급제인 경우 시급을 숫자로 입력. 예: 12000'],
      ['일급', '일급제인 경우 일급을 숫자로 입력. 예: 150000'],
      ['입사일*', '필수. YYYY-MM-DD 형식. 예: 2024-01-15'],
      ['이메일', '급여명세서 발송 시 사용됩니다.'],
      ['전화번호', '연락처를 입력하세요.'],
      ['은행명', '급여 이체 시 사용됩니다.'],
      ['계좌번호', '급여 이체 계좌번호를 입력하세요.'],
      ['', ''],
      ['⚠️ 주의사항', ''],
      ['1', '샘플 데이터(회색 이탤릭)는 삭제 후 입력하세요.'],
      ['2', '* 표시가 있는 항목은 필수 입력입니다.'],
      ['3', '노란색 셀은 필수 입력 항목입니다.'],
      ['4', '고용형태, 급여유형, 직종은 드롭다운에서 선택하세요.'],
      ['5', '입사일은 반드시 YYYY-MM-DD 형식으로 입력하세요.'],
    ];

    guideData.forEach((row, idx) => {
      const r = guideWs.addRow(row);
      if (idx === 0) {
        r.font = { bold: true, size: 14 };
        guideWs.mergeCells(1, 1, 1, 2);
      }
      if (idx === 2) {
        r.font = { bold: true };
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
      }
      if (idx === 19) {
        r.font = { bold: true, color: { argb: 'FFEF4444' } };
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '직원일괄등록_템플릿.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('템플릿이 다운로드되었습니다.');
  };

  const parseExcelDate = (value: any): string => {
    if (!value) return '';
    // ExcelJS Date object
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    // String
    const str = String(value).trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    // YYYY/MM/DD
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(str)) return str.replace(/\//g, '-');
    // YYYYMMDD
    if (/^\d{8}$/.test(str)) return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
    // DD/MM/YYYY or MM/DD/YYYY - try parsing
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return str;
  };

  const parseNumber = (value: any): number => {
    if (value === null || value === undefined || value === '') return 0;
    const num = Number(String(value).replace(/[,\s원₩]/g, ''));
    return isNaN(num) ? 0 : num;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const ws = workbook.getWorksheet(1);
      if (!ws) {
        toast.error('엑셀 파일에서 시트를 찾을 수 없습니다.');
        return;
      }

      const parsed: ParsedEmployee[] = [];
      const seenNumbers = new Set<string>();

      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // skip header

        const getValue = (col: number): string => {
          const cell = row.getCell(col);
          const val = cell.value;
          if (val === null || val === undefined) return '';
          if (typeof val === 'object' && 'text' in val) return (val as any).text || '';
          if (typeof val === 'object' && 'result' in val) return String((val as any).result || '');
          return String(val).trim();
        };

        const name = getValue(2);
        const empNum = getValue(1);

        // Skip completely empty rows
        if (!name && !empNum) return;

        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields
        if (!empNum) errors.push('사원번호 누락');
        if (!name) errors.push('이름 누락');

        // Duplicate check
        if (empNum) {
          if (seenNumbers.has(empNum)) {
            errors.push(`사원번호 "${empNum}" 파일 내 중복`);
          }
          if (existingEmployeeNumbers.includes(empNum)) {
            errors.push(`사원번호 "${empNum}" 이미 등록됨`);
          }
          seenNumbers.add(empNum);
        }

        // Resident number (col 3) - mask for storage
        const rawResidentNumber = getValue(3) || null;
        let residentNumber: string | null = null;
        if (rawResidentNumber) {
          const cleaned = rawResidentNumber.replace(/[^0-9]/g, '');
          if (cleaned.length >= 7) {
            residentNumber = cleaned.slice(0, 6) + '-' + cleaned[6] + '******';
          } else {
            residentNumber = rawResidentNumber;
            warnings.push('주민등록번호 형식 확인 필요');
          }
        }

        // Department / Position defaults (shifted: col 4, 5)
        let department = getValue(4) || defaultDepartment;
        let position = getValue(5) || defaultPosition;

        if (!getValue(4)) warnings.push(`부서 → "${defaultDepartment}"`);
        if (!getValue(5)) warnings.push(`직급 → "${defaultPosition}"`);

        // Employment type (col 6)
        const rawEmpType = getValue(6) || '정규직';
        const employment_type = EMPLOYMENT_TYPE_MAP[rawEmpType];
        if (!employment_type) errors.push(`고용형태 "${rawEmpType}" 인식 불가 (정규직/계약직/일용직/프리랜서 중 입력)`);

        // Pay type (col 7)
        const rawPayType = getValue(7) || '월급제';
        const pay_type = PAY_TYPE_MAP[rawPayType];
        if (!pay_type) errors.push(`급여유형 "${rawPayType}" 인식 불가 (월급제/시급제/일급제 중 입력)`);

        // Job category (col 8)
        const rawJobCategory = getValue(8) || '사무직';
        const job_category = JOB_CATEGORY_MAP[rawJobCategory];
        if (!job_category) errors.push(`직종 "${rawJobCategory}" 인식 불가 (사무직/생산직 중 입력)`);

        // Salary (cols 9, 10, 11)
        const baseSalary = parseNumber(row.getCell(9).value);
        const hourlyRate = parseNumber(row.getCell(10).value);
        const dailyRate = parseNumber(row.getCell(11).value);

        // Hire date (col 12)
        const hireDateRaw = row.getCell(12).value;
        const hireDate = parseExcelDate(hireDateRaw);
        if (!hireDate) errors.push('입사일 누락');
        else if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) errors.push(`입사일 형식 오류: "${hireDate}"`);

        const email = getValue(13) || null;
        const phone = getValue(14) || null;
        const bankName = getValue(15) || null;
        const accountNumber = getValue(16) || null;

        // Email validation
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          warnings.push('이메일 형식 확인 필요');
        }

        parsed.push({
          rowNum,
          employee_number: empNum,
          name,
          resident_number: residentNumber,
          department,
          position,
          employment_type: employment_type || 'regular',
          pay_type: pay_type || 'monthly',
          job_category: job_category || 'office',
          base_salary: baseSalary,
          hourly_rate: hourlyRate || null,
          daily_rate: dailyRate || null,
          hire_date: hireDate || new Date().toISOString().split('T')[0],
          email,
          phone,
          bank_name: bankName,
          account_number: accountNumber,
          errors,
          warnings,
        });
      });

      if (parsed.length === 0) {
        toast.error('등록할 직원 데이터가 없습니다. 샘플 행을 삭제하고 실제 데이터를 입력해주세요.');
        return;
      }

      setParsedData(parsed);
      setStep('preview');
    } catch (err) {
      console.error('Excel parse error:', err);
      toast.error('엑셀 파일을 읽는 중 오류가 발생했습니다. 올바른 xlsx 파일인지 확인해주세요.');
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validRecords = parsedData.filter(r => r.errors.length === 0);
  const errorRecords = parsedData.filter(r => r.errors.length > 0);

  const handleUpload = async () => {
    if (!currentOrganization?.id) {
      toast.error('조직 정보가 없습니다.');
      return;
    }

    if (validRecords.length === 0) {
      toast.error('등록 가능한 데이터가 없습니다.');
      return;
    }

    setIsUploading(true);
    let success = 0;
    let fail = 0;

    // Batch insert in chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < validRecords.length; i += chunkSize) {
      const chunk = validRecords.slice(i, i + chunkSize);
      const insertData = chunk.map(r => ({
        organization_id: currentOrganization.id,
        employee_number: r.employee_number,
        name: r.name,
        resident_number: r.resident_number,
        department: r.department,
        position: r.position,
        employment_type: r.employment_type as any,
        pay_type: r.pay_type as any,
        job_category: r.job_category,
        base_salary: r.pay_type === 'monthly' ? r.base_salary : 0,
        hourly_rate: r.pay_type === 'hourly' ? r.hourly_rate : null,
        daily_rate: r.pay_type === 'daily' ? r.daily_rate : null,
        hire_date: r.hire_date,
        email: r.email,
        phone: r.phone,
        bank_name: r.bank_name,
        account_number: r.account_number,
        is_active: true,
      }));

      const { error } = await supabase.from('employees').insert(insertData);

      if (error) {
        console.error('Batch insert error:', error);
        fail += chunk.length;
      } else {
        success += chunk.length;
      }
    }

    setIsUploading(false);
    setUploadResult({ success, fail });
    setStep('result');

    queryClient.invalidateQueries({ queryKey: ['employees', currentOrganization.id] });
  };

  const handleClose = () => {
    setParsedData([]);
    setStep('upload');
    setUploadResult({ success: 0, fail: 0 });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            직원 일괄등록
          </DialogTitle>
          <DialogDescription>
            엑셀 파일로 여러 직원을 한 번에 등록할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex-1 space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-6 text-center space-y-3 hover:bg-muted/50 transition-colors">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Download className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold">1단계: 템플릿 다운로드</h3>
                <p className="text-sm text-muted-foreground">
                  양식에 맞춰 작성하면 오류 없이 등록됩니다.
                  <br />
                  드롭다운과 작성 가이드가 포함되어 있습니다.
                </p>
                <Button variant="outline" onClick={handleDownloadTemplate}>
                  <Download className="w-4 h-4 mr-2" />
                  템플릿 다운로드
                </Button>
              </div>
              <div className="border rounded-lg p-6 text-center space-y-3 hover:bg-muted/50 transition-colors">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold">2단계: 파일 업로드</h3>
                <p className="text-sm text-muted-foreground">
                  작성한 엑셀 파일을 업로드하세요.
                  <br />
                  등록 전에 미리보기로 확인할 수 있습니다.
                </p>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  파일 선택
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Tip:</strong> 부서와 직급을 비워두면 자동으로 "{defaultDepartment}"과 "{defaultPosition}"으로 배정됩니다.
                고용형태와 급여유형도 비워두면 "정규직"과 "월급"이 기본값으로 적용됩니다.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-sm">
                  전체 {parsedData.length}건
                </Badge>
                <Badge variant="default" className="text-sm">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  등록 가능 {validRecords.length}건
                </Badge>
                {errorRecords.length > 0 && (
                  <Badge variant="destructive" className="text-sm">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    오류 {errorRecords.length}건
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setStep('upload'); setParsedData([]); }}>
                <X className="w-4 h-4 mr-1" />
                다시 선택
              </Button>
            </div>

            <ScrollArea className="flex-1 border rounded-md max-h-[50vh]">
              <Table>
                <TableHeader>
                   <TableRow>
                     <TableHead className="w-10 text-center">행</TableHead>
                     <TableHead className="text-center">상태</TableHead>
                     <TableHead>사원번호</TableHead>
                     <TableHead>이름</TableHead>
                     <TableHead>주민번호</TableHead>
                     <TableHead>부서</TableHead>
                     <TableHead>직급</TableHead>
                     <TableHead>고용형태</TableHead>
                     <TableHead>급여유형</TableHead>
                     <TableHead>직종</TableHead>
                     <TableHead className="text-right">급여</TableHead>
                     <TableHead>입사일</TableHead>
                     <TableHead>비고</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {parsedData.map((row) => (
                     <TableRow key={row.rowNum} className={row.errors.length > 0 ? 'bg-destructive/5' : ''}>
                       <TableCell className="text-center text-muted-foreground">{row.rowNum}</TableCell>
                       <TableCell className="text-center">
                         {row.errors.length > 0 ? (
                           <AlertCircle className="w-4 h-4 text-destructive mx-auto" />
                         ) : (
                           <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />
                         )}
                       </TableCell>
                        <TableCell className="font-mono text-sm">{row.employee_number || '-'}</TableCell>
                        <TableCell>{row.name || '-'}</TableCell>
                        <TableCell className="text-xs font-mono">{row.resident_number || '-'}</TableCell>
                        <TableCell>{row.department}</TableCell>
                       <TableCell>{row.position}</TableCell>
                       <TableCell>
                         {Object.entries(EMPLOYMENT_TYPE_MAP).find(([k, v]) => v === row.employment_type && !k.match(/^[a-z]+$/))?.[0] || row.employment_type}
                       </TableCell>
                       <TableCell>
                         {Object.entries(PAY_TYPE_MAP).find(([k, v]) => v === row.pay_type && !k.match(/^[a-z]+$/))?.[0] || row.pay_type}
                       </TableCell>
                       <TableCell>
                         {row.job_category === 'office' ? '사무직' : row.job_category === 'production' ? '생산직' : row.job_category}
                       </TableCell>
                       <TableCell className="text-right font-mono">
                         {row.pay_type === 'monthly' && row.base_salary ? row.base_salary.toLocaleString() : ''}
                         {row.pay_type === 'hourly' && row.hourly_rate ? row.hourly_rate.toLocaleString() : ''}
                         {row.pay_type === 'daily' && row.daily_rate ? row.daily_rate.toLocaleString() : ''}
                       </TableCell>
                       <TableCell>{row.hire_date}</TableCell>
                       <TableCell className="max-w-[200px]">
                         {row.errors.length > 0 && (
                           <span className="text-xs text-destructive">{row.errors.join(', ')}</span>
                         )}
                         {row.warnings.length > 0 && row.errors.length === 0 && (
                           <span className="text-xs text-muted-foreground">{row.warnings.join(', ')}</span>
                         )}
                       </TableCell>
                     </TableRow>
                   ))}
                </TableBody>
              </Table>
            </ScrollArea>

            {errorRecords.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  오류가 있는 {errorRecords.length}건은 제외하고 {validRecords.length}건만 등록됩니다.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === 'result' && (
          <div className="flex-1 flex flex-col items-center justify-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold">일괄등록 완료</h3>
            <div className="flex gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{uploadResult.success}</div>
                <div className="text-sm text-muted-foreground">등록 성공</div>
              </div>
              {uploadResult.fail > 0 && (
                <div>
                  <div className="text-2xl font-bold text-destructive">{uploadResult.fail}</div>
                  <div className="text-sm text-muted-foreground">등록 실패</div>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => { setStep('upload'); setParsedData([]); }}>
                취소
              </Button>
              <Button onClick={handleUpload} disabled={validRecords.length === 0 || isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    등록 중...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    {validRecords.length}건 등록하기
                  </>
                )}
              </Button>
            </>
          )}
          {step === 'result' && (
            <Button onClick={handleClose}>확인</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
