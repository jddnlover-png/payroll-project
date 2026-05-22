import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { CalendarDays, CreditCard, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface WorkHoursSettingsProps {
  workStartTime: string;
  workEndTime: string;
  breakStartTime: string;
  breakEndTime: string;
  lateThreshold: number;
  checkoutThreshold: number;
  salaryCalcStartDay: string;
  salaryCalcEndDay: string;
  salaryPaymentMonth: string;
  salaryPaymentDay: string;
  saving: boolean;
  onSave: (data: {
    work_start_time: string;
    work_end_time: string;
    break_start_time: string;
    break_end_time: string;
    late_threshold: number;
    checkout_threshold: number;
    salary_calc_start_day: string;
    salary_calc_end_day: string;
    salary_payment_month: string;
    salary_payment_day: string;
  }) => Promise<boolean>;
}

export function WorkHoursSettings({
  workStartTime,
  workEndTime,
  breakStartTime,
  breakEndTime,
  lateThreshold,
  checkoutThreshold,
  salaryCalcStartDay,
  salaryCalcEndDay,
  salaryPaymentMonth,
  salaryPaymentDay,
  saving,
  onSave,
}: WorkHoursSettingsProps) {
  const [startTime, setStartTime] = useState(workStartTime);
  const [endTime, setEndTime] = useState(workEndTime);
  const [brkStart, setBrkStart] = useState(breakStartTime);
  const [brkEnd, setBrkEnd] = useState(breakEndTime);
  const [threshold, setThreshold] = useState(lateThreshold);
const [coThreshold, setCoThreshold] = useState(checkoutThreshold);
const [calcStartDay, setCalcStartDay] = useState(salaryCalcStartDay);
const [calcEndDay, setCalcEndDay] = useState(salaryCalcEndDay);
const [paymentMonth, setPaymentMonth] = useState(salaryPaymentMonth);
const [paymentDay, setPaymentDay] = useState(salaryPaymentDay);

  useEffect(() => {
  setStartTime(workStartTime);
  setEndTime(workEndTime);
  setBrkStart(breakStartTime);
  setBrkEnd(breakEndTime);
  setThreshold(lateThreshold);
  setCoThreshold(checkoutThreshold);
  setCalcStartDay(salaryCalcStartDay);
  setCalcEndDay(salaryCalcEndDay);
  setPaymentMonth(salaryPaymentMonth);
  setPaymentDay(salaryPaymentDay);
}, [
  workStartTime,
  workEndTime,
  breakStartTime,
  breakEndTime,
  lateThreshold,
  checkoutThreshold,
  salaryCalcStartDay,
  salaryCalcEndDay,
  salaryPaymentMonth,
  salaryPaymentDay,
]);

  // 휴게시간 계산 (분)
  const calcBreakMinutes = () => {
    const [sh, sm] = brkStart.split(':').map(Number);
    const [eh, em] = brkEnd.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  };

  const handleSave = async () => {
    const breakMin = calcBreakMinutes();
    if (breakMin <= 0) {
      toast.error('휴게 종료 시간은 시작 시간보다 이후여야 합니다.');
      return;
    }
    const success = await onSave({
  work_start_time: startTime,
  work_end_time: endTime,
  break_start_time: brkStart,
  break_end_time: brkEnd,
  late_threshold: threshold,
  checkout_threshold: coThreshold,
  salary_calc_start_day: calcStartDay,
  salary_calc_end_day: calcEndDay,
  salary_payment_month: paymentMonth,
  salary_payment_day: paymentDay,
});
    if (success) {
      toast.success('근무시간 설정이 저장되었습니다.');
    }
  };

  const breakMinutes = calcBreakMinutes();

  return (
  <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="text-base">근무 시간</CardTitle>
        <CardDescription>출퇴근 시간, 휴게시간 및 지각 기준을 설정합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>출근 시간</Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>퇴근 시간</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>휴게 시작 시간</Label>
            <Input
              type="time"
              value={brkStart}
              onChange={(e) => setBrkStart(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>휴게 종료 시간</Label>
            <Input
              type="time"
              value={brkEnd}
              onChange={(e) => setBrkEnd(e.target.value)}
            />
          </div>
        </div>
        {breakMinutes > 0 && (
          <p className="text-sm text-muted-foreground">
            휴게시간: {Math.floor(breakMinutes / 60)}시간 {breakMinutes % 60 > 0 ? `${breakMinutes % 60}분` : ''} (근무시간에서 자동 차감)
          </p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>지각 기준 (분)</Label>
            <Input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-sm text-muted-foreground">
              출근 시간 기준 {threshold}분 초과 시 지각 처리
            </p>
          </div>
          <div className="space-y-2">
            <Label>퇴근 기준 (분)</Label>
            <Input
              type="number"
              value={coThreshold}
              onChange={(e) => setCoThreshold(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-sm text-muted-foreground">
              퇴근 시간 이후 {coThreshold}분 이내 퇴근 시 정시 퇴근 처리
            </p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            저장
          </Button>
        </div>
      </CardContent>
      <Card>
  <CardHeader>
    <CardTitle className="text-base flex items-center gap-2">
      <CalendarDays className="h-4 w-4 text-primary" />
      급여 계산 기간
    </CardTitle>
    <CardDescription>급여 산정 시 사용할 계산 시작일과 종료일을 설정합니다.</CardDescription>
  </CardHeader>
  <CardContent className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label>계산 시작일</Label>
      <Select value={calcStartDay} onValueChange={setCalcStartDay}>
        <SelectTrigger>
          <SelectValue placeholder="계산 시작일" />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((day) => (
            <SelectItem key={day} value={day}>
              {day}일
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <div className="space-y-2">
      <Label>계산 종료일</Label>
      <Select value={calcEndDay} onValueChange={setCalcEndDay}>
        <SelectTrigger>
          <SelectValue placeholder="계산 종료일" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="end">말일</SelectItem>
          {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((day) => (
            <SelectItem key={day} value={day}>
              {day}일
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </CardContent>
</Card>

<Card>
  <CardHeader>
    <CardTitle className="text-base flex items-center gap-2">
      <CreditCard className="h-4 w-4 text-primary" />
      급여 지급 설정
    </CardTitle>
    <CardDescription>급여 지급 시점과 지급일을 설정합니다.</CardDescription>
  </CardHeader>
  <CardContent className="grid grid-cols-2 gap-4">
    <div className="space-y-2">
      <Label>지급 시점</Label>
      <Select value={paymentMonth} onValueChange={setPaymentMonth}>
        <SelectTrigger>
          <SelectValue placeholder="지급 시점" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="current">당월 지급</SelectItem>
          <SelectItem value="next">익월 지급</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div className="space-y-2">
      <Label>급여 지급일</Label>
      <Select value={paymentDay} onValueChange={setPaymentDay}>
        <SelectTrigger>
          <SelectValue placeholder="급여 지급일" />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((day) => (
            <SelectItem key={day} value={day}>
              {day}일
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </CardContent>
</Card>
        </Card>
  </div>
);
}
