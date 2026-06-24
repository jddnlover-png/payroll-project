import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useEmployeeStore } from '@/store/employeeStore';

interface LeaveRulesSettingsProps {
  generationType: string;
  baseAnnualLeave: number;
  monthlyLeaveAmount: number;
  maxCarryOver: number;
  additionalLeavePerYear: number;
    maxAdditionalLeave: number;
  leavePolicyMode: string;
  leaveCarryOverMode: string;
  allowAdvanceLeave: boolean;
  maxAdvanceLeave: number;
  saving: boolean;
  onSave: (data: {
    leave_generation_type: string;
    base_annual_leave: number;
    monthly_leave_amount: number;
    max_carry_over: number;
    additional_leave_per_year: number;
    max_additional_leave: number;
    leave_policy_mode: string;
    leave_carry_over_mode: string;
    allow_advance_leave: boolean;
    max_advance_leave: number;
  }) => Promise<boolean>;
}

export function LeaveRulesSettings({
  generationType,
  baseAnnualLeave,
  monthlyLeaveAmount,
  maxCarryOver,
  additionalLeavePerYear,
    maxAdditionalLeave,
  leavePolicyMode,
  leaveCarryOverMode,
  allowAdvanceLeave,
  maxAdvanceLeave,
  saving,
  onSave,
}: LeaveRulesSettingsProps) {
  const { updateLeaveBalances } = useEmployeeStore();
  const [genType, setGenType] = useState(generationType);
  const [baseLeave, setBaseLeave] = useState(baseAnnualLeave);
  const [monthlyAmount, setMonthlyAmount] = useState(monthlyLeaveAmount);
    const [carryOver, setCarryOver] = useState(maxCarryOver);
  const [addPerYear, setAddPerYear] = useState(additionalLeavePerYear);
  const [maxAdd, setMaxAdd] = useState(maxAdditionalLeave);
  const [policyMode, setPolicyMode] = useState(leavePolicyMode);
  const [carryOverMode, setCarryOverMode] = useState(leaveCarryOverMode);
  const [advanceEnabled, setAdvanceEnabled] = useState(allowAdvanceLeave);
  const [advanceLimit, setAdvanceLimit] = useState(maxAdvanceLeave);

  useEffect(() => {
    setGenType(generationType);
    setBaseLeave(baseAnnualLeave);
    setMonthlyAmount(monthlyLeaveAmount);
    setCarryOver(maxCarryOver);
    setAddPerYear(additionalLeavePerYear);
        setMaxAdd(maxAdditionalLeave);
    setPolicyMode(leavePolicyMode);
    setCarryOverMode(leaveCarryOverMode);
    setAdvanceEnabled(allowAdvanceLeave);
    setAdvanceLimit(maxAdvanceLeave);
  }, [
    generationType,
    baseAnnualLeave,
    monthlyLeaveAmount,
    maxCarryOver,
    additionalLeavePerYear,
    maxAdditionalLeave,
    leavePolicyMode,
    leaveCarryOverMode,
    allowAdvanceLeave,
    maxAdvanceLeave,
  ]);

  const handleSave = async () => {
    const success = await onSave({
      leave_generation_type: genType,
      base_annual_leave: baseLeave,
      monthly_leave_amount: monthlyAmount,
            max_carry_over: carryOver,
      additional_leave_per_year: addPerYear,
      max_additional_leave: maxAdd,
      leave_policy_mode: policyMode,
      leave_carry_over_mode: carryOverMode,
      allow_advance_leave: advanceEnabled,
      max_advance_leave: advanceEnabled ? advanceLimit : 0,
    });
    if (success) {
      toast.success('연차발생 규칙이 저장되었습니다.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">연차 발생 규칙</CardTitle>
        <CardDescription>입사일 기준 연차 자동 발생 규칙을 설정합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
                <div className="space-y-2">
          <Label>연차 정책 기준</Label>
          <Select value={policyMode} onValueChange={(value) => setPolicyMode(value)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="legal">근로기준법 기준</SelectItem>
              <SelectItem value="company">회사 자체 기준</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {policyMode === 'legal'
              ? '근로기준법에 따라 입사일 기준으로 자동 발생 연차를 계산합니다.'
              : '회사 규정에 따라 설정한 연차 발생 방식을 기준으로 계산합니다.'}
          </p>
        </div>

        <div className="space-y-2 bg-muted/50 p-4 rounded-lg">
          <Label className="text-base font-semibold">연차 정책 안내</Label>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• <strong>근로기준법 기준:</strong> 법정 자동 발생분은 최대 25일까지 계산됩니다.</p>
            <p>• <strong>회사 자체 기준:</strong> 회사가 법정보다 유리하게 운영하는 추가 부여, 이월, 선사용 정책을 반영할 수 있습니다.</p>
            <p>• <strong>미사용 연차:</strong> 이월하거나 연차수당으로 지급하는 방식으로 관리하는 것을 권장합니다.</p>
          </div>
        </div>

        <Separator />
        <div className="space-y-2">
          <Label>연차 발생 방식</Label>
          <Select
            value={genType}
            onValueChange={(value) => setGenType(value)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yearly">연간 일괄 발생</SelectItem>
              <SelectItem value="monthly">월별 발생 (비례)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {genType === 'yearly'
              ? '입사일 기준 매년 연차가 일괄 발생합니다'
              : '매월 1일 연차가 비례하여 발생합니다'}
          </p>
        </div>

        {genType === 'yearly' ? (
          <div className="space-y-2">
            <Label>기본 연차 일수 (1년차)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max="30"
                value={baseLeave}
                onChange={(e) => setBaseLeave(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-muted-foreground">일</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>월별 발생 연차</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="3"
                value={monthlyAmount}
                onChange={(e) => setMonthlyAmount(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-muted-foreground">일/월</span>
            </div>
            <p className="text-sm text-muted-foreground">
              연간 최대 {(monthlyAmount * 12).toFixed(1)}일 발생
            </p>
          </div>
        )}

        <Separator />

        <div className="space-y-2 bg-muted/50 p-4 rounded-lg">
          <Label className="text-base font-semibold">근로기준법에 따른 연차 계산 (자동 적용)</Label>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• <strong>근속 1년 미만:</strong> 1개월 개근 시 1일씩 발생 (최대 11일)</p>
            <p>• <strong>근속 1년 이상:</strong> 기본 15일 발생</p>
            <p>• <strong>근속 3년차부터:</strong> 15일 + ⌊(근속연수-1)/2⌋일 추가</p>
            <p className="pl-4 text-xs">예: 3년차 → 16일, 5년차 → 17일, 7년차 → 18일, 21년차 → 25일</p>
            <p>• <strong>법정 자동발생 한도:</strong> 법정 발생분은 최대 25일입니다.</p>
<p>• <strong>회사 추가부여/이월:</strong> 회사 정책에 따라 25일을 초과해 관리할 수 있습니다.</p>
          </div>
        </div>

        <Separator />

                <div className="space-y-2">
          <Label>연차 이월 정책</Label>
          <Select value={carryOverMode} onValueChange={(value) => setCarryOverMode(value)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unlimited">무제한 이월</SelectItem>
              <SelectItem value="limited">최대 N일 이월</SelectItem>
              <SelectItem value="none">이월 안함</SelectItem>
            </SelectContent>
          </Select>

          {carryOverMode === 'limited' && (
            <div className="flex items-center gap-2 pt-2">
              <Input
                type="number"
                min="0"
                value={carryOver}
                onChange={(e) => setCarryOver(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-muted-foreground">일</span>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {carryOverMode === 'unlimited' && '남은 연차를 제한 없이 다음 해로 이월할 수 있습니다.'}
            {carryOverMode === 'limited' && '설정한 일수까지만 다음 해로 이월할 수 있습니다.'}
            {carryOverMode === 'none' && '이월하지 않는 경우 미사용 연차는 연차수당 지급 등으로 정산해야 합니다.'}
          </p>
        </div>
                <div className="space-y-2">
          <Label>연차 선사용 정책</Label>
          <Select
            value={advanceEnabled ? 'enabled' : 'disabled'}
            onValueChange={(value) => setAdvanceEnabled(value === 'enabled')}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disabled">선사용 불가</SelectItem>
              <SelectItem value="enabled">선사용 허용</SelectItem>
            </SelectContent>
          </Select>

          {advanceEnabled && (
            <div className="flex items-center gap-2 pt-2">
              <Input
                type="number"
                min="0"
                value={advanceLimit}
                onChange={(e) => setAdvanceLimit(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-muted-foreground">일</span>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {advanceEnabled
              ? '다음 해 발생 예정 연차를 설정한 한도 내에서 미리 사용할 수 있도록 관리합니다.'
              : '잔여연차가 부족한 경우 다음 해 연차를 미리 사용하지 못하도록 관리합니다.'}
          </p>
        </div>

        <div className="pt-4 flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              updateLeaveBalances({
                generationType: genType as 'monthly' | 'yearly',
                baseAnnualLeave: baseLeave,
                monthlyLeaveAmount: monthlyAmount,
                                maxCarryOver: carryOver,
                additionalLeavePerYear: addPerYear,
                maxAdditionalLeave: maxAdd,
              });
              toast.success('연차가 재계산되었습니다.');
            }}
          >
            연차 재계산 적용
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            저장
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          모든 직원의 연차를 입사일 기준으로 재계산합니다
        </p>
      </CardContent>
    </Card>
  );
}
