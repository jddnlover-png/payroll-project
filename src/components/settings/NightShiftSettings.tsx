import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, Info, Lightbulb } from 'lucide-react';

interface ShiftTier {
  multiplier: number;
  breakMinutes: number;
  enabled: boolean;
}

interface NightShiftSettingsProps {
  tier1: ShiftTier & { start: string; end: string };
  tier2: ShiftTier & { start: string; end: string };
  tier3: ShiftTier & { start: string; end: string };
  tier4: ShiftTier;
  shiftLateThreshold: number;
  shiftCheckoutThreshold: number;
  saving: boolean;
  onSave: (data: Record<string, unknown>) => Promise<boolean>;
}

export function NightShiftSettings({ tier1, tier2, tier3, tier4, shiftLateThreshold, shiftCheckoutThreshold, saving, onSave }: NightShiftSettingsProps) {
  const [t1, setT1] = useState<ShiftTier & { start: string; end: string }>(tier1);
  const [t2, setT2] = useState<ShiftTier & { start: string; end: string }>(tier2);
  const [t3, setT3] = useState<ShiftTier & { start: string; end: string }>(tier3);
  const [t4, setT4] = useState<ShiftTier>({ multiplier: tier4.multiplier, breakMinutes: tier4.breakMinutes, enabled: tier4.enabled });
  const [lateThreshold, setLateThreshold] = useState(shiftLateThreshold);
  const [coThreshold, setCoThreshold] = useState(shiftCheckoutThreshold);

  useEffect(() => {
    setT1(tier1);
    setT2(tier2);
    setT3(tier3);
    setT4({ multiplier: tier4.multiplier, breakMinutes: tier4.breakMinutes, enabled: tier4.enabled });
    setLateThreshold(shiftLateThreshold);
    setCoThreshold(shiftCheckoutThreshold);
  }, [tier1, tier2, tier3, tier4, shiftLateThreshold, shiftCheckoutThreshold]);

  const totalBreakMinutes = useMemo(() => {
    return t1.breakMinutes + t2.breakMinutes + t3.breakMinutes + t4.breakMinutes;
  }, [t1.breakMinutes, t2.breakMinutes, t3.breakMinutes, t4.breakMinutes]);

  const breakWarning = totalBreakMinutes !== 60;

  // 1단계 시작시간 유효성 검사
  const tier1StartMinutes = useMemo(() => {
    const [h, m] = t1.start.split(':').map(Number);
    return h * 60 + m;
  }, [t1.start]);

  const tier1EndMinutes = useMemo(() => {
    const [h, m] = t1.end.split(':').map(Number);
    return h * 60 + m;
  }, [t1.end]);

  // 에러: 시작 > 종료 (저장 차단)
  const tier1StartError = useMemo(() => {
    return tier1StartMinutes > tier1EndMinutes;
  }, [tier1StartMinutes, tier1EndMinutes]);

  // 경고: 시작 >= 22:00 (저장 허용, 노란 경고)
  const tier1StartWarning = useMemo(() => {
    return !tier1StartError && tier1StartMinutes >= 22 * 60;
  }, [tier1StartError, tier1StartMinutes]);

  // 3단계 발생 여부 실시간 계산
  const tier3Available = useMemo(() => {
    // 1단계 시작시간을 분으로 변환
    const [h, m] = t1.start.split(':').map(Number);
    const t1StartMin = h * 60 + m;
    // 21:00 = 1260분
    return t1StartMin < 1260;
  }, [t1.start]);

  // 3단계 구간 시간 계산 (표시용)
  const tier3Info = useMemo(() => {
    const [h, m] = t1.start.split(':').map(Number);
    const t1StartMin = h * 60 + m;
    const nightStartMin = 22 * 60; // 22:00
    const t1RawMin = Math.max(0, nightStartMin - t1StartMin);
    const t1Actual = Math.max(0, t1RawMin - t1.breakMinutes);
    const overPoint = nightStartMin + (480 - t1Actual); // 8h=480min 초과시점
    const nightEnd = 30 * 60; // 익일 06:00 = 1800분
    const tier3Min = Math.max(0, nightEnd - overPoint);
    return { tier3Min, t1Actual };
  }, [t1.start, t1.breakMinutes]);

  const handleSave = async () => {
    if (tier1StartError) {
      toast.error('시작 시간이 종료 시간보다 늦습니다.');
      return;
    }
    if (totalBreakMinutes !== 60) {
      toast.error('총 휴게시간 합계가 60분이어야 합니다.');
      return;
    }
    const success = await onSave({
      shift_tier1_multiplier: t1.multiplier,
      shift_tier1_start: t1.start,
      shift_tier1_end: t1.end,
      shift_tier1_break_minutes: t1.breakMinutes,
      shift_tier2_multiplier: t2.multiplier,
      shift_tier2_start: t2.start,
      shift_tier2_end: t2.end,
      shift_tier2_break_minutes: t2.breakMinutes,
      shift_tier3_multiplier: t3.multiplier,
      shift_tier3_start: t3.start,
      shift_tier3_end: t3.end,
      shift_tier3_break_minutes: t3.breakMinutes,
      shift_tier4_multiplier: t4.multiplier,
      shift_tier4_break_minutes: t4.breakMinutes,
      shift_late_threshold: lateThreshold,
      shift_checkout_threshold: coThreshold,
    });
    if (success) {
      toast.success('야간 교대근무 설정이 저장되었습니다.');
    }
  };

  const handleAutoDistribute = () => {
    if (tier3Available) {
      // 3단계에 60분 전량 배분
      setT1(prev => ({ ...prev, breakMinutes: 0 }));
      setT2(prev => ({ ...prev, breakMinutes: 0 }));
      setT3(prev => ({ ...prev, breakMinutes: 60 }));
      setT4(prev => ({ ...prev, breakMinutes: 0 }));
    } else {
      // 2단계에 60분 전량 배분
      setT1(prev => ({ ...prev, breakMinutes: 0 }));
      setT2(prev => ({ ...prev, breakMinutes: 60 }));
      setT3(prev => ({ ...prev, breakMinutes: 0 }));
      setT4(prev => ({ ...prev, breakMinutes: 0 }));
    }
  };

  const tierConfigs = [
    {
      label: '1단계 (정규 + 비야간)',
      desc: '고정출근시간 ~ 야간시작',
      tier: t1,
      setTier: setT1,
      showTimes: true,
      defaultMultiplier: 1.0,
    },
    {
      label: '2단계 (정규 + 야간)',
      desc: '야간시작 ~ 8h 초과시점 (자동계산)',
      tier: t2,
      setTier: setT2,
      showTimes: true,
      defaultMultiplier: 1.5,
      autoEndNote: '2단계 종료 = 출근시간 기준 자동계산 (8h 초과 시점)',
    },
    {
      label: '3단계 (연장 + 야간)',
      desc: '8h 초과시점 ~ 야간종료 (자동계산)',
      tier: t3,
      setTier: setT3,
      showTimes: true,
      defaultMultiplier: 2.0,
      autoStartNote: '3단계 시작 = 출근시간 기준 자동계산',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">야간 교대근무 4단계 설정</CardTitle>
        <CardDescription>야간 교대근무 시간대별 수당 배율과 휴게시간을 설정합니다. 2단계 종료/3단계 시작/4단계 시작은 출근시간에 따라 자동 계산됩니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs defaultValue="tiers" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="tiers">단계별 설정</TabsTrigger>
            <TabsTrigger value="breaks">휴게시간 배분</TabsTrigger>
            <TabsTrigger value="thresholds">지각/퇴근 기준</TabsTrigger>
            <TabsTrigger value="rates">배율표</TabsTrigger>
          </TabsList>

          <TabsContent value="tiers" className="space-y-6 mt-4">
            {tierConfigs.map(({ label, desc, tier, setTier, showTimes, autoEndNote, autoStartNote }, idx) => (
              <div key={idx} className="space-y-3 p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold">{label}</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </div>
                {showTimes && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">시작 시간</Label>
                      {autoStartNote ? (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted p-2 rounded">
                          <Info className="h-3 w-3" />
                          <span>자동계산</span>
                        </div>
                      ) : (
                        <Input
                          type="time"
                          value={(tier as any).start}
                          onChange={(e) => setTier((prev: any) => ({ ...prev, start: e.target.value }))}
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">종료 시간</Label>
                      {autoEndNote ? (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted p-2 rounded">
                          <Info className="h-3 w-3" />
                          <span>자동계산</span>
                        </div>
                      ) : (
                        <Input
                          type="time"
                          value={(tier as any).end}
                          onChange={(e) => setTier((prev: any) => ({ ...prev, end: e.target.value }))}
                        />
                      )}
                    </div>
                  </div>
                )}
                {idx === 0 && tier1StartError && (
                  <div className="p-3 rounded-lg border border-destructive bg-destructive/10 text-destructive text-sm space-y-1">
                    <p className="font-semibold">❌ 시작 시간이 종료 시간보다 늦습니다.</p>
                  </div>
                )}
                {idx === 0 && tier1StartWarning && (
                  <div className="p-3 rounded-lg border border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-sm space-y-1">
                    <p className="font-semibold">⚠️ 1단계 구간이 없습니다.</p>
                    <p className="text-xs">22:00부터 바로 2단계(야간)가 적용됩니다.</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">수당 배율</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      max="10"
                      value={tier.multiplier}
                      onChange={(e) => setTier((prev: any) => ({ ...prev, multiplier: Number(e.target.value) }))}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">배</span>
                  </div>
                </div>
              </div>
            ))}

            {/* 4단계 */}
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-semibold">4단계 (연장 + 비야간)</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">MAX(야간종료, 8h초과시점) ~ 퇴근 (자동계산)</p>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">활성화</Label>
                  <Switch
                    checked={t4.enabled}
                    onCheckedChange={(checked) => setT4(prev => ({ ...prev, enabled: checked }))}
                  />
                </div>
              </div>
              {!t4.enabled && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-destructive">
                    4단계 OFF 시 야간종료 이후 연장근로 수당이 미지급됩니다. 근로기준법 제56조 위반 가능성이 있으니 반드시 근로계약서를 확인하세요.
                  </p>
                </div>
              )}
              {t4.enabled && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">시작 시간</Label>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted p-2 rounded">
                        <Info className="h-3 w-3" />
                        <span>자동계산</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">종료 시간</Label>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted p-2 rounded">
                        <Info className="h-3 w-3" />
                        <span>실제 퇴근시간</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">수당 배율</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.1"
                        min="1"
                        max="10"
                        value={t4.multiplier}
                        onChange={(e) => setT4(prev => ({ ...prev, multiplier: Number(e.target.value) }))}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">배</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="breaks" className="space-y-6 mt-4">
            {/* 단계별 휴게시간 배분 */}
            <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">단계별 휴게시간 배분</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAutoDistribute}
                  className="text-xs"
                >
                  <Lightbulb className="h-3.5 w-3.5 mr-1" />
                  급여 최대화 자동배분
                </Button>
              </div>

              {!tier3Available && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    설정 출근시간이 21:00 이후입니다. 3단계 구간이 발생하지 않으므로 2단계 또는 4단계에 휴게를 배분하세요. (두 단계의 급여는 동일합니다)
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">1단계 휴게</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      max="60"
                      step="10"
                      value={t1.breakMinutes}
                      onChange={(e) => setT1(prev => ({ ...prev, breakMinutes: Number(e.target.value) }))}
                      className="w-20"
                    />
                    <span className="text-xs text-muted-foreground">분</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">2단계 휴게</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      max="60"
                      step="10"
                      value={t2.breakMinutes}
                      onChange={(e) => setT2(prev => ({ ...prev, breakMinutes: Number(e.target.value) }))}
                      className="w-20"
                    />
                    <span className="text-xs text-muted-foreground">분</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs text-muted-foreground">3단계 휴게</Label>
                    {tier3Available && (
                      <span className="text-[10px] text-amber-600 font-medium">★ 최고배율(2.0배)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      max="60"
                      step="10"
                      value={t3.breakMinutes}
                      onChange={(e) => setT3(prev => ({ ...prev, breakMinutes: Number(e.target.value) }))}
                      className="w-20"
                      disabled={!tier3Available}
                    />
                    <span className="text-xs text-muted-foreground">분</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">4단계 휴게</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      max="60"
                      step="10"
                      value={t4.breakMinutes}
                      onChange={(e) => setT4(prev => ({ ...prev, breakMinutes: Number(e.target.value) }))}
                      className="w-20"
                    />
                    <span className="text-xs text-muted-foreground">분</span>
                  </div>
                </div>
              </div>

              {tier3Available && (
                <p className="text-[11px] text-muted-foreground">
                  💡 3단계(2.0배)에 휴게를 집중 배분하면 급여가 최대화됩니다
                </p>
              )}
            </div>

            {/* 총 휴게시간 합계 */}
            <div className={`p-3 rounded-lg border ${breakWarning ? 'bg-destructive/10 border-destructive/20' : 'bg-muted/30'}`}>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">총 휴게시간 합계</Label>
                <span className={`text-sm font-bold ${breakWarning ? 'text-destructive' : 'text-foreground'}`}>
                  {totalBreakMinutes}분 / 60분
                </span>
              </div>
              {breakWarning && (
                <div className="flex items-start gap-2 mt-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-xs text-destructive">
                    총 휴게시간이 60분이어야 합니다. 현재 {totalBreakMinutes}분으로 설정되어 있습니다. 저장하려면 합계를 60분으로 맞춰주세요.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="thresholds" className="space-y-6 mt-4">
            {/* 지각/퇴근 기준 */}
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <Label className="text-sm font-semibold">지각 및 퇴근 기준</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">지각 기준 (분)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="120"
                    value={lateThreshold}
                    onChange={(e) => setLateThreshold(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>설정출근 이전 도착 → 설정출근시간으로 자동 보정</p>
                    <p>설정출근 이후 {lateThreshold}분 이내 → 설정출근시간으로 자동 보정</p>
                    <p>설정출근 이후 {lateThreshold}분 초과 → 실제 출근시간 기준 (지각)</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">퇴근 기준 (분)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="120"
                    value={coThreshold}
                    onChange={(e) => setCoThreshold(Number(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    구간 내 매시 정각 이후 {coThreshold}분 이내 퇴근 → 정각 인정
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="rates" className="space-y-6 mt-4">
            {/* 배율표 */}
            <div className="p-4 rounded-lg border bg-muted/30">
              <Label className="text-sm font-semibold mb-3 block">배율표</Label>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1.5 px-2">구간</th>
                      <th className="text-center py-1.5 px-2">평일/토요일</th>
                      <th className="text-center py-1.5 px-2">주휴일</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-1.5 px-2">1단계 비야간소정</td>
                      <td className="text-center py-1.5 px-2 font-semibold">{t1.multiplier}배</td>
                      <td className="text-center py-1.5 px-2 font-semibold">{(t1.multiplier + 0.5).toFixed(1)}배</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1.5 px-2">2단계 야간소정</td>
                      <td className="text-center py-1.5 px-2 font-semibold">{t2.multiplier}배</td>
                      <td className="text-center py-1.5 px-2 font-semibold">{(t2.multiplier + 0.5).toFixed(1)}배</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-1.5 px-2">3단계 야간+연장</td>
                      <td className="text-center py-1.5 px-2 font-semibold">{t3.multiplier}배</td>
                      <td className="text-center py-1.5 px-2 font-semibold">{(t2.multiplier + 1.0).toFixed(1)}배</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 px-2">4단계 연장비야간</td>
                      <td className="text-center py-1.5 px-2 font-semibold">{t4.multiplier}배</td>
                      <td className="text-center py-1.5 px-2 font-semibold">{(t1.multiplier + 1.0).toFixed(1)}배</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                주휴일 출근 시 각 단계에 휴일가산이 자동 적용됩니다<br />
                8h이내 +0.5 / 8h초과 +1.0 / 야간중복 +0.5
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || breakWarning || tier1StartError}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            저장
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
