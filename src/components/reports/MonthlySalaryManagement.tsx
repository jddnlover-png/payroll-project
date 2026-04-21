import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useEmployees, Employee } from '@/hooks/useEmployees';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { useEmployeePayrollSettings } from '@/hooks/useEmployeePayrollSettings';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Calendar, Loader2, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function formatFullCurrency(value: number): string {
  return value.toLocaleString('ko-KR') + '원';
}

export function MonthlySalaryManagement() {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const { currentOrganization } = useOrganization();
  const { employees } = useEmployees();
  const { settings } = useOrganizationSettings();
  const { getEmployeePaymentItems } = useEmployeePayrollSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const orgId = currentOrganization?.id;

  // Monthly employees only
  const monthlyEmployees = useMemo(
    () => employees.filter(e => e.is_active && e.pay_type === 'monthly'),
    [employees]
  );

  // Fetch variable allowances from DB
  const { data: variableAllowances = [], isLoading } = useQuery({
    queryKey: ['monthly-variable-allowances', orgId, selectedYear, selectedMonth],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('monthly_variable_allowances' as any)
        .select('*')
        .eq('organization_id', orgId)
        .eq('period_year', selectedYear)
        .eq('period_month', selectedMonth);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!orgId,
  });

  // Upsert variable allowance
  const upsertMutation = useMutation({
    mutationFn: async ({ employeeId, amount, memo }: { employeeId: string; amount: number; memo?: string }) => {
      if (!orgId) throw new Error('No org');
      const { error } = await supabase
        .from('monthly_variable_allowances' as any)
        .upsert({
          organization_id: orgId,
          employee_id: employeeId,
          period_year: selectedYear,
          period_month: selectedMonth,
          amount,
          memo: memo || null,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'organization_id,employee_id,period_year,period_month' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-variable-allowances', orgId, selectedYear, selectedMonth] });
    },
    onError: () => {
      toast({ title: '저장 실패', description: '변동수당 저장에 실패했습니다.', variant: 'destructive' });
    },
  });

  // Build allowance map
  const allowanceMap = useMemo(() => {
    const map: Record<string, number> = {};
    variableAllowances.forEach((a: any) => {
      map[a.employee_id] = Number(a.amount || 0);
    });
    return map;
  }, [variableAllowances]);

  // Calculate fixed total per employee (base salary + all fixed allowances)
  const getFixedTotal = useCallback((emp: Employee) => {
    let total = emp.base_salary || 0;
    try {
      const items = getEmployeePaymentItems(emp.id);
      items.forEach((item: any) => {
        if (item.isActive && item.id !== 'base-salary' && item.id !== 'base') {
          // Include all active payment items with a fixed value (calculationType 'fixed')
          if (item.calculationType === 'fixed') {
            total += (item.overrideValue ?? item.defaultValue ?? 0);
          }
        }
      });
    } catch { /* ignore */ }
    return total;
  }, [getEmployeePaymentItems]);

  // Grand total
  const grandTotal = useMemo(() => {
    return monthlyEmployees.reduce((sum, emp) => {
      const fixed = getFixedTotal(emp);
      const variable = allowanceMap[emp.id] || 0;
      return sum + fixed + variable;
    }, 0);
  }, [monthlyEmployees, getFixedTotal, allowanceMap]);

  // D-Day calculation from org settings
  const payDay = settings.salary_payment_day;
  const paymentMonthOffset = settings.salary_payment_month === 'next_month' ? 1 : 0;
  const payDate = new Date(selectedYear, selectedMonth - 1 + paymentMonthOffset, payDay);
  const diffMs = payDate.getTime() - today.getTime();
  const dDay = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const dDayText = dDay > 0 ? `D-${dDay}` : dDay === 0 ? 'D-Day' : `D+${Math.abs(dDay)}`;
  const payDateLabel = `${payDate.getMonth() + 1}월 ${payDay}일`;

  const handleVariableChange = (employeeId: string, value: string) => {
    const amount = Number(value) || 0;
    upsertMutation.mutate({ employeeId, amount });
  };

  const years = Array.from({ length: 3 }, (_, i) => today.getFullYear() - 1 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">월급제 정산 관리</h2>
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
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-lg bg-primary/15 p-2">
                    <DollarSign className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">이번 달 총 지급 예정액</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{formatFullCurrency(grandTotal)}</p>
                <p className="text-xs text-muted-foreground mt-1">월급제 직원 {monthlyEmployees.length}명</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-accent/10 via-accent/5 to-background border-accent/20">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="rounded-lg bg-accent/15 p-2">
                    <Calendar className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">급여일까지</span>
                </div>
                <p className={`text-2xl font-bold tracking-tight ${dDay <= 3 && dDay >= 0 ? 'text-destructive' : ''}`}>
                  {dDayText}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{payDateLabel} 지급 예정</p>
              </CardContent>
            </Card>
          </div>

          {/* Employee Cards */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">직원별 급여 상세</h3>
            {monthlyEmployees.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  월급제 직원이 없습니다.
                </CardContent>
              </Card>
            ) : (
              monthlyEmployees.map(emp => {
                const fixedTotal = getFixedTotal(emp);
                const variableAmount = allowanceMap[emp.id] || 0;
                const totalPay = fixedTotal + variableAmount;

                return (
                  <Card key={emp.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="py-4 px-5">
                      <div className="flex flex-col md:flex-row md:items-center gap-4">
                        {/* Employee Info */}
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <div className="rounded-full bg-muted p-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">{emp.name}</p>
                            <p className="text-xs text-muted-foreground">{emp.department || '미지정'} · {emp.position || '미지정'}</p>
                          </div>
                        </div>

                        {/* Fixed */}
                        <div className="flex-1 grid grid-cols-3 gap-3 items-center">
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">기본급 + 고정수당</p>
                            <p className="text-sm font-medium">{formatFullCurrency(fixedTotal)}</p>
                          </div>

                          {/* Variable input */}
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5">추가 변동수당</p>
                            <Input
                              type="number"
                              className="h-8 text-sm w-full"
                              placeholder="0"
                              defaultValue={variableAmount || ''}
                              onBlur={(e) => handleVariableChange(emp.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleVariableChange(emp.id, (e.target as HTMLInputElement).value);
                                }
                              }}
                            />
                          </div>

                          {/* Total */}
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground mb-0.5">총 지급액</p>
                            <Badge variant="secondary" className="text-sm font-semibold px-3 py-1">
                              {formatFullCurrency(totalPay)}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
