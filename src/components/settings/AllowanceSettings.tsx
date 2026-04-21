import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, BarChart3 } from 'lucide-react';

interface Employee {
  id: string;
  name: string;
  hourlyRate?: number;
}

interface AllowanceSettingsProps {
  overtimeMultiplier: number;
  nightShiftMultiplier: number;
  nightShiftStartTime: string;
  workEndTime: string;
  overtimeBreak2h: number;
  overtimeBreak4h: number;
  nightBreakMinutes: number;
  overtimeCheckoutThreshold: number;
  nightCheckoutThreshold: number;
  overtimeEndTime: string;
  nightShiftEndTime: string;
  hourlyEmployees: Employee[];
  holidayAlpha8h: number;
  holidayAlphaOt: number;
  weeklyHolEnabled: boolean;
  weeklyHolHours: number;
  weeklyHolRate: number;
  saving: boolean;
  onSave: (data: {
    overtime_multiplier: number;
    night_shift_multiplier: number;
    night_shift_start_time: string;
    overtime_break_2h: number;
    overtime_break_4h: number;
    night_break_minutes: number;
    overtime_checkout_threshold: number;
    night_checkout_threshold: number;
    overtime_end_time: string;
    night_shift_end_time: string;
    holiday_alpha_8h: number;
    holiday_alpha_ot: number;
    weekly_hol_enabled: boolean;
    weekly_hol_hours: number;
    weekly_hol_rate: number;
  }) => Promise<boolean>;
}

// 법정 최솟값 정의
const LEGAL_MIN = {
  overtime: 1.5,
  night: 1.5,
  holiday8h: 0.5,
  holidayOt: 1.0,
} as const;

function MultiplierHint({ value, minValue, label }: { value: number; minValue: number; label: string }) {
  if (value < minValue) {
    return (
      <p className="text-xs text-destructive mt-1">
        ❌ 법정 최저({minValue}배) 미만은 설정할 수 없습니다
      </p>
    );
  }
  if (value === minValue) {
    return (
      <p className="text-xs text-muted-foreground mt-1">
        💡 법정 최저값입니다
      </p>
    );
  }
  return (
    <p className="text-xs text-blue-600 mt-1">
      ℹ️ 법정 기준({minValue}배)보다 높게 설정되어 직원에게 유리하게 지급됩니다
    </p>
  );
}

function RateTable({
  otMultiplier,
  nsMultiplier,
  holAlpha8h,
  holAlphaOt,
}: {
  otMultiplier: number;
  nsMultiplier: number;
  holAlpha8h: number;
  holAlphaOt: number;
}) {
  const nightAlpha = nsMultiplier - 1.0;
  const otAlpha = otMultiplier - 1.0;

  const rows = [
    { label: '평일 정규', rate: 1.0 },
    { label: '평일 연장 (비야간)', rate: 1.0 + otAlpha },
    { label: '평일 연장 + 야간', rate: 1.0 + otAlpha + nightAlpha },
    { label: '소정외근무일 (비야간)', rate: 1.0 + otAlpha },
    { label: '소정외근무일 + 야간', rate: 1.0 + otAlpha + nightAlpha },
    { label: '주휴일 8h 이내', rate: 1.0 + holAlpha8h },
    { label: '주휴일 8h 초과', rate: 1.0 + holAlphaOt },
    { label: '주휴일 8h 초과 + 야간', rate: 1.0 + holAlphaOt + nightAlpha },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">현재 설정 기준 배율표</CardTitle>
        </div>
        <CardDescription>설정값이 변경되면 자동으로 업데이트됩니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60%]">구간</TableHead>
              <TableHead className="text-right">최종배율</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="text-sm">{row.label}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {row.rate.toFixed(1)}배
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function AllowanceSettings({
  overtimeMultiplier,
  nightShiftMultiplier,
  nightShiftStartTime,
  workEndTime,
  overtimeBreak2h,
  overtimeBreak4h,
  nightBreakMinutes,
  overtimeCheckoutThreshold,
  nightCheckoutThreshold,
  overtimeEndTime,
  nightShiftEndTime,
  hourlyEmployees,
  holidayAlpha8h,
  holidayAlphaOt,
  weeklyHolEnabled,
  weeklyHolHours,
  weeklyHolRate,
  saving,
  onSave,
}: AllowanceSettingsProps) {
  const [otMultiplier, setOtMultiplier] = useState(overtimeMultiplier);
  const [nsMultiplier, setNsMultiplier] = useState(nightShiftMultiplier);
  const [nsStartTime, setNsStartTime] = useState(nightShiftStartTime);
  const [otBreak2h, setOtBreak2h] = useState(overtimeBreak2h);
  const [otBreak4h, setOtBreak4h] = useState(overtimeBreak4h);
  const [nsBreak, setNsBreak] = useState(nightBreakMinutes);
  const [otCheckout, setOtCheckout] = useState(overtimeCheckoutThreshold);
  const [nsCheckout, setNsCheckout] = useState(nightCheckoutThreshold);
  const [otEndTime, setOtEndTime] = useState(overtimeEndTime);
  const [nsEndTime, setNsEndTime] = useState(nightShiftEndTime);
  const [holAlpha8h, setHolAlpha8h] = useState(holidayAlpha8h);
  const [holAlphaOt, setHolAlphaOt] = useState(holidayAlphaOt);
  const [wHolEnabled, setWHolEnabled] = useState(weeklyHolEnabled);
  const [wHolHours, setWHolHours] = useState(weeklyHolHours);
  const [wHolRate, setWHolRate] = useState(weeklyHolRate);

  useEffect(() => {
    setOtMultiplier(overtimeMultiplier);
    setNsMultiplier(nightShiftMultiplier);
    setNsStartTime(nightShiftStartTime);
    setOtBreak2h(overtimeBreak2h);
    setOtBreak4h(overtimeBreak4h);
    setNsBreak(nightBreakMinutes);
    setOtCheckout(overtimeCheckoutThreshold);
    setNsCheckout(nightCheckoutThreshold);
    setOtEndTime(overtimeEndTime);
    setNsEndTime(nightShiftEndTime);
    setHolAlpha8h(holidayAlpha8h);
    setHolAlphaOt(holidayAlphaOt);
    setWHolEnabled(weeklyHolEnabled);
    setWHolHours(weeklyHolHours);
    setWHolRate(weeklyHolRate);
  }, [overtimeMultiplier, nightShiftMultiplier, nightShiftStartTime, overtimeBreak2h, overtimeBreak4h, nightBreakMinutes, overtimeCheckoutThreshold, nightCheckoutThreshold, overtimeEndTime, nightShiftEndTime, holidayAlpha8h, holidayAlphaOt, weeklyHolEnabled, weeklyHolHours, weeklyHolRate]);

  // 유효성 검사
  const hasValidationError = useMemo(() => {
    return (
      otMultiplier < LEGAL_MIN.overtime ||
      nsMultiplier < LEGAL_MIN.night ||
      holAlpha8h < LEGAL_MIN.holiday8h ||
      holAlphaOt < LEGAL_MIN.holidayOt
    );
  }, [otMultiplier, nsMultiplier, holAlpha8h, holAlphaOt]);

  const handleSave = async () => {
    if (hasValidationError) {
      toast.error('법정 최저값 미만인 항목이 있어 저장할 수 없습니다.');
      return;
    }
    const success = await onSave({
      overtime_multiplier: otMultiplier,
      night_shift_multiplier: nsMultiplier,
      night_shift_start_time: nsStartTime,
      overtime_break_2h: otBreak2h,
      overtime_break_4h: otBreak4h,
      night_break_minutes: nsBreak,
      overtime_checkout_threshold: otCheckout,
      night_checkout_threshold: nsCheckout,
      overtime_end_time: otEndTime,
      night_shift_end_time: nsEndTime,
      holiday_alpha_8h: holAlpha8h,
      holiday_alpha_ot: holAlphaOt,
      weekly_hol_enabled: wHolEnabled,
      weekly_hol_hours: wHolHours,
      weekly_hol_rate: wHolRate,
    });
    if (success) {
      toast.success('수당 설정이 저장되었습니다.');
    }
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="multiplier" className="w-full">
        <TabsList className="w-full grid grid-cols-4 mb-4">
          <TabsTrigger value="multiplier">연장/야간 배율</TabsTrigger>
          <TabsTrigger value="break">휴게시간</TabsTrigger>
          <TabsTrigger value="checkout">퇴근 보정</TabsTrigger>
          <TabsTrigger value="holiday">휴일/주휴수당</TabsTrigger>
        </TabsList>

        <TabsContent value="multiplier" className="space-y-4 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">연장/야간 수당 배율</CardTitle>
              <CardDescription>연장 근무 및 야간 근무 수당 배율을 설정합니다. (시급제 직원에게 적용)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {hourlyEmployees.length > 0 && (
                <div className="p-3 rounded-lg bg-muted/50 mb-4">
                  <Label className="text-sm font-medium">시급제 직원 목록</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {hourlyEmployees.map(emp => (
                      <Badge key={emp.id} variant="secondary">
                        {emp.name} ({emp.hourlyRate?.toLocaleString()}원/시간)
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    아래 수당 배율이 이 직원들에게 적용됩니다
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>연장 수당 배율</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      min={LEGAL_MIN.overtime}
                      max="5"
                      value={otMultiplier}
                      onChange={(e) => setOtMultiplier(Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-muted-foreground">배</span>
                  </div>
                  <MultiplierHint value={otMultiplier} minValue={LEGAL_MIN.overtime} label="연장수당" />
                  <p className="text-sm text-muted-foreground">
                    정규 근무 시간 외 연장 근무 시 적용
                  </p>
                  <div className="pt-2">
                    <Label>연장수당 적용 시작 시간</Label>
                    <Input
                      type="time"
                      value={workEndTime}
                      disabled
                      className="w-40 mt-1"
                    />
                  </div>
                  <div className="pt-2">
                    <Label>연장수당 적용 종료 시간</Label>
                    <Input
                      type="time"
                      value={otEndTime}
                      onChange={(e) => { setOtEndTime(e.target.value); setNsStartTime(e.target.value); }}
                      className="w-40 mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      이 시간 이후 야간수당 구간으로 전환
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>야간 수당 배율</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      min={LEGAL_MIN.night}
                      max="5"
                      value={nsMultiplier}
                      onChange={(e) => setNsMultiplier(Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-muted-foreground">배</span>
                  </div>
                  <MultiplierHint value={nsMultiplier} minValue={LEGAL_MIN.night} label="야간수당" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>야간 수당 적용 시작 시간</Label>
                  <Input
                    type="time"
                    value={nsStartTime}
                    onChange={(e) => setNsStartTime(e.target.value)}
                    className="w-40"
                  />
                  <p className="text-sm text-muted-foreground">
                    이 시간 이후 근무 시 야간 수당 배율 적용
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>야간 수당 적용 종료 시간</Label>
                  <Input
                    type="time"
                    value={nsEndTime}
                    onChange={(e) => setNsEndTime(e.target.value)}
                    className="w-40"
                  />
                  <p className="text-sm text-muted-foreground">
                    이 시간까지 야간 수당 배율 적용
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 탭2: 휴게시간 */}
        <TabsContent value="break" className="space-y-4 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">연장근무 휴게시간</CardTitle>
              <CardDescription>근로기준법에 따라 연장근무 시 부여하는 휴게시간을 설정합니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>2시간 연장근무 시 휴게시간</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="60"
                      value={otBreak2h}
                      onChange={(e) => setOtBreak2h(Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-muted-foreground">분</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    연장근무 2시간 시 부여되는 휴게시간 (기본 30분)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>4시간 연장근무 시 휴게시간</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="120"
                      value={otBreak4h}
                      onChange={(e) => setOtBreak4h(Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-muted-foreground">분</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    연장근무 4시간 시 부여되는 휴게시간 (기본 60분)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">야간근무 휴게시간</CardTitle>
              <CardDescription>야간 근무 시 부여하는 휴게시간을 설정합니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>야간근무 휴게시간</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="120"
                    value={nsBreak}
                    onChange={(e) => setNsBreak(Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-muted-foreground">분</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  야간근무 시 부여되는 휴게시간 (기본 30분)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 탭3: 퇴근 보정 */}
        <TabsContent value="checkout" className="space-y-4 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">근무 종료 시간 보정</CardTitle>
              <CardDescription>설정된 시간 이내에 퇴근 시, 해당 수당 계산을 위한 퇴근 시간을 정시(정각)로 간주하여 계산합니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>연장근로 퇴근 보정 (분)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="60"
                    value={otCheckout}
                    onChange={(e) => setOtCheckout(Number(e.target.value))}
                    className="w-24"
                  />
                  <p className="text-xs text-muted-foreground">
                    연장근로 구간 내 매시 정각(예: {workEndTime}, {otEndTime} 등) 이후 {otCheckout}분 이내 퇴근 시 → 해당 정각으로 인정
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>야간근로 퇴근 보정 (분)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="60"
                    value={nsCheckout}
                    onChange={(e) => setNsCheckout(Number(e.target.value))}
                    className="w-24"
                  />
                  <p className="text-xs text-muted-foreground">
                    야간근로 구간 내 매시 정각(예: 00:00, 01:00 등) 이후 {nsCheckout}분 이내 퇴근 시 → 해당 정각으로 인정
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 탭4: 휴일/주휴수당 */}
        <TabsContent value="holiday" className="space-y-4 mt-0">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">휴일가산 설정</CardTitle>
          <CardDescription>주휴일 근무 시 적용되는 가산 배율을 설정합니다. (근로기준법 제56조 ②)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>휴일가산 배율 (8h 이내)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.1"
                  min={LEGAL_MIN.holiday8h}
                  max="3"
                  value={holAlpha8h}
                  onChange={(e) => setHolAlpha8h(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-muted-foreground">배</span>
              </div>
              <MultiplierHint value={holAlpha8h} minValue={LEGAL_MIN.holiday8h} label="휴일가산(8h이내)" />
              <p className="text-xs text-muted-foreground">
                최종배율 = 기본(1.0) + {holAlpha8h}배 = {(1 + holAlpha8h).toFixed(1)}배
              </p>
            </div>
            <div className="space-y-2">
              <Label>휴일가산 배율 (8h 초과)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.1"
                  min={LEGAL_MIN.holidayOt}
                  max="3"
                  value={holAlphaOt}
                  onChange={(e) => setHolAlphaOt(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-muted-foreground">배</span>
              </div>
              <MultiplierHint value={holAlphaOt} minValue={LEGAL_MIN.holidayOt} label="휴일가산(8h초과)" />
              <p className="text-xs text-muted-foreground">
                최종배율 = 기본(1.0) + {holAlphaOt}배 = {(1 + holAlphaOt).toFixed(1)}배
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 주휴수당 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">주휴수당 설정</CardTitle>
          <CardDescription>주 소정근로일 만근 시 지급되는 주휴수당을 설정합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>주휴수당 지급 여부</Label>
              <p className="text-xs text-muted-foreground mt-1">
                OFF로 설정하면 주휴수당이 전체 미지급됩니다.
              </p>
            </div>
            <Switch checked={wHolEnabled} onCheckedChange={setWHolEnabled} />
          </div>
          {wHolEnabled && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>주휴수당 기준 시간</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    max="24"
                    value={wHolHours}
                    onChange={(e) => setWHolHours(Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-muted-foreground">시간</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  만근 시 1주 기준으로 인정되는 주휴 시간
                </p>
              </div>
              <div className="space-y-2">
                <Label>주휴수당 배율</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="3"
                    value={wHolRate}
                    onChange={(e) => setWHolRate(Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-muted-foreground">배</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  주휴수당 = {wHolHours}h × 시급 × {wHolRate}배
                </p>
              </div>
            </div>
          )}
          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <p className="font-medium mb-1">지급 조건</p>
            <p className="text-muted-foreground text-xs">
              • 해당 주의 소정근로일 전일 만근 시 지급<br/>
              • 결근 1일 이상 발생 시 해당 주 주휴수당 미지급<br/>
              • 주휴수당은 기본급과 별도 항목으로 임금대장에 표시됩니다
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 실시간 배율표 */}
      <RateTable
        otMultiplier={otMultiplier}
        nsMultiplier={nsMultiplier}
        holAlpha8h={holAlpha8h}
        holAlphaOt={holAlphaOt}
      />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || hasValidationError}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          저장
        </Button>
      </div>
    </div>
  );
}
