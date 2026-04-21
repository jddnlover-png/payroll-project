import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface PayrollCalcSettingsProps {
  overtimeRate: number;
  standardWorkHours: number;
  lateDeductionRate: number;
  absentDeductionRate: number;
  insuranceDeductionRate: number;
  saving: boolean;
  onSave: (data: {
    overtime_rate: number;
    standard_work_hours: number;
    late_deduction_rate: number;
    absent_deduction_rate: number;
    insurance_deduction_rate: number;
  }) => Promise<boolean>;
}

export function PayrollCalcSettings({
  overtimeRate,
  standardWorkHours,
  lateDeductionRate,
  absentDeductionRate,
  insuranceDeductionRate,
  saving,
  onSave,
}: PayrollCalcSettingsProps) {
  const [otRate, setOtRate] = useState(overtimeRate);
  const [stdHours, setStdHours] = useState(standardWorkHours);
  const [lateRate, setLateRate] = useState(lateDeductionRate);
  const [absentRate, setAbsentRate] = useState(absentDeductionRate);
  const [insRate, setInsRate] = useState(insuranceDeductionRate);

  useEffect(() => {
    setOtRate(overtimeRate);
    setStdHours(standardWorkHours);
    setLateRate(lateDeductionRate);
    setAbsentRate(absentDeductionRate);
    setInsRate(insuranceDeductionRate);
  }, [overtimeRate, standardWorkHours, lateDeductionRate, absentDeductionRate, insuranceDeductionRate]);

  const handleSave = async () => {
    const success = await onSave({
      overtime_rate: otRate,
      standard_work_hours: stdHours,
      late_deduction_rate: lateRate,
      absent_deduction_rate: absentRate,
      insurance_deduction_rate: insRate,
    });
    if (success) {
      toast.success('급여계산 설정이 저장되었습니다.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">급여계산 설정</CardTitle>
        <CardDescription>급여 계산 시 적용되는 배율과 공제율을 설정합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>연장근무 배율</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                min="1"
                max="5"
                value={otRate}
                onChange={(e) => setOtRate(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-muted-foreground">배</span>
            </div>
            <p className="text-sm text-muted-foreground">
              표준 근무시간 초과 시 시급에 적용되는 배율
            </p>
          </div>
          <div className="space-y-2">
            <Label>일일 표준 근무시간</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="1"
                min="4"
                max="12"
                value={stdHours}
                onChange={(e) => setStdHours(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-muted-foreground">시간</span>
            </div>
            <p className="text-sm text-muted-foreground">
              연장근무 계산 기준이 되는 일일 근무시간
            </p>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>지각 공제율</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={lateRate}
                onChange={(e) => setLateRate(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-muted-foreground">배</span>
            </div>
            <p className="text-sm text-muted-foreground">
              일급의 {(lateRate * 100).toFixed(0)}% 공제
            </p>
          </div>
          <div className="space-y-2">
            <Label>결근 공제율</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={absentRate}
                onChange={(e) => setAbsentRate(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-muted-foreground">배</span>
            </div>
            <p className="text-sm text-muted-foreground">
              일급의 {(absentRate * 100).toFixed(0)}% 공제
            </p>
          </div>
          <div className="space-y-2">
            <Label>4대보험 공제율</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="0.5"
                value={insRate}
                onChange={(e) => setInsRate(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-muted-foreground">배</span>
            </div>
            <p className="text-sm text-muted-foreground">
              기본급의 {(insRate * 100).toFixed(0)}% 공제
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
    </Card>
  );
}
