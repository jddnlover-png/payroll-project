import { useState, useMemo } from 'react';
import { useEmployees } from '@/hooks/useEmployees';
import { useLeaveRecords } from '@/hooks/useLeaveRecords';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Check, X, Calendar as CalendarIcon, Users, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmployeePicker } from '@/components/employee/EmployeePicker';
import { EmployeeCombobox } from '@/components/employee/EmployeeCombobox';
import { toast } from 'sonner';
import { format, differenceInDays, differenceInMonths, differenceInYears, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import ExcelJS from 'exceljs';

const leaveTypeConfig = {
  annual: { label: '연차', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
  half_day: { label: '반차', class: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300' },
  sick: { label: '병가', class: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
  personal: { label: '경조사', class: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' },
  other: { label: '기타', class: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300' },
};

const statusConfig = {
  pending: { label: '대기중', class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
  approved: { label: '승인', class: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
  rejected: { label: '반려', class: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
};

export function LeaveManagement() {
  const { employees, activeEmployees, isLoading: employeesLoading } = useEmployees();
  const { leaveRecords, isLoading: leaveLoading, addLeaveRecord, updateLeaveRecord } = useLeaveRecords();
  const { settings } = useOrganizationSettings();

  const currentYear = new Date().getFullYear();
  const [requestYear, setRequestYear] = useState(currentYear);
  const [balanceYear, setBalanceYear] = useState(currentYear);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [balanceSelectedIds, setBalanceSelectedIds] = useState<string[]>([]);
  const [balancePage, setBalancePage] = useState(1);
  const BALANCE_PAGE_SIZE = 20;

  const [isOpen, setIsOpen] = useState(false);
  const [processedPage, setProcessedPage] = useState(1);
  const PROCESSED_PAGE_SIZE = 20;
  const [formData, setFormData] = useState({
    employeeId: '',
    leaveType: 'annual' as 'annual' | 'half_day' | 'sick' | 'personal' | 'other',
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    reason: '',
  });

  const resetForm = () => {
    setFormData({ employeeId: '', leaveType: 'annual', startDate: undefined, endDate: undefined, reason: '' });
  };

  const calculateDays = (start: Date | undefined, end: Date | undefined) => {
    if (!start || !end) return 0;
    return differenceInDays(end, start) + 1;
  };

  const handleSubmit = () => {
    if (!formData.employeeId || !formData.startDate || !formData.endDate) {
      toast.error('필수 항목을 입력해주세요.');
      return;
    }
    const days = calculateDays(formData.startDate, formData.endDate);
    addLeaveRecord.mutate(
      {
        employee_id: formData.employeeId,
        leave_type: formData.leaveType,
        start_date: format(formData.startDate, 'yyyy-MM-dd'),
        end_date: format(formData.endDate, 'yyyy-MM-dd'),
        days: formData.leaveType === 'half_day' ? 0.5 : days,
        reason: formData.reason,
        status: 'approved',
      },
      { onSuccess: () => { resetForm(); setIsOpen(false); } }
    );
  };

  const handleApprove = (id: string) => updateLeaveRecord.mutate({ id, status: 'approved' });
  const handleReject = (id: string) => updateLeaveRecord.mutate({ id, status: 'rejected' });

  const getEmployeeInfo = (employeeId: string) => {
    const emp = employees.find(e => e.id === employeeId);
    return { name: emp?.name || '알 수 없음', department: emp?.department || '-', employeeNumber: emp?.employee_number || '-' };
  };

  // Filter records by year
  const filteredByYear = useMemo(() => {
    return leaveRecords.filter(r => {
      const startYear = parseISO(r.start_date).getFullYear();
      return startYear === requestYear;
    });
  }, [leaveRecords, requestYear]);

  const pendingRequests = filteredByYear.filter(r => r.status === 'pending');
  const processedRequests = filteredByYear.filter(r => r.status !== 'pending');

  // Balance year filtered records
  const balanceYearRecords = useMemo(() => {
    return leaveRecords.filter(r => {
      const startYear = parseISO(r.start_date).getFullYear();
      return startYear === balanceYear;
    });
  }, [leaveRecords, balanceYear]);

  const isLoading = employeesLoading || leaveLoading;

  // 입사일 기준 근로기준법 연차 자동 계산
  const calculateAnnualLeave = (hireDate: string, targetYear: number): number => {
    const hire = parseISO(hireDate);
    const refDate = new Date(targetYear, 11, 31); // 해당 연도 말 기준
    const yearsWorked = differenceInYears(refDate, hire);
    const monthsWorked = differenceInMonths(refDate, hire);

    if (monthsWorked < 0) return 0; // 아직 입사 전

    if (yearsWorked < 1) {
      // 1년 미만: 1개월 개근 시 1일 (최대 11일)
      return Math.min(Math.max(monthsWorked, 0), 11);
    }

    // 1년 이상: 기본 15일
    let total = 15;

    // 3년차부터 추가: 15 + floor((근속연수-1)/2)
    if (yearsWorked >= 3) {
      total += Math.floor((yearsWorked - 1) / 2);
    }

    // 최대 25일
    return Math.min(total, 25);
  };




  // Export leave requests to Excel
  const exportRequestsToExcel = async () => {
    const recordsToExport = selectedEmployeeIds.length > 0
      ? filteredByYear.filter(r => selectedEmployeeIds.includes(r.employee_id))
      : filteredByYear;

    if (recordsToExport.length === 0) {
      toast.error('내보낼 데이터가 없습니다.');
      return;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${requestYear}년 휴가신청내역`);

    ws.columns = [
      { header: '사원번호', key: 'empNo', width: 12 },
      { header: '이름', key: 'name', width: 12 },
      { header: '부서', key: 'dept', width: 12 },
      { header: '휴가유형', key: 'type', width: 10 },
      { header: '시작일', key: 'start', width: 14 },
      { header: '종료일', key: 'end', width: 14 },
      { header: '일수', key: 'days', width: 8 },
      { header: '상태', key: 'status', width: 10 },
      { header: '사유', key: 'reason', width: 30 },
    ];

    // Style header
    ws.getRow(1).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    recordsToExport.forEach(r => {
      const info = getEmployeeInfo(r.employee_id);
      ws.addRow({
        empNo: info.employeeNumber,
        name: info.name,
        dept: info.department,
        type: leaveTypeConfig[r.leave_type as keyof typeof leaveTypeConfig]?.label || r.leave_type,
        start: r.start_date,
        end: r.end_date,
        days: r.days,
        status: statusConfig[r.status as keyof typeof statusConfig]?.label || r.status,
        reason: r.reason || '',
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `휴가신청내역_${requestYear}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('엑셀 파일이 다운로드되었습니다.');
  };

  // Export balance to Excel
  const exportBalanceToExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${balanceYear}년 잔여휴가현황`);

    ws.columns = [
      { header: '사원번호', key: 'empNo', width: 12 },
      { header: '이름', key: 'name', width: 12 },
      { header: '부서', key: 'dept', width: 12 },
      { header: '총 연차', key: 'total', width: 10 },
      { header: '사용', key: 'used', width: 10 },
      { header: '잔여', key: 'remaining', width: 10 },
      { header: '사용률', key: 'rate', width: 10 },
    ];

    ws.getRow(1).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const empsToExport = balanceSelectedIds.length > 0
      ? activeEmployees.filter(e => balanceSelectedIds.includes(e.id))
      : activeEmployees;
    empsToExport.forEach(emp => {
      const totalLeave = calculateAnnualLeave(emp.hire_date, balanceYear);
      const usedLeave = balanceYearRecords
        .filter(r => r.employee_id === emp.id && r.status === 'approved')
        .reduce((sum, r) => sum + Number(r.days), 0);
      const remaining = totalLeave - usedLeave;
      const rate = totalLeave > 0 ? Math.round((usedLeave / totalLeave) * 100) : 0;

      ws.addRow({
        empNo: emp.employee_number,
        name: emp.name,
        dept: emp.department || '-',
        total: totalLeave,
        used: usedLeave,
        remaining,
        rate: `${rate}%`,
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `잔여휴가현황_${balanceYear}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('엑셀 파일이 다운로드되었습니다.');
  };

  // Year selector component
  const YearSelector = ({ year, onChange }: { year: number; onChange: (y: number) => void }) => (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onChange(year - 1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-semibold min-w-[60px] text-center">{year}년</span>
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onChange(year + 1)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      <Tabs defaultValue="requests" className="w-full">
        <TabsList>
          <TabsTrigger value="requests" className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4" />
            휴가 신청/승인
          </TabsTrigger>
          <TabsTrigger value="balance" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            잔여 휴가 현황
          </TabsTrigger>
        </TabsList>

        {/* ===== 휴가 신청/승인 탭 ===== */}
        <TabsContent value="requests" className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold">휴가 신청 목록</h3>
              <YearSelector year={requestYear} onChange={setRequestYear} />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportRequestsToExcel}>
                <Download className="w-4 h-4 mr-1" />
                엑셀 내보내기
                {selectedEmployeeIds.length > 0 && ` (${selectedEmployeeIds.length}명)`}
              </Button>
              <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    휴가 신청
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>휴가 신청</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>직원 선택 *</Label>
                      <EmployeeCombobox
                        employees={activeEmployees}
                        value={formData.employeeId}
                        onValueChange={(v) => setFormData({ ...formData, employeeId: v })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>휴가 유형 *</Label>
                      <Select value={formData.leaveType} onValueChange={(v: any) => setFormData({ ...formData, leaveType: v })}>
                        <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="annual">연차</SelectItem>
                          <SelectItem value="half_day">반차</SelectItem>
                          <SelectItem value="sick">병가</SelectItem>
                          <SelectItem value="personal">경조사</SelectItem>
                          <SelectItem value="other">기타</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>시작일 *</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formData.startDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.startDate ? format(formData.startDate, "yyyy-MM-dd") : "날짜 선택"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={formData.startDate} onSelect={(d) => setFormData({ ...formData, startDate: d })} locale={ko} className="pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label>종료일 *</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formData.endDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.endDate ? format(formData.endDate, "yyyy-MM-dd") : "날짜 선택"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={formData.endDate} onSelect={(d) => setFormData({ ...formData, endDate: d })} disabled={(d) => formData.startDate ? d < formData.startDate : false} locale={ko} className="pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    {formData.startDate && formData.endDate && (
                      <p className="text-sm text-muted-foreground">
                        총 {formData.leaveType === 'half_day' ? 0.5 : calculateDays(formData.startDate, formData.endDate)}일
                      </p>
                    )}
                    <div className="space-y-2">
                      <Label>사유</Label>
                      <Textarea value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} placeholder="휴가 사유를 입력해주세요" rows={3} />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={() => { setIsOpen(false); resetForm(); }}>취소</Button>
                      <Button onClick={handleSubmit}>신청</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Employee selection for export */}
          {filteredByYear.length > 0 && (
            <EmployeePicker
              employees={activeEmployees}
              selectedIds={selectedEmployeeIds}
              onSelectedIdsChange={setSelectedEmployeeIds}
              description="직원 선택 (엑셀 내보내기용, 미선택 시 전체)"
            />
          )}

          {pendingRequests.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">승인 대기 ({pendingRequests.length}건)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>직원</TableHead>
                      <TableHead>부서</TableHead>
                      <TableHead>휴가유형</TableHead>
                      <TableHead>기간</TableHead>
                      <TableHead>일수</TableHead>
                      <TableHead>사유</TableHead>
                      <TableHead className="text-right">액션</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingRequests.map(request => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{getEmployeeInfo(request.employee_id).name}</TableCell>
                        <TableCell>{getEmployeeInfo(request.employee_id).department}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn('font-medium', leaveTypeConfig[request.leave_type as keyof typeof leaveTypeConfig]?.class)}>
                            {leaveTypeConfig[request.leave_type as keyof typeof leaveTypeConfig]?.label || request.leave_type}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(parseISO(request.start_date), 'MM/dd')} ~ {format(parseISO(request.end_date), 'MM/dd')}</TableCell>
                        <TableCell>{request.days}일</TableCell>
                        <TableCell className="max-w-[150px] truncate">{request.reason || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleApprove(request.id)}>
                              <Check className="w-4 h-4 mr-1" />승인
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleReject(request.id)}>
                              <X className="w-4 h-4 mr-1" />반려
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                처리 완료 {processedRequests.length > 0 && `(${processedRequests.length}건)`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {processedRequests.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">처리된 휴가 신청이 없습니다.</p>
              ) : (() => {
                const totalProcessedPages = Math.max(1, Math.ceil(processedRequests.length / PROCESSED_PAGE_SIZE));
                const safeProcessedPage = Math.min(processedPage, totalProcessedPages);
                const paginatedProcessed = processedRequests.slice(
                  (safeProcessedPage - 1) * PROCESSED_PAGE_SIZE,
                  safeProcessedPage * PROCESSED_PAGE_SIZE
                );
                return (
                  <div className="space-y-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>직원</TableHead>
                          <TableHead>부서</TableHead>
                          <TableHead>휴가유형</TableHead>
                          <TableHead>기간</TableHead>
                          <TableHead>일수</TableHead>
                          <TableHead>상태</TableHead>
                          <TableHead>처리일</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedProcessed.map(request => (
                          <TableRow key={request.id}>
                            <TableCell className="font-medium">{getEmployeeInfo(request.employee_id).name}</TableCell>
                            <TableCell>{getEmployeeInfo(request.employee_id).department}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={cn('font-medium', leaveTypeConfig[request.leave_type as keyof typeof leaveTypeConfig]?.class)}>
                                {leaveTypeConfig[request.leave_type as keyof typeof leaveTypeConfig]?.label || request.leave_type}
                              </Badge>
                            </TableCell>
                            <TableCell>{format(parseISO(request.start_date), 'MM/dd')} ~ {format(parseISO(request.end_date), 'MM/dd')}</TableCell>
                            <TableCell>{request.days}일</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={cn('font-medium', statusConfig[request.status as keyof typeof statusConfig]?.class)}>
                                {statusConfig[request.status as keyof typeof statusConfig]?.label || request.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{request.updated_at ? format(parseISO(request.updated_at), 'yyyy-MM-dd') : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {totalProcessedPages > 1 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          총 {processedRequests.length}건 중 {(safeProcessedPage - 1) * PROCESSED_PAGE_SIZE + 1}–{Math.min(safeProcessedPage * PROCESSED_PAGE_SIZE, processedRequests.length)}건
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={safeProcessedPage <= 1}
                            onClick={() => setProcessedPage(p => Math.max(1, p - 1))}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          {Array.from({ length: totalProcessedPages }, (_, i) => i + 1)
                            .filter(p => p === 1 || p === totalProcessedPages || Math.abs(p - safeProcessedPage) <= 2)
                            .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                              if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push('ellipsis');
                              acc.push(p);
                              return acc;
                            }, [])
                            .map((item, idx) =>
                              item === 'ellipsis' ? (
                                <span key={`e-${idx}`} className="px-2 text-muted-foreground">…</span>
                              ) : (
                                <Button
                                  key={item}
                                  variant={item === safeProcessedPage ? 'default' : 'outline'}
                                  size="sm"
                                  className="min-w-[36px]"
                                  onClick={() => setProcessedPage(item)}
                                >
                                  {item}
                                </Button>
                              )
                            )}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={safeProcessedPage >= totalProcessedPages}
                            onClick={() => setProcessedPage(p => Math.min(totalProcessedPages, p + 1))}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== 잔여 휴가 현황 탭 ===== */}
        <TabsContent value="balance" className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold">직원별 잔여 휴가 현황</h3>
              <YearSelector year={balanceYear} onChange={setBalanceYear} />
            </div>
            <Button variant="outline" size="sm" onClick={exportBalanceToExcel}>
              <Download className="w-4 h-4 mr-1" />
              엑셀 내보내기
              {balanceSelectedIds.length > 0 && ` (${balanceSelectedIds.length}명)`}
            </Button>
          </div>

          {/* Employee selection for balance */}
          <EmployeePicker
            employees={activeEmployees}
            selectedIds={balanceSelectedIds}
            onSelectedIdsChange={(ids) => { setBalanceSelectedIds(ids); setBalancePage(1); }}
            description="직원 선택 (엑셀 내보내기 및 필터링용, 미선택 시 전체)"
          />

          {(() => {
            const balanceEmployees = balanceSelectedIds.length > 0
              ? activeEmployees.filter(e => balanceSelectedIds.includes(e.id))
              : activeEmployees;
            const totalPages = Math.max(1, Math.ceil(balanceEmployees.length / BALANCE_PAGE_SIZE));
            const safePage = Math.min(balancePage, totalPages);
            const paginatedEmployees = balanceEmployees.slice(
              (safePage - 1) * BALANCE_PAGE_SIZE,
              safePage * BALANCE_PAGE_SIZE
            );

            return (
              <>
                <div className="rounded-lg border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>사원번호</TableHead>
                        <TableHead>이름</TableHead>
                        <TableHead>부서</TableHead>
                        <TableHead className="text-center">총 연차</TableHead>
                        <TableHead className="text-center">사용</TableHead>
                        <TableHead className="text-center">잔여</TableHead>
                        <TableHead className="text-center">사용률</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedEmployees.map(employee => {
                        const totalAnnualLeave = calculateAnnualLeave(employee.hire_date, balanceYear);
                        const usedLeave = balanceYearRecords
                          .filter(r => r.employee_id === employee.id && r.status === 'approved')
                          .reduce((sum, r) => sum + Number(r.days), 0);
                        const remainingLeave = totalAnnualLeave - usedLeave;
                        const usageRate = totalAnnualLeave > 0 ? Math.round((usedLeave / totalAnnualLeave) * 100) : 0;

                        return (
                          <TableRow key={employee.id}>
                            <TableCell className="font-medium">{employee.employee_number}</TableCell>
                            <TableCell>{employee.name}</TableCell>
                            <TableCell>{employee.department || '-'}</TableCell>
                            <TableCell className="text-center">{totalAnnualLeave}일</TableCell>
                            <TableCell className="text-center">{usedLeave}일</TableCell>
                            <TableCell className="text-center font-semibold text-primary">{remainingLeave}일</TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  'font-medium',
                                  usageRate >= 80 ? 'bg-red-100 text-red-800' :
                                  usageRate >= 50 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-green-100 text-green-800'
                                )}
                              >
                                {usageRate}%
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-sm text-muted-foreground">
                      총 {balanceEmployees.length}명 중 {(safePage - 1) * BALANCE_PAGE_SIZE + 1}–{Math.min(safePage * BALANCE_PAGE_SIZE, balanceEmployees.length)}명
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safePage <= 1}
                        onClick={() => setBalancePage(p => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                        .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                          if (idx > 0 && p - (arr[idx - 1]) > 1) acc.push('ellipsis');
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((item, idx) =>
                          item === 'ellipsis' ? (
                            <span key={`e-${idx}`} className="px-2 text-muted-foreground">…</span>
                          ) : (
                            <Button
                              key={item}
                              variant={item === safePage ? 'default' : 'outline'}
                              size="sm"
                              className="min-w-[36px]"
                              onClick={() => setBalancePage(item)}
                            >
                              {item}
                            </Button>
                          )
                        )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={safePage >= totalPages}
                        onClick={() => setBalancePage(p => Math.min(totalPages, p + 1))}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
