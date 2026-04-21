import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, AlertCircle, Building2 } from 'lucide-react';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);

interface PayslipData {
  payroll: any;
  organization: any;
}

export default function PayslipView() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [data, setData] = useState<PayslipData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('유효하지 않은 링크입니다.');
      setLoading(false);
      return;
    }

    const fetchPayslip = async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/get-payslip?token=${encodeURIComponent(token)}`,
          {
            headers: {
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || '급여명세서를 불러올 수 없습니다.');
        }

        const payslipData = await response.json();
        setData(payslipData);
      } catch (e: any) {
        setError(e.message || '급여명세서를 불러올 수 없습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchPayslip();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">급여명세서를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-3">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">접근 오류</h2>
            <p className="text-muted-foreground">{error || '급여명세서를 찾을 수 없습니다.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { payroll, organization } = data;
  const employee = payroll.employee;
  const periodLabel = `${payroll.period_year}년 ${payroll.period_month}월`;

  const paymentItems: { name: string; amount: number }[] = payroll.payment_items || [];
  const deductionItems: { name: string; amount: number }[] = payroll.deduction_items || [];

  const totalPayments = paymentItems.length > 0
    ? paymentItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0)
    : payroll.total_payments;

  const totalDeductions = deductionItems.length > 0
    ? deductionItems.reduce((sum: number, item: any) => sum + (item.amount || 0), 0)
    : payroll.total_deductions;

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background p-4 md:p-8">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span className="text-sm">{organization?.name || '회사'}</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">급여명세서</h1>
          <p className="text-muted-foreground bg-muted inline-block px-4 py-1 rounded-full text-sm">
            {periodLabel}
          </p>
        </div>

        {/* Net Salary */}
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="pt-6 text-center">
            <p className="text-sm opacity-80 mb-1">실 수령액</p>
            <p className="text-3xl font-bold">{formatCurrency(payroll.net_salary)}</p>
          </CardContent>
        </Card>

        {/* Employee Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">직원 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">성명</span><span className="font-medium">{employee?.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">사원번호</span><span>{employee?.employee_number}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">부서</span><span>{employee?.department || '-'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">직급</span><span>{employee?.position || '-'}</span></div>
          </CardContent>
        </Card>

        {/* Payment Items */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-emerald-600">💰 지급 내역</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {paymentItems.length > 0 ? (
              paymentItems.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between">
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-medium">{formatCurrency(item.amount)}</span>
                </div>
              ))
            ) : (
              <div className="flex justify-between">
                <span className="text-muted-foreground">총 지급액</span>
                <span className="font-medium">{formatCurrency(payroll.total_payments)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>지급액 합계</span>
              <span>{formatCurrency(totalPayments)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Deduction Items */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-destructive">📋 공제 내역</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {deductionItems.length > 0 ? (
              deductionItems.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between">
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-medium text-destructive">-{formatCurrency(Math.abs(item.amount))}</span>
                </div>
              ))
            ) : (
              <div className="flex justify-between">
                <span className="text-muted-foreground">총 공제액</span>
                <span className="font-medium text-destructive">-{formatCurrency(payroll.total_deductions)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>공제액 합계</span>
              <span className="text-destructive">-{formatCurrency(totalDeductions)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-2">
          본 급여명세서는 {organization?.name || '회사'}에서 발급되었습니다.
        </p>
      </div>
    </div>
  );
}
