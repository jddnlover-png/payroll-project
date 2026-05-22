import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Save,
  Loader2,
  CalendarDays,
  Clock,
  Briefcase,
  Building2,
  ArrowRightLeft,
  AlertTriangle,
  Info,
} from "lucide-react";
import { toast } from "sonner";

interface SalaryWorkStandardsSettingsProps {
  salaryCalcStartDay: number;
  salaryCalcEndDay: number;
  salaryPaymentMonth: string;
  salaryPaymentDay: number;
  workDays: number;
  workDayList: string[];
  weeklyHoliday: string;
  weeklyWorkHours: number;
  workStartTime: string;
  workEndTime: string;
  breakStartTime: string;
  breakEndTime: string;
  applyPublicHoliday: boolean;
  companySize: string;
  holidaySubstitute: boolean;
  payrollStartMonth: string | null;
  nonWorkDayDefaultType: string;
  saving: boolean;
  onSave: (partial: Record<string, any>) => Promise<boolean>;
}

const days = Array.from({ length: 31 }, (_, i) => i + 1);

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

export function SalaryWorkStandardsSettings({
  salaryCalcStartDay,
  salaryCalcEndDay,
  salaryPaymentMonth,
  salaryPaymentDay,
  workDays,
  workDayList,
  weeklyHoliday,
  weeklyWorkHours,
  workStartTime,
  workEndTime,
  breakStartTime,
  breakEndTime,
  applyPublicHoliday,
  companySize,
  holidaySubstitute,
  payrollStartMonth,
  nonWorkDayDefaultType,
  saving,
  onSave,
}: SalaryWorkStandardsSettingsProps) {
  const [startDay, setStartDay] = useState(salaryCalcStartDay);
  const [endDay, setEndDay] = useState(salaryCalcEndDay);
  const [paymentMonth, setPaymentMonth] = useState(salaryPaymentMonth);
  const [paymentDay, setPaymentDay] = useState(salaryPaymentDay);
  const [wd, setWd] = useState(workDays);
  const [wdList, setWdList] = useState<string[]>(workDayList);
  const [holiday, setHoliday] = useState(weeklyHoliday);
  const [wwh, setWwh] = useState(weeklyWorkHours);
  const [wStart, setWStart] = useState(workStartTime);
  const [wEnd, setWEnd] = useState(workEndTime);
  const [publicHoliday, setPublicHoliday] = useState(applyPublicHoliday);
  const [cSize, setCSize] = useState(companySize);
  const [holSub, setHolSub] = useState(holidaySubstitute);
  const [pStartMonth, setPStartMonth] = useState(payrollStartMonth || "");
  const [nonWorkDayType, setNonWorkDayType] = useState(nonWorkDayDefaultType || "REST_DAY");

  useEffect(() => {
    setStartDay(salaryCalcStartDay);
    setEndDay(salaryCalcEndDay);
    setPaymentMonth(salaryPaymentMonth);
    setPaymentDay(salaryPaymentDay);
    setWd(workDays);
    setWdList(workDayList);
    setHoliday(weeklyHoliday);
    setWwh(weeklyWorkHours);
    setWStart(workStartTime);
    setWEnd(workEndTime);
    setPublicHoliday(applyPublicHoliday);
    setCSize(companySize);
    setHolSub(holidaySubstitute);
    setPStartMonth(payrollStartMonth || "");
    setNonWorkDayType(nonWorkDayDefaultType || "REST_DAY");
  }, [
    salaryCalcStartDay,
    salaryCalcEndDay,
    salaryPaymentMonth,
    salaryPaymentDay,
    workDays,
    workDayList,
    weeklyHoliday,
    weeklyWorkHours,
    workStartTime,
    workEndTime,
    applyPublicHoliday,
    companySize,
    holidaySubstitute,
    payrollStartMonth,
    nonWorkDayDefaultType,
  ]);

  const handleDayToggle = (dayValue: string, checked: boolean) => {
    let newList: string[];
    if (checked) {
      newList = [...wdList, dayValue];
    } else {
      newList = wdList.filter((d) => d !== dayValue);
    }
    const order = ALL_DAYS.map((d) => d.value);
    newList.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    setWdList(newList);
    setWd(newList.length);

    const holidayDayValue = HOLIDAY_TO_DAY_VALUE[holiday];
    if (newList.includes(holidayDayValue)) {
      const available = ALL_DAYS.find((d) => !newList.includes(d.value));
      if (available) {
        setHoliday(DAY_VALUE_TO_HOLIDAY[available.value]);
      }
    }
  };

  const handleWorkDaysChange = (val: string) => {
    const num = Number(val);
    setWd(num);
    if (num === 5) {
      setWdList(["MON", "TUE", "WED", "THU", "FRI"]);
    } else if (num === 6) {
      setWdList(["MON", "TUE", "WED", "THU", "FRI", "SAT"]);
    }
  };

  const handleHolidayChange = (val: string) => {
    const dayValue = HOLIDAY_TO_DAY_VALUE[val];
    if (wdList.includes(dayValue)) {
      toast.error("소정근로일로 지정된 요일은 주휴일로 설정할 수 없습니다");
      return;
    }
    setHoliday(val);
  };

  const calcWorkDuration = () => {
    const [sh, sm] = wStart.split(":").map(Number);
    const [eh, em] = wEnd.split(":").map(Number);
    const [bsh, bsm] = breakStartTime.split(":").map(Number);
    const [beh, bem] = breakEndTime.split(":").map(Number);
    const stayMin = eh * 60 + em - (sh * 60 + sm);
    const breakMin = beh * 60 + bem - (bsh * 60 + bsm);
    return (stayMin - breakMin) / 60;
  };
  const workDuration = calcWorkDuration();
  const isEndAfterStart = (() => {
    const [sh, sm] = wStart.split(":").map(Number);
    const [eh, em] = wEnd.split(":").map(Number);
    return eh * 60 + em > sh * 60 + sm;
  })();

  const availableHolidays = weeklyHolidayOptions.filter((o) => {
    const dayValue = HOLIDAY_TO_DAY_VALUE[o.value];
    return !wdList.includes(dayValue);
  });

  const handleSave = async () => {
    if (wdList.length < 1) {
      toast.error("소정근로일을 최소 1일 이상 선택해주세요");
      return;
    }
    if (!isEndAfterStart) {
      toast.error("정규근무 종료시간은 시작시간보다 늦어야 합니다");
      return;
    }
    const ok = await onSave({
      salary_calc_start_day: startDay,
      salary_calc_end_day: endDay,
      salary_payment_month: paymentMonth,
      salary_payment_day: paymentDay,
      work_days: wd,
      work_day_list: wdList,
      weekly_holiday: holiday,
      weekly_work_hours: wwh,
      work_start_time: wStart,
      work_end_time: wEnd,
      apply_public_holiday: publicHoliday,
      company_size: cSize,
      holiday_substitute: holSub,
      payroll_start_month: pStartMonth || null,
      non_work_day_default_type: nonWorkDayType,
    });
    if (ok) toast.success("급여/근무 기준 설정이 저장되었습니다.");
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="work-hours" className="w-full">
  <TabsList className="w-full grid grid-cols-3 mb-4">
    <TabsTrigger value="work-hours">근무 시간/기준</TabsTrigger>
    <TabsTrigger value="company-size">사업장 규모</TabsTrigger>
    <TabsTrigger value="etc">기타 제도</TabsTrigger>
  </TabsList>

        {/* 탭2: 근무 시간/기준 */}
        <TabsContent value="work-hours" className="mt-0">
          <Card className="rounded-xl">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">근무 기준</CardTitle>
              </div>
              <CardDescription>소정근로일, 주휴일, 정규근무시간 등 근무 기준을 설정합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* 소정근로일 */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="space-y-1.5 w-40">
                    <Label className="text-sm font-medium">소정근로일</Label>
                    <Select value={String(wd)} onValueChange={handleWorkDaysChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">주 1일제</SelectItem>
                        <SelectItem value="2">주 2일제</SelectItem>
                        <SelectItem value="3">주 3일제</SelectItem>
                        <SelectItem value="4">주 4일제</SelectItem>
                        <SelectItem value="5">주 5일제</SelectItem>
                        <SelectItem value="6">주 6일제</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {ALL_DAYS.map((day) => {
                    const isChecked = wdList.includes(day.value);
                    return (
                      <label key={day.value} className="flex items-center gap-1.5 cursor-pointer select-none">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => handleDayToggle(day.value, !!checked)}
                        />
                        <span className="text-sm">{day.label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  선택된 요일: {wdList.length}일 (
                  {wdList.map((d) => ALL_DAYS.find((a) => a.value === d)?.label).join(", ")})
                </p>
                {wdList.length < 1 && (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="text-xs">소정근로일을 최소 1일 이상 선택해주세요</span>
                  </div>
                )}
              </div>

              <Separator />

              {/* 주휴일 + 주 소정근로시간 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">주휴일</Label>
                  <Select value={holiday} onValueChange={handleHolidayChange}>
                    <SelectTrigger>
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
                  <p className="text-xs text-muted-foreground">
                    소정근로일로 지정된 요일은 주휴일로 설정할 수 없습니다
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">주 소정근로시간</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={40}
                      value={wwh}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) setWwh(val);
                      }}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">시간</span>
                  </div>
                  {wwh < 15 && wwh > 0 && (
                    <div className="flex items-center gap-1.5 text-amber-600 mt-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span className="text-xs">15시간 미만은 주휴수당이 발생하지 않습니다</span>
                    </div>
                  )}
                  {wwh > 40 && (
                    <div className="flex items-center gap-1.5 text-destructive mt-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span className="text-xs">법정 최대 소정근로시간은 40시간입니다</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />
              <Separator />

              {/* 나머지 요일 기본 처리 */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">나머지 요일 기본 처리</Label>
                <p className="text-xs text-muted-foreground">
                  소정근로일·주휴일이 아닌 나머지 요일의 기본 처리 방식을 설정합니다. (예: 월~금 소정근로, 일 주휴일 →
                  토요일 처리 방식)
                </p>
                <Select value={nonWorkDayType} onValueChange={setNonWorkDayType}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REST_DAY">휴무일로 처리</SelectItem>
                    <SelectItem value="HOLIDAY">휴일로 처리</SelectItem>
                  </SelectContent>
                </Select>
                {nonWorkDayType === "REST_DAY" && (
                  <p className="text-xs text-blue-600">휴무일: 근무 시 연장수당 적용 (가산 0.5배)</p>
                )}
                {nonWorkDayType === "HOLIDAY" && (
                  <p className="text-xs text-amber-600">휴일: 근무 시 휴일수당 적용 (8h이내 1.5배, 초과 2.0배)</p>
                )}
              </div>

              <Separator />

              {/* 정규근무시간 */}
              {/* 정규근무시간 */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">정규근무시간</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">시작시간</Label>
                    <Input type="time" value={wStart} onChange={(e) => setWStart(e.target.value)} className="w-36" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">종료시간 (연장근로 시작 기준)</Label>
                    <Input type="time" value={wEnd} onChange={(e) => setWEnd(e.target.value)} className="w-36" />
                  </div>
                </div>
                {!isEndAfterStart && (
                  <div className="flex items-center gap-1.5 text-destructive mt-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="text-xs">종료시간은 시작시간보다 늦어야 합니다</span>
                  </div>
                )}
                {isEndAfterStart && workDuration !== 8 && (
                  <div className="flex items-center gap-1.5 text-blue-600 mt-1">
                    <Info className="h-3.5 w-3.5" />
                    <span className="text-xs">
                      소정근로시간이 {workDuration.toFixed(1)}시간입니다 (8시간 아님). 연장근로 판정 기준을 확인해주세요
                    </span>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">법정공휴일 자동 반영</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">법정공휴일을 근무 계산에 자동 반영합니다.</p>
                </div>
                <Switch checked={publicHoliday} onCheckedChange={setPublicHoliday} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 탭3: 사업장 규모 */}
        <TabsContent value="company-size" className="mt-0">
          <Card className="rounded-xl">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">사업장 규모</CardTitle>
              </div>
              <CardDescription>사업장 규모에 따라 공휴일 유급수당 적용 여부가 달라집니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">사업장 규모 선택</Label>
                <Select value={cSize} onValueChange={setCSize}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="under5">5인 미만</SelectItem>
                    <SelectItem value="over5">5인 이상</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {cSize === "over5" ? (
                <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">5인 이상 사업장</p>
                  <p>• 공휴일 유급휴일수당 자동 적용</p>
                  <p>• 공휴일 근로 시 8h이내 2.5배, 8h초과 3.0배</p>
                  <p>• 근로자의 날 유급 적용</p>
                </div>
              ) : (
                <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">5인 미만 사업장</p>
                  <p>• 공휴일은 정규 시급만 적용</p>
                  <p>• 근로자의 날은 유급 적용 (예외)</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 탭4: 기타 제도 */}
        <TabsContent value="etc" className="space-y-4 mt-0">
          <Card className="rounded-xl">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">휴일대체 제도</CardTitle>
              </div>
              <CardDescription>휴일을 다른 날로 대체할 수 있는 제도를 설정합니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">휴일대체 제도 사용</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {holSub
                      ? "ON: 휴일을 다른 근무일로 대체할 수 있습니다. (휴일근로수당 미발생)"
                      : "OFF: 휴일 근무 시 휴일근로수당이 자동 계산됩니다."}
                  </p>
                </div>
                <Switch checked={holSub} onCheckedChange={setHolSub} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">첫 달 주휴수당 보정</CardTitle>
              </div>
              <CardDescription>
                이 프로그램 도입 전달에도 직원들이 근무했다면 아래에 그 달을 입력하세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p>예: 3월 도입 → 2026년 2월 입력</p>
                <p>예: 4월 도입 → 2026년 3월 입력</p>
              </div>
              <Input
                type="month"
                value={pStartMonth}
                onChange={(e) => setPStartMonth(e.target.value)}
                className="w-48"
                placeholder="YYYY-MM"
              />
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p>전달 마지막 주 근태 기록이 없으면 첫 달 월초 주휴수당이 지급되지 않을 수 있습니다.</p>
                </div>
              </div>
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <div className="flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p>입력하지 않아도 오류는 없습니다. 이번 달부터 주휴수당이 정상 계산됩니다.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 하단 고정 저장 버튼 */}
        <div className="sticky bottom-0 bg-card pt-4 pb-2 mt-4 border-t flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            저장
          </Button>
        </div>
      </Tabs>
    </div>
  );
}
