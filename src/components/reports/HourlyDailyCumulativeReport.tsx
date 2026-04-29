import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useEmployees } from '@/hooks/useEmployees';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { DollarSign, Target, TrendingUp, TrendingDown, BarChart3, Loader2, Users } from 'lucide-react';
import { DailyWageSnapshot } from '@/hooks/useDailyWageSnapshots';

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatCurrency(value: number): string {
  if (value >= 10000) return `${Math.round(value / 10000)}만`;
  if (value >= 1000) return `${Math.round(value / 1000)}천`;
  return `${value}`;
}

function formatFullCurrency(value: number): string {
  return value.toLocaleString('ko-KR') + '원';
}

interface DayData {
  day: number;
  date: string;
  confirmedDaily: number;
  estimatedDaily: number;
  confirmedCum: number;
  estimatedCum: number;
  weeklyAllowance: number;
  isFuture: boolean;
  isToday: boolean;
}

export function HourlyDailyCumulativeReport() {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [payTypeFilter, setPayTypeFilter] = useState('전체');
  const { currentOrganization } = useOrganization();
  const { employees } = useEmployees();

  const orgId = currentOrganization?.id;
  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const isCurrentMonth = selectedYear === today.getFullYear() && selectedMonth === today.getMonth() + 1;
  const todayDay = isCurrentMonth ? today.getDate() : daysInMonth;

  // Current month snapshots
  const startDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
  const endDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const { data: monthSnapshots = [], isLoading } = useQuery({
    queryKey: ['hourly-daily-snapshots', orgId, selectedYear, selectedMonth],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('daily_wage_snapshots' as any)
        .select('*')
        .eq('organization_id', orgId)
        .gte('work_date', startDateStr)
        .lte('work_date', endDateStr);
      if (error) throw error;
      return (data || []) as unknown as DailyWageSnapshot[];
    },
    enabled: !!orgId,
  });

  // Current month attendance records for status counting
  const { data: monthAttendance = [] } = useQuery({
    queryKey: ['hourly-daily-attendance', orgId, selectedYear, selectedMonth],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('attendance_records')
        .select('employee_id, status, date')
        .eq('organization_id', orgId)
        .gte('date', startDateStr)
        .lte('date', endDateStr);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  // Previous month snapshots (for same-day comparison)
  const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const prevDaysInMonth = getDaysInMonth(prevYear, prevMonth);

  const { data: prevMonthSnapshots = [] } = useQuery({
    queryKey: ['hourly-daily-snapshots-prev', orgId, prevYear, prevMonth],
    queryFn: async () => {
      if (!orgId) return [];
      const pStartDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
      const pEndDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevDaysInMonth).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('daily_wage_snapshots' as any)
        .select('*')
        .eq('organization_id', orgId)
        .gte('work_date', pStartDate)
        .lte('work_date', pEndDate);
      if (error) throw error;
      return (data || []) as unknown as DailyWageSnapshot[];
    },
    enabled: !!orgId,
  });

  const hourlyDailyEmployees = useMemo(
    () => employees.filter(e => e.is_active && e.pay_type !== 'monthly' && e.employment_type !== 'daily'),
    [employees]
  );

  // Previous month same-day cumulative
  const prevMonthSameDayCum = useMemo(() => {
    if (!prevMonthSnapshots.length) return null;
    const compareDay = Math.min(todayDay, prevDaysInMonth);
    let total = 0;
    let hasDays = false;
    for (let d = 1; d <= compareDay; d++) {
      const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const daySnaps = prevMonthSnapshots.filter(s => s.work_date === dateStr);
      if (daySnaps.length > 0) {
        total += daySnaps.reduce((sum, s) => sum + Number(s.total_wage || 0), 0);
        hasDays = true;
      }
    }
    return hasDays ? total : null;
  }, [prevMonthSnapshots, todayDay, prevYear, prevMonth, prevDaysInMonth]);

  // Employee cumulative breakdown with attendance status counts
  const employeeCumulativeList = useMemo(() => {
    const empMap: Record<string, { name: string; payType: string; totalWage: number; statusCounts: Record<string, number> }> = {};
    const todayStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`;

    // Accumulate wages
    monthSnapshots.forEach(s => {
      if (s.work_date > todayStr) return;
      const emp = hourlyDailyEmployees.find(e => e.id === s.employee_id);
      if (!emp) return;
      if (!empMap[s.employee_id]) {
        empMap[s.employee_id] = { name: emp.name, payType: emp.pay_type === 'hourly' ? '시급제' : '일급제', totalWage: 0, statusCounts: {} };
      }
      empMap[s.employee_id].totalWage += Number(s.total_wage || 0);
    });

    // Accumulate attendance status counts
    monthAttendance.forEach((att: any) => {
      const empId = att.employee_id;
      if (!empMap[empId]) {
        const emp = hourlyDailyEmployees.find(e => e.id === empId);
        if (!emp) return;
        empMap[empId] = { name: emp.name, payType: emp.pay_type === 'hourly' ? '시급제' : '일급제', totalWage: 0, statusCounts: {} };
      }
      const status = att.status || 'present';
      empMap[empId].statusCounts[status] = (empMap[empId].statusCounts[status] || 0) + 1;
    });

    const list = Object.values(empMap).sort((a, b) => b.totalWage - a.totalWage);
    return list;
  }, [monthSnapshots, monthAttendance, hourlyDailyEmployees, todayDay, selectedYear, selectedMonth]);

  const filteredEmployeeList = useMemo(() => {
    if (payTypeFilter === '전체') return employeeCumulativeList;
    return employeeCumulativeList.filter(e => e.payType === payTypeFilter);
  }, [employeeCumulativeList, payTypeFilter]);

  const { chartData, currentCumulative, estimatedTotal, avgDailyWage } = useMemo(() => {
    if (!hourlyDailyEmployees.length) return { chartData: [], currentCumulative: 0, estimatedTotal: 0, avgDailyWage: 0 };

    const snapshotsByDate: Record<string, DailyWageSnapshot[]> = {};
    monthSnapshots.forEach(s => {
      if (!snapshotsByDate[s.work_date]) snapshotsByDate[s.work_date] = [];
      snapshotsByDate[s.work_date].push(s);
    });

    let totalWages = 0;
    let totalDays = 0;
    for (let d = 1; d <= Math.min(todayDay, daysInMonth); d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const daySnaps = snapshotsByDate[dateStr] || [];
      if (daySnaps.length > 0) {
        totalWages += daySnaps.reduce((sum, s) => sum + Number(s.total_wage || 0), 0);
        totalDays++;
      }
    }
    const avgDaily = totalDays > 0 ? totalWages / totalDays : 0;

    const data: DayData[] = [];
    let cumConfirmed = 0;
    let cumEstimated = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isFuture = d > todayDay;
      const isToday = d === todayDay;

      let confirmedDaily = 0;
      let estimatedDaily = 0;

      if (!isFuture) {
        const daySnaps = snapshotsByDate[dateStr] || [];
        confirmedDaily = daySnaps.reduce((sum, s) => sum + Number(s.total_wage || 0), 0);
      } else {
        estimatedDaily = avgDaily;
      }

      cumConfirmed += confirmedDaily;
      cumEstimated += confirmedDaily + estimatedDaily;

      data.push({
        day: d,
        date: `${d}일`,
        confirmedDaily: Math.round(confirmedDaily),
        estimatedDaily: Math.round(estimatedDaily),
        confirmedCum: Math.round(cumConfirmed),
        estimatedCum: Math.round(cumEstimated),
        weeklyAllowance: 0,
        isFuture,
        isToday,
      });
    }

    const currentCum = data[Math.min(todayDay, daysInMonth) - 1]?.confirmedCum || 0;
    const estTotal = data[daysInMonth - 1]?.estimatedCum || 0;

    return { chartData: data, currentCumulative: currentCum, estimatedTotal: estTotal, avgDailyWage: avgDaily };
  }, [hourlyDailyEmployees, monthSnapshots, daysInMonth, todayDay, selectedYear, selectedMonth]);

  // MoM change rate
  const momChangeRate = useMemo(() => {
    if (prevMonthSameDayCum === null || prevMonthSameDayCum === 0) return null;
    return ((currentCumulative - prevMonthSameDayCum) / prevMonthSameDayCum) * 100;
  }, [currentCumulative, prevMonthSameDayCum]);

  const dailyMax = useMemo(() => {
    const max = Math.max(...chartData.map(d => Math.max(d.confirmedDaily, d.estimatedDaily)), 1);
    return Math.ceil(max * 1.3);
  }, [chartData]);

  const cumMax = useMemo(() => {
    const max = Math.max(...chartData.map(d => d.estimatedCum), 1);
    return Math.ceil(max * 1.3);
  }, [chartData]);

  const years = Array.from({ length: 3 }, (_, i) => today.getFullYear() - 1 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-background/95 backdrop-blur p-3 shadow-xl text-xs space-y-1.5">
        <p className="font-semibold text-foreground">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium text-foreground">{formatFullCurrency(entry.value)}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 opacity-50">
          <div className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/30" />
          <span className="text-muted-foreground">주휴수당(개발예정):</span>
          <span className="font-medium text-foreground">0원</span>
        </div>
      </div>
    );
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">시급/일급 급여 누적 현황</h2>
        <div className="flex items-center gap-2">
          <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-24 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-20 h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m} value={String(m)}>{m}월</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-lg bg-primary/15 p-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">현재 누적 총액</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{formatFullCurrency(currentCumulative)}</p>
                <p className="text-xs text-muted-foreground mt-1">1일 ~ {todayDay}일 확정분</p>
              </CardContent>
            </Card>

            {/* MoM comparison card */}
            <Card className="bg-gradient-to-br from-secondary/10 via-secondary/5 to-background border-border">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-lg bg-secondary p-2">
                    {momChangeRate !== null && momChangeRate >= 0
                      ? <TrendingUp className="h-5 w-5 text-destructive" />
                      : <TrendingDown className="h-5 w-5 text-primary" />}
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">전월 동일 시점 대비</span>
                </div>
                {momChangeRate !== null ? (
                  <>
                    <p className={`text-2xl font-bold tracking-tight ${momChangeRate >= 0 ? 'text-destructive' : 'text-primary'}`}>
                      {momChangeRate >= 0 ? '+' : ''}{momChangeRate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      전월 {todayDay}일까지: {formatFullCurrency(prevMonthSameDayCum || 0)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold tracking-tight text-muted-foreground">데이터 부족</p>
                    <p className="text-xs text-muted-foreground mt-1">전월 비교 데이터 없음</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-accent/10 via-accent/5 to-background border-accent/20">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-lg bg-accent/15 p-2">
                    <Target className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">이번 달 예상 최종액</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{formatFullCurrency(estimatedTotal)}</p>
                <p className="text-xs text-muted-foreground mt-1">실데이터 + 평균 예측치</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-muted/30 via-muted/10 to-background border-border">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-lg bg-muted p-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">일평균 인건비</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{formatFullCurrency(Math.round(avgDailyWage))}</p>
                <p className="text-xs text-muted-foreground mt-1">대상 직원: {hourlyDailyEmployees.length}명</p>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">일별 발생액 및 누적 추이</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-primary" />
                  <span>확정 발생액</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-amber-400/70" />
                  <span>예상 발생액</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-1 rounded-sm bg-muted-foreground/20" />
                  <span>주휴수당(예정)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-0.5 bg-primary rounded" />
                  <span>확정 누적</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-0.5 border-t-2 border-dashed border-amber-500 rounded" />
                  <span>예상 누적</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 24, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      className="text-muted-foreground"
                      interval={Math.max(0, Math.floor(daysInMonth / 10) - 1)}
                    />
                    <YAxis
                      yAxisId="daily"
                      orientation="left"
                      tick={{ fontSize: 11 }}
                      tickFormatter={formatCurrency}
                      domain={[0, dailyMax]}
                      className="text-muted-foreground"
                    />
                    <YAxis
                      yAxisId="cumulative"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      tickFormatter={formatCurrency}
                      domain={[0, cumMax]}
                      className="text-muted-foreground"
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine
                      yAxisId="daily"
                      x={`${todayDay}일`}
                      stroke="hsl(var(--primary))"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{ value: '오늘', position: 'top', fontSize: 11, fill: 'hsl(var(--primary))' }}
                    />
                    {/* Weekly allowance placeholder - thin gray bar at bottom */}
                    <Bar yAxisId="daily" dataKey="weeklyAllowance" name="주휴수당(개발예정)" stackId="daily" fill="hsl(var(--muted-foreground))" radius={[0, 0, 0, 0]} barSize={12} opacity={0.15} />
                    <Bar yAxisId="daily" dataKey="confirmedDaily" name="확정 발생액" stackId="daily" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} barSize={12} />
                    <Bar yAxisId="daily" dataKey="estimatedDaily" name="예상 발생액" fill="hsl(45, 80%, 50%)" radius={[3, 3, 0, 0]} barSize={12} opacity={0.6} />
                    <Line yAxisId="cumulative" type="monotone" dataKey="confirmedCum" name="확정 누적" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
                    <Line yAxisId="cumulative" type="monotone" dataKey="estimatedCum" name="예상 누적" stroke="hsl(45, 80%, 50%)" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Employee Cumulative List */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">직원별 누적 내역</CardTitle>
                <Badge variant="secondary" className="ml-2 text-xs">{filteredEmployeeList.length}명</Badge>
              </div>
              <div className="flex items-center gap-1.5 mt-3">
                {['전체', '시급제', '일급제'].map(label => (
                  <button
                    key={label}
                    onClick={() => setPayTypeFilter(label)}
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      payTypeFilter === label
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {label} {label === '전체' ? employeeCumulativeList.length : employeeCumulativeList.filter(e => e.payType === label).length}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {filteredEmployeeList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">해당 기간의 시급/일급 근태 데이터가 없습니다.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>직원명</TableHead>
                      <TableHead>근무형태</TableHead>
                      <TableHead>출근 일수</TableHead>
                      <TableHead className="text-right">누적 급여</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployeeList.map((emp, i) => {
                      const sc = emp.statusCounts;
                      const presentDays = (sc['present'] || 0) + (sc['late'] || 0);
                      const absentDays = sc['absent'] || 0;
                      const leaveDays = sc['leave'] || 0;
                      const lateDays = sc['late'] || 0;
                      const halfDayDays = sc['half_day'] || 0;
                      const hasOther = absentDays > 0 || leaveDays > 0 || lateDays > 0 || halfDayDays > 0;

                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{emp.name}</TableCell>
                          <TableCell>
                            <Badge variant={emp.payType === '시급제' ? 'default' : 'secondary'} className="text-xs">
                              {emp.payType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                                출근 {presentDays}
                              </Badge>
                              {absentDays > 0 && (
                                <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20">
                                  결근 {absentDays}
                                </Badge>
                              )}
                              {leaveDays > 0 && (
                                <Badge variant="outline" className="text-xs bg-violet-500/10 text-violet-600 border-violet-500/20">
                                  휴가 {leaveDays}
                                </Badge>
                              )}
                              {lateDays > 0 && (
                                <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">
                                  지각 {lateDays}
                                </Badge>
                              )}
                              {halfDayDays > 0 && (
                                <Badge variant="outline" className="text-xs bg-sky-500/10 text-sky-600 border-sky-500/20">
                                  반차 {halfDayDays}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatFullCurrency(emp.totalWage)}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={2}>합계</TableCell>
                      <TableCell />
                      <TableCell className="text-right">
                        {formatFullCurrency(filteredEmployeeList.reduce((s, e) => s + e.totalWage, 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
