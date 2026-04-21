import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, Lock, Shield, AlertTriangle, CalendarDays, Banknote, Info } from "lucide-react";
import { useDailyPayrollSettings } from "@/hooks/useDailyPayrollSettings";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const ALL_DAYS = [
  { value: "MON", label: "월" },
  { value: "TUE", label: "화" },
  { value: "WED", label: "수" },
  { value: "THU", label: "목" },
  { value: "FRI", label: "금" },
  { value: "SAT", label: "토" },
  { value: "SUN", label: "일" },
];

const weeklyHolidayOptions = [
  { value: "sun", label: "일요일" },
  { value: "mon", label: "월요일" },
  { value: "tue", label: "화요일" },
  { value: "wed", label: "수요일" },
  { value: "thu", label: "목요일" },
  { value: "fri", label: "금요일" },
  { value: "sat", label: "토요일" },
];

const DAY_VALUE_TO_HOLIDAY: Record<string, string> = {
  MON: "mon",
  TUE: "tue",
  WED: "wed",
  THU: "thu",
  FRI: "fri",
  SAT: "sat",
  SUN: "sun",
};

const HOLIDAY_TO_DAY_VALUE: Record<string, string> = {
  mon: "MON",
  tue: "TUE",
  wed: "WED",
  thu: "THU",
  fri: "FRI",
  sat: "SAT",
  sun: "SUN",
};

export function DailyPayrollSettingsPanel() {
  const { settings, loading, saving, saveSettings } = useDailyPayrollSettings();
  const [localSettings, setLocalSettings] = useState(settings);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync when settings load
  if (!hasChanges && JSON.stringify(localSettings) !== JSON.stringify(settings)) {
    setLocalSettings(settings);
  }

  const update = (key: string, value: any) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleDayToggle = (dayValue: string, checked: boolean) => {
    let newList = checked
      ? [...(localSettings.weekly_work_day_list || []), dayValue]
      : (localSettings.weekly_work_day_list || []).filter((d) => d !== dayValue);

    const order = ALL_DAYS.map((d) => d.value);
    newList.sort((a, b) => order.indexOf(a) - order.indexOf(b));

    update("weekly_work_day_list", newList);
    update("weekly_work_days", newList.length);

    const holidayDay = HOLIDAY_TO_DAY_VALUE[localSettings.weekly_holiday || "sun"];
    if (newList.includes(holidayDay)) {
      const available = ALL_DAYS.find((d) => !newList.includes(d.value));
      if (available) {
        update("weekly_holiday", DAY_VALUE_TO_HOLIDAY[available.value]);
      }
    }
  };

  const handlePreset = (days: number) => {
    if (days === 5) {
      update("weekly_work_day_list", ["MON", "TUE", "WED", "THU", "FRI"]);
      update("weekly_work_days", 5);
      update("weekly_holiday", "sun");
      update("weekly_work_hours", 40);
    } else {
      update("weekly_work_day_list", ["MON", "TUE", "WED", "THU", "FRI", "SAT"]);
      update("weekly_work_days", 6);
      update("weekly_holiday", "sun");
      update("weekly_work_hours", 48);
    }
  };

  const handleHolidayChange = (val: string) => {
    const dayValue = HOLIDAY_TO_DAY_VALUE[val];
    if ((localSettings.weekly_work_day_list || []).includes(dayValue)) {
      toast.error("소정근로일로 지정된 요일은 주휴일로 설정할 수 없습니다");
      return;
    }
    update("weekly_holiday", val);
  };

  const availableHolidays = weeklyHolidayOptions.filter((o) => {
    const dayValue = HOLIDAY_TO_DAY_VALUE[o.value];
    return !(localSettings.weekly_work_day_list || []).includes(dayValue);
  });

  const handleSave = async () => {
    if ((localSettings.weekly_work_day_list || []).length < 1) {
      toast.error("소정근로일을 최소 1일 이상 선택해주세요");
      return;
    }
    if ((localSettings.weekly_work_hours ?? 0) < 1) {
      toast.error("주 소정근로시간은 1시간 이상이어야 합니다");
      return;
    }
    await saveSettings(localSettings);
    setHasChanges(false);
  };

  if (loading) return <Skeleton className="h-96 w-full rounded-lg" />;

  const formatCurrency = (n: number) => new Intl.NumberFormat("ko-KR").format(n);

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          일용직 급여 설정
        </CardTitle>
        <CardDescription>일용직 근로자의 급여 자동 생성 규칙을 설정합니다.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="w-full grid grid-cols-4 mb-4">
            <TabsTrigger value="basic">기본 설정</TabsTrigger>
            <TabsTrigger value="insurance">보험 요율</TabsTrigger>
            <TabsTrigger value="weekly-holiday">주휴수당</TabsTrigger>
            <TabsTrigger value="holiday-tax">휴일/비과세</TabsTrigger>
          </TabsList>

          {/* ── 탭 1: 기본 설정 ── */}
          <TabsContent value="basic" className="space-y-5 mt-0">
            {/* 세금 면세 기준 */}
            <div className="space-y-2">
              <Label className="font-semibold">세금 면세 기준 (일당)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={localSettings.tax_exempt_limit}
                  onChange={(e) => update("tax_exempt_limit", Number(e.target.value))}
                  className="w-48"
                />
                <span className="text-sm text-muted-foreground">원</span>
              </div>
              <p className="text-xs text-muted-foreground">일당이 이 금액 이하일 경우 소득세가 면제됩니다.</p>
            </div>

            <Separator />

            {/* 지급일 / 월 근무일수 경고 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="font-semibold">지급일</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">매월</span>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={localSettings.payment_day ?? 25}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (val >= 1 && val <= 31) update("payment_day", val);
                    }}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">일</span>
                </div>
                <p className="text-xs text-muted-foreground">노무대장에 표시될 지급일입니다.</p>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">월 근무일수 경고 기준</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={localSettings.monthly_workday_warning}
                    onChange={(e) => update("monthly_workday_warning", Number(e.target.value))}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">일 이상 근무 시 경고</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  해당 일수 이상 근무 시 국민연금/건강보험 적용 대상 경고를 표시합니다.
                </p>
              </div>
            </div>

            <Separator />

            {/* 보험 적용 안내 */}
            <div className="space-y-2">
              <Label className="font-semibold">보험 적용 안내</Label>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p>• 고용보험 / 산재보험: 법적 필수 — 매일 자동 부과</p>
                <p>• 국민연금 / 건강보험: 보험 판단 필터에서 직원별 적용 예정</p>
              </div>
            </div>
          </TabsContent>

          {/* ── 탭 2: 보험 요율 ── */}
          <TabsContent value="insurance" className="space-y-5 mt-0">
            <div className="space-y-3">
              <Label className="font-semibold">보험요율 (%)</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">고용보험 (근로자)</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      value={localSettings.employment_insurance_rate}
                      onChange={(e) => update("employment_insurance_rate", Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-sm">%</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">국민연금</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      value={localSettings.national_pension_rate}
                      onChange={(e) => update("national_pension_rate", Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-sm">%</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">건강보험</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.001"
                      value={localSettings.health_insurance_rate}
                      onChange={(e) => update("health_insurance_rate", Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-sm">%</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">장기요양보험</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      value={localSettings.long_term_care_rate}
                      onChange={(e) => update("long_term_care_rate", Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-sm">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">건강보험료 기준 요율</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">산재보험</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      value={localSettings.industrial_accident_rate}
                      onChange={(e) => update("industrial_accident_rate", Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-sm">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">사업주 100% 부담 (참고용)</p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── 탭 3: 주휴수당 ── */}
          <TabsContent value="weekly-holiday" className="space-y-5 mt-0">
            {/* 프리셋 */}
            <div className="space-y-2">
              <Label className="font-semibold">빠른 선택</Label>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handlePreset(5)}>
                  주 5일제 (월~금)
                </Button>
                <Button variant="outline" size="sm" onClick={() => handlePreset(6)}>
                  주 6일제 (월~토)
                </Button>
              </div>
            </div>

            <Separator />

            {/* 소정근로일 + 주 소정근로시간 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="font-semibold">소정근로일</Label>
                <div className="flex flex-wrap gap-3">
                  {ALL_DAYS.map((day) => (
                    <div key={day.value} className="flex items-center gap-1.5">
                      <Checkbox
                        checked={(localSettings.weekly_work_day_list || []).includes(day.value)}
                        onCheckedChange={(checked) => handleDayToggle(day.value, checked as boolean)}
                      />
                      <span className="text-sm">{day.label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  선택된 요일: {(localSettings.weekly_work_day_list || []).length}일 (
                  {(localSettings.weekly_work_day_list || [])
                    .map((d) => ALL_DAYS.find((a) => a.value === d)?.label)
                    .join(", ")}
                  )
                </p>
                {(localSettings.weekly_work_day_list || []).length < 1 && (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="text-xs">소정근로일을 최소 1일 이상 선택해주세요</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">주 소정근로시간</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={168}
                    value={localSettings.weekly_work_hours ?? 40}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!isNaN(val)) update("weekly_work_hours", val);
                    }}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">시간</span>
                </div>
                {(localSettings.weekly_work_hours ?? 40) < 15 && (localSettings.weekly_work_hours ?? 40) > 0 && (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="text-xs">15시간 미만은 주휴수당이 발생하지 않습니다</span>
                  </div>
                )}
                {(localSettings.weekly_work_hours ?? 40) > 48 && (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="text-xs">주 48시간 초과 입력되었습니다</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  주휴수당은 실제 평균 근로시간과 개근 여부로 최종 판단됩니다
                </p>
              </div>
            </div>

            <Separator />

            {/* 주휴일 + 나머지 요일 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="font-semibold">주휴일</Label>
                <Select value={localSettings.weekly_holiday || "sun"} onValueChange={handleHolidayChange}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableHolidays.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">소정근로일로 지정된 요일은 주휴일로 설정할 수 없습니다</p>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">나머지 요일 기본 처리</Label>
                <Select
                  value={localSettings.non_work_day_default_type || "REST_DAY"}
                  onValueChange={(val) => update("non_work_day_default_type", val)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REST_DAY">휴무일로 처리</SelectItem>
                    <SelectItem value="HOLIDAY">휴일로 처리</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>• 휴무일: 기본급 기준, 연장/야간만 적용</p>
                  <p>• 휴일: 휴일근로 기준 적용</p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── 탭 4: 휴일/비과세 ── */}
          <TabsContent value="holiday-tax" className="space-y-5 mt-0">
            {/* 휴일근무 지급 방식 */}
            <div className="space-y-4">
              <Label className="font-semibold flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                휴일근무 수당 지급 방식
              </Label>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">지급 정책</Label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 w-64">
                    <span className="text-sm font-medium">법 기준 자동 반영</span>
                  </div>
                  <p className="text-xs text-muted-foreground">시급제 선택 시에만 적용됩니다.</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* 비과세 수당 항목 */}
            <div className="space-y-4">
              <Label className="font-semibold flex items-center gap-2">
                <Banknote className="w-4 h-4" />
                비과세 수당 항목
              </Label>
              <p className="text-xs text-muted-foreground -mt-2">
                비활성화해도 이미 지급된 과거 데이터에는 영향을 주지 않습니다.
              </p>

              {/* 식대 */}
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <span className="text-sm font-medium">식대</span>
                  <p className="text-xs text-muted-foreground">월 20만원 한도 비과세</p>
                </div>
                <Switch
                  checked={localSettings.enable_meal_allowance ?? false}
                  onCheckedChange={(v) => update("enable_meal_allowance", v)}
                />
              </div>

              {/* 차량운전보조금 */}
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <span className="text-sm font-medium">차량운전보조금</span>
                  <p className="text-xs text-muted-foreground">월 20만원 한도 비과세</p>
                </div>
                <Switch
                  checked={localSettings.enable_vehicle_allowance ?? false}
                  onCheckedChange={(v) => update("enable_vehicle_allowance", v)}
                />
              </div>

              {/* 기타 비과세 */}
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex-1">
                  <span className="text-sm font-medium">기타 비과세</span>
                  <p className="text-xs text-muted-foreground">법적 비과세 근거가 명확한 항목만 사용하세요</p>
                </div>
                <Switch
                  checked={localSettings.enable_extra_non_taxable ?? false}
                  onCheckedChange={(v) => update("enable_extra_non_taxable", v)}
                />
              </div>
              {localSettings.enable_extra_non_taxable && (
                <div className="ml-3 space-y-2">
                  <Label className="text-xs">항목명</Label>
                  <Input
                    value={localSettings.extra_non_taxable_name ?? ""}
                    onChange={(e) => update("extra_non_taxable_name", e.target.value)}
                    placeholder="예: 자녀보육수당, 연구보조비"
                    className="w-64"
                  />
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>항목명 변경 시 이후 입력분부터 새 이름이 적용됩니다.</span>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* 하단 고정 저장 버튼 */}
        <div className="sticky bottom-0 bg-card pt-4 pb-2 mt-4 border-t flex justify-end">
          <Button onClick={handleSave} disabled={saving || !hasChanges} className="px-8">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            저장하기
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
