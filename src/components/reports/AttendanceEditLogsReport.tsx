import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Search, Filter, CalendarIcon, Download } from 'lucide-react';
import { exportEditLogsToExcel } from './exportEditLogs';

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

interface EditLog {
  id: string;
  attendance_record_id: string;
  organization_id: string;
  employee_id: string;
  edited_by: string;
  edited_at: string;
  previous_check_in: string | null;
  new_check_in: string | null;
  previous_check_out: string | null;
  new_check_out: string | null;
  previous_status: string | null;
  new_status: string | null;
  reason: string;
  created_at: string;
  employee?: {
    name: string;
    employee_number: string;
    department: string | null;
  };
  attendance_record?: {
    date: string;
  };
}

export function AttendanceEditLogsReport() {
  const { currentOrganization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(subMonths(new Date(), 1)));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(new Date()));

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['attendance-edit-logs-all', currentOrganization?.id, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      let query = supabase
        .from('attendance_edit_logs')
        .select(`
          *,
          employee:employees(name, employee_number, department),
          attendance_record:attendance_records(date)
        `)
        .eq('organization_id', currentOrganization.id)
        .order('edited_at', { ascending: false });

      if (startDate) {
        query = query.gte('edited_at', startDate.toISOString());
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('edited_at', endOfDay.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as EditLog[];
    },
    enabled: !!currentOrganization?.id,
  });

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      !searchTerm ||
      log.employee?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.employee?.employee_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.reason.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = (() => {
      if (filterType === 'all') return true;
      if (filterType === 'time') {
        return log.previous_check_in !== log.new_check_in || log.previous_check_out !== log.new_check_out;
      }
      if (filterType === 'status') {
        return log.previous_status !== log.new_status;
      }
      return true;
    })();

    return matchesSearch && matchesFilter;
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
          로딩 중...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4" />
          근태 수정 이력 ({filteredLogs.length}건)
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportEditLogsToExcel(filteredLogs)}
          disabled={filteredLogs.length === 0}
        >
          <Download className="w-4 h-4 mr-1" />
          Excel 다운로드
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date Range + Filters */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full sm:w-[180px] justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, 'yyyy-MM-dd') : '시작일'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full sm:w-[180px] justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, 'yyyy-MM-dd') : '종료일'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {(startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={() => { setStartDate(undefined); setEndDate(undefined); }}>
                초기화
              </Button>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="직원명, 사번, 사유 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 수정</SelectItem>
                <SelectItem value="time">시간 변경</SelectItem>
                <SelectItem value="status">상태 변경</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">
              {logs.length === 0 ? '수정 이력이 없습니다.' : '검색 결과가 없습니다.'}
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[calc(100vh-350px)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[100px]">수정일시</TableHead>
                  <TableHead className="min-w-[80px]">근무일</TableHead>
                  <TableHead className="min-w-[80px]">직원</TableHead>
                  <TableHead className="min-w-[60px]">부서</TableHead>
                  <TableHead className="min-w-[120px]">변경 내용</TableHead>
                  <TableHead className="min-w-[150px]">수정 사유</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(log.edited_at), 'yyyy-MM-dd HH:mm', { locale: ko })}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {log.attendance_record?.date
                        ? format(new Date(log.attendance_record.date + 'T00:00:00'), 'MM/dd (EEE)', { locale: ko })
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{log.employee?.name || '-'}</div>
                      <div className="text-xs text-muted-foreground">{log.employee?.employee_number}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.employee?.department || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {log.previous_check_in !== log.new_check_in && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">출근: </span>
                            <span className="line-through text-muted-foreground">{formatTime(log.previous_check_in)}</span>
                            <span className="mx-1">→</span>
                            <span className="font-medium text-primary">{formatTime(log.new_check_in)}</span>
                          </div>
                        )}
                        {log.previous_check_out !== log.new_check_out && (
                          <div className="text-xs">
                            <span className="text-muted-foreground">퇴근: </span>
                            <span className="line-through text-muted-foreground">{formatTime(log.previous_check_out)}</span>
                            <span className="mx-1">→</span>
                            <span className="font-medium text-primary">{formatTime(log.new_check_out)}</span>
                          </div>
                        )}
                        {log.previous_status !== log.new_status && (
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground">상태: </span>
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              {statusLabels[log.previous_status || ''] || log.previous_status || '-'}
                            </Badge>
                            <span>→</span>
                            <Badge variant="secondary" className="text-[10px] px-1 py-0">
                              {statusLabels[log.new_status || ''] || log.new_status || '-'}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate" title={log.reason}>
                      {log.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
