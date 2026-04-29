import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEmployees, Employee } from '@/hooks/useEmployees';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { useEmployeePayrollSettings } from '@/hooks/useEmployeePayrollSettings';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Target, BarChart3, Loader2 } from 'lucide-react';
import { DailyWageSnapshot } from '@/hooks/useDailyWageSnapshots';

// ─── Helpers ───
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

// ─── Types ───
interface DayData {
  day: number;
  date: string;
  confirmedDaily: number;    // 확정 일별 발생액
  estimatedDaily: number;    // 예상 일별 발생액
  confirmedCum: number;      // 확정 누적
  estimatedCum: number;      // 예상 누적 (확정 포함)
  isFuture: boolean;
  isToday: boolean;
}

export function MonthlyCumulativeLaborCost() {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const { currentOrganization } = useOrganization();
  const { employees } = useEmployees();
  const { settings } = useOrganizationSettings();
  const { getEmployeePaymentItems } = useEmployeePayrollSettings();

  const orgId = currentOrganization?.id;
  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const todayDay = selectedYear === today.getFullYear() && selectedMonth === today.getMonth() + 1
    ? today.getDate() : daysInMonth;

  // ─── Fetch daily wage snapshots for the entire month ───
  const { data: monthSnapshots = [], isLoading: snapshotsLoading } = useQuery({
    queryKey: ['monthly-wage-snapshots', orgId, selectedYear, selectedMonth],
    queryFn: async () => {
      if (!orgId) return [];
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('daily_wage_snapshots' as any)
        .select('*')
        .eq('organization_id', orgId)
        .gte('work_date', startDate)
        .lte('work_date', endDate);
      if (error) throw error;
      return (data || []) as unknown as DailyWageSnapshot[];
    },
    enabled: !!orgId,
  });

  // ─── Fetch attendance records for the month ───
  const { data: monthAttendance = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ['monthly-attendance-records', orgId, selectedYear, selectedMonth],
    queryFn: async () => {
      if (!orgId) return [];
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('organization_id', orgId)
        .gte('date', startDate)
        .lte('date', endDate);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  // ─── Fetch previous month payroll for comparison ───
  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
  const { data: prevPayroll = [] } = useQuery({
    queryKey: ['prev-month-payroll', orgId, prevYear, prevMonth],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('payroll_records')
        .select('*')
        .eq('organization_id', orgId)
        .eq('period_year', prevYear)
        .eq('period_month', prevMonth);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  // ─── Calculate daily data ───
  const { chartData, currentCumulative, estimatedTotal, prevMonthTotal, changeRate } = useMemo(() => {
    if (!employees.length) return { chartData: [], currentCumulative: 0, estimatedTotal: 0, prevMonthTotal: 0, changeRate: 0 };

    const activeEmployees = employees.filter(e => e.is_active);
    const monthlyEmployees = activeEmployees.filter(e => e.pay_type === 'monthly');
    const hourlyDailyEmployees = activeEmployees.filter(e => e.pay_type !== 'monthly');

    // ── Monthly employees: daily fixed cost ──
    const getMonthlyFixedPerDay = (emp: Employee) => {
      const baseSalary = emp.base_salary || 0;
      let fixedAllowances = 0;
      try {
        const items = getEmployeePaymentItems(emp.id);
        items.forEach((item: any) => {
          if (item.isActive && item.type === 'fixed' && item.id !== 'base') {
            fixedAllowances += (item.overrideValue ?? item.defaultValue ?? 0);
          }
        });
      } catch { /* ignore */ }
      return (baseSalary + fixedAllowances) / daysInMonth;
    };

    const getHourlyFixedPerDay = (emp: Employee) => {
      let fixedAllowances = 0;
      try {
        const items = getEmployeePaymentItems(emp.id);
        items.forEach((item: any) => {
          if (item.isActive && item.type === 'fixed' && item.id !== 'base') {
            fixedAllowances += (item.overrideValue ?? item.defaultValue ?? 0);
          }
        });
      } catch { /* ignore */ }
      return fixedAllowances / daysInMonth;
    };

    // Group snapshots by date
    const snapshotsByDate: Record<string, DailyWageSnapshot[]> = {};
    monthSnapshots.forEach(s => {
      if (!snapshotsByDate[s.work_date]) snapshotsByDate[s.work_date] = [];
      snapshotsByDate[s.work_date].push(s);
    });

    // Calculate average daily wage for hourly workers (for future prediction)
    let totalHourlyWages = 0;
    let totalHourlyDays = 0;
    for (let d = 1; d <= Math.min(todayDay, daysInMonth); d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const daySnapshots = snapshotsByDate[dateStr] || [];
      if (daySnapshots.length > 0) {
        totalHourlyWages += daySnapshots.reduce((sum, s) => sum + Number(s.total_wage || 0), 0);
        totalHourlyDays++;
      }
    }
    const avgDailyHourlyWage = totalHourlyDays > 0 ? totalHourlyWages / totalHourlyDays : 0;

    // Total monthly fixed cost per day
    const dailyMonthlyFixed = monthlyEmployees.reduce((sum, emp) => sum + getMonthlyFixedPerDay(emp), 0);
    const dailyHourlyFixed = hourlyDailyEmployees.reduce((sum, emp) => sum + getHourlyFixedPerDay(emp), 0);

    // Build daily chart data
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
        // ── 과거/오늘: 확정 발생액만 표시, 예상액 = 0 ──
        // 월급제 고정비 (기본급 + 고정수당을 월력일수로 균등 배분)
        confirmedDaily += dailyMonthlyFixed;
        // 시급제 고정수당
        confirmedDaily += dailyHourlyFixed;
        // 시급제/일급제 실제 스냅샷 (신뢰할 수 있는 확정 데이터)
        const daySnapshots = snapshotsByDate[dateStr] || [];
        confirmedDaily += daySnapshots.reduce((sum, s) => sum + Number(s.total_wage || 0), 0);
        // 예상액은 0
        estimatedDaily = 0;
      } else {
        // ── 미래: 예상 발생액만 표시, 확정액 = 0 ──
        confirmedDaily = 0;
        estimatedDaily += dailyMonthlyFixed;
        estimatedDaily += dailyHourlyFixed;
        estimatedDaily += avgDailyHourlyWage;
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
        isFuture,
        isToday,
      });
    }

    const currentCum = data[Math.min(todayDay, daysInMonth) - 1]?.confirmedCum || 0;
    const estTotal = data[daysInMonth - 1]?.estimatedCum || 0;
    const prevTotal = prevPayroll.reduce((sum, p) => sum + Number(p.net_salary || 0), 0);
    const rate = prevTotal > 0 ? ((estTotal - prevTotal) / prevTotal) * 100 : 0;

    return { chartData: data, currentCumulative: currentCum, estimatedTotal: estTotal, prevMonthTotal: prevTotal, changeRate: rate };
  }, [employees, monthSnapshots, monthAttendance, prevPayroll, settings, daysInMonth, todayDay, selectedYear, selectedMonth, getEmployeePaymentItems]);

  const isLoading = snapshotsLoading || attendanceLoading;

  // Year/month options
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
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">월간 누적 인건비 현황</h2>
        <div className="flex items-center gap-2">
          <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-24 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-20 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            <Card className="bg-gradient-to-br from-accent/10 via-accent/5 to-background border-accent/20">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-lg bg-accent/15 p-2">
                    <Target className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">이번 달 예상 최종액</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{formatFullCurrency(estimatedTotal)}</p>
                <p className="text-xs text-muted-foreground mt-1">고정비 + 확정수당 + 예상수당</p>
              </CardContent>
            </Card>

            <Card className={`bg-gradient-to-br border ${changeRate >= 0 ? 'from-destructive/10 via-destructive/5 border-destructive/20' : 'from-green-500/10 via-green-500/5 border-green-500/20'} to-background`}>
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`rounded-lg p-2 ${changeRate >= 0 ? 'bg-destructive/15' : 'bg-green-500/15'}`}>
                    {changeRate >= 0
                      ? <TrendingUp className="h-5 w-5 text-destructive" />
                      : <TrendingDown className="h-5 w-5 text-green-600" />
                    }
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">전월 대비 변동률</span>
                </div>
                <p className={`text-2xl font-bold tracking-tight ${changeRate >= 0 ? 'text-destructive' : 'text-green-600'}`}>
                  {changeRate >= 0 ? '▲' : '▼'} {Math.abs(changeRate).toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  전월({prevMonth}월): {formatFullCurrency(prevMonthTotal)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Combo Chart */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">일별 발생액 및 누적 추이</CardTitle>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-primary" />
                  <span>확정 발생액 (막대)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-amber-400/70" />
                  <span>예상 발생액 (막대)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-0.5 bg-primary rounded" />
                  <span>확정 누적 (실선)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-0.5 border-t-2 border-dashed border-amber-500 rounded" />
                  <span>예상 누적 (점선)</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
                      className="text-muted-foreground"
                    />
                    <YAxis
                      yAxisId="cumulative"
                      orientation="right"
                      tick={{ fontSize: 11 }}
                      tickFormatter={formatCurrency}
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

                    {/* Bars: daily amounts */}
                    <Bar
                      yAxisId="daily"
                      dataKey="confirmedDaily"
                      name="확정 발생액"
                      fill="hsl(var(--primary))"
                      radius={[2, 2, 0, 0]}
                      stackId="daily"
                      maxBarSize={16}
                    />
                    <Bar
                      yAxisId="daily"
                      dataKey="estimatedDaily"
                      name="예상 발생액"
                      fill="hsl(45, 93%, 58%)"
                      fillOpacity={0.7}
                      radius={[2, 2, 0, 0]}
                      stackId="daily"
                      maxBarSize={16}
                    />

                    {/* Lines: cumulative */}
                    <Line
                      yAxisId="cumulative"
                      type="monotone"
                      dataKey="confirmedCum"
                      name="확정 누적"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      yAxisId="cumulative"
                      type="monotone"
                      dataKey="estimatedCum"
                      name="예상 누적"
                      stroke="hsl(35, 92%, 50%)"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Employee type breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">월급제 직원</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {employees.filter(e => e.is_active && e.pay_type === 'monthly').map(emp => (
                  <div key={emp.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                    <div>
                      <span className="font-medium">{emp.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{emp.department || '-'}</span>
                    </div>
                    <span className="font-mono text-sm">{formatFullCurrency(emp.base_salary)}</span>
                  </div>
                ))}
                {employees.filter(e => e.is_active && e.pay_type === 'monthly').length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">월급제 직원이 없습니다.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">시급제/일급제 직원</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {employees.filter(e => e.is_active && e.pay_type !== 'monthly').map(emp => {
                  const empSnapshots = monthSnapshots.filter(s => s.employee_id === emp.id);
                  const totalWage = empSnapshots.reduce((sum, s) => sum + Number(s.total_wage || 0), 0);
                  const days = empSnapshots.length;
                  return (
                    <div key={emp.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                      <div>
                        <span className="font-medium">{emp.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {emp.pay_type === 'hourly' ? '시급' : '일급'} · {days}일 근무
                        </span>
                      </div>
                      <span className="font-mono text-sm">{formatFullCurrency(totalWage)}</span>
                    </div>
                  );
                })}
                {employees.filter(e => e.is_active && e.pay_type !== 'monthly').length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">시급/일급제 직원이 없습니다.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
