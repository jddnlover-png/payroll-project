import { useState } from 'react';
import { useEmployeeStore } from '@/store/employeeStore';
import { Employee, PayrollRecord } from '@/types/employee';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, TrendingUp, TrendingDown, Minus, History, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PaySlip } from './PaySlip';

interface PayrollHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);

export function PayrollHistory({ open, onOpenChange, employee }: PayrollHistoryProps) {
  const { payroll } = useEmployeeStore();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [paySlipOpen, setPaySlipOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);

  if (!employee) return null;

  // Get all payroll records for this employee
  const employeePayroll = payroll
    .filter((p) => p.employeeId === employee.id)
    .sort((a, b) => b.month.localeCompare(a.month));

  // Get available years
  const years = [...new Set(employeePayroll.map((p) => p.month.slice(0, 4)))];
  if (years.length === 0) {
    years.push(new Date().getFullYear().toString());
  }

  // Filter by selected year
  const filteredPayroll = employeePayroll.filter((p) => p.month.startsWith(selectedYear));

  // Calculate yearly summary
  const yearlySummary = {
    totalBaseSalary: filteredPayroll.reduce((sum, r) => sum + r.baseSalary, 0),
    totalOvertime: filteredPayroll.reduce((sum, r) => sum + r.overtime, 0),
    totalBonus: filteredPayroll.reduce((sum, r) => sum + r.bonus, 0),
    totalDeductions: filteredPayroll.reduce((sum, r) => sum + r.deductions, 0),
    totalNetSalary: filteredPayroll.reduce((sum, r) => sum + r.netSalary, 0),
    avgNetSalary: filteredPayroll.length > 0 
      ? filteredPayroll.reduce((sum, r) => sum + r.netSalary, 0) / filteredPayroll.length 
      : 0,
    months: filteredPayroll.length,
  };

  const handleViewPaySlip = (record: PayrollRecord) => {
    setSelectedRecord(record);
    setPaySlipOpen(true);
  };

  // Calculate month-over-month change
  const getChangeIndicator = (index: number) => {
    if (index >= filteredPayroll.length - 1) return null;
    const current = filteredPayroll[index].netSalary;
    const previous = filteredPayroll[index + 1].netSalary;
    const diff = current - previous;
    const percentage = previous > 0 ? ((diff / previous) * 100).toFixed(1) : '0';

    if (diff > 0) {
      return (
        <span className="flex items-center text-xs text-green-600">
          <TrendingUp className="w-3 h-3 mr-1" />
          +{percentage}%
        </span>
      );
    } else if (diff < 0) {
      return (
        <span className="flex items-center text-xs text-destructive">
          <TrendingDown className="w-3 h-3 mr-1" />
          {percentage}%
        </span>
      );
    }
    return (
      <span className="flex items-center text-xs text-muted-foreground">
        <Minus className="w-3 h-3 mr-1" />
        0%
      </span>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              급여 히스토리 - {employee.name} ({employee.employeeNumber})
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Year Selector */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}년
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Yearly Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground">연간 총 기본급</CardTitle>
                </CardHeader>
                <CardContent className="pb-3 px-3">
                  <div className="text-lg font-bold">{formatCurrency(yearlySummary.totalBaseSalary)}</div>
                </CardContent>
              </Card>
              <Card className="status-green">
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-xs font-medium opacity-80">연간 총 수당</CardTitle>
                </CardHeader>
                <CardContent className="pb-3 px-3">
                  <div className="text-lg font-bold">{formatCurrency(yearlySummary.totalOvertime + yearlySummary.totalBonus)}</div>
                </CardContent>
              </Card>
              <Card className="status-red">
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-xs font-medium opacity-80">연간 총 공제</CardTitle>
                </CardHeader>
                <CardContent className="pb-3 px-3">
                  <div className="text-lg font-bold">{formatCurrency(yearlySummary.totalDeductions)}</div>
                </CardContent>
              </Card>
              <Card className="bg-primary text-primary-foreground">
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-xs font-medium opacity-80">연간 총 실지급</CardTitle>
                </CardHeader>
                <CardContent className="pb-3 px-3">
                  <div className="text-lg font-bold">{formatCurrency(yearlySummary.totalNetSalary)}</div>
                  <div className="text-xs opacity-70">월평균: {formatCurrency(yearlySummary.avgNetSalary)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Monthly History Table */}
            {filteredPayroll.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {selectedYear}년 급여 데이터가 없습니다.
              </div>
            ) : (
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>월</TableHead>
                      <TableHead className="text-center">출근/지각/결근</TableHead>
                      <TableHead className="text-right">기본급</TableHead>
                      <TableHead className="text-right">연장근로가산수당</TableHead>
                      <TableHead className="text-right">공제</TableHead>
                      <TableHead className="text-right">실지급액</TableHead>
                      <TableHead className="text-center">변동</TableHead>
                      <TableHead className="text-center">상태</TableHead>
                      <TableHead className="text-center">명세서</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayroll.map((record, index) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {record.month.slice(5)}월
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Badge variant="secondary" className="status-green text-xs">
                              {record.presentDays}
                            </Badge>
                            <Badge variant="secondary" className={record.lateDays > 0 ? 'status-yellow text-xs' : 'text-xs'}>
                              {record.lateDays}
                            </Badge>
                            <Badge variant="secondary" className={record.absentDays > 0 ? 'status-red text-xs' : 'text-xs'}>
                              {record.absentDays}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(record.baseSalary)}</TableCell>
                        <TableCell className="text-right text-green-600">
                          +{formatCurrency(record.overtime)}
                        </TableCell>
                        <TableCell className="text-right text-destructive">
                          -{formatCurrency(record.deductions)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(record.netSalary)}
                        </TableCell>
                        <TableCell className="text-center">
                          {getChangeIndicator(index)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-xs',
                              record.status === 'paid' ? 'status-green' : 'status-yellow'
                            )}
                          >
                            {record.status === 'paid' ? '지급완료' : '대기'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => handleViewPaySlip(record)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 급여명세서 다이얼로그 */}
      <PaySlip
        open={paySlipOpen}
        onOpenChange={setPaySlipOpen}
        record={selectedRecord}
        employee={employee}
      />
    </>
  );
}
