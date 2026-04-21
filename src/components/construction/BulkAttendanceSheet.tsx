/**
 * 복수 인부 일괄입력 스프레드시트 컴포넌트
 */
import { useState } from "react";
import { useBulkAttendance } from "@/hooks/useBulkAttendance";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { useDailyPayrollSettings } from "@/hooks/useDailyPayrollSettings";
import { useJobTypes } from "@/hooks/useJobTypes";
import { BulkRow } from "@/utils/bulkValidation";
import {
  calculateWorkMinutes,
  calculateNightMinutes,
  toMinutes,
  adjustEndTime,
  classifyDayType,
  calculateDailyAttendancePayroll,
} from "@/utils/dailyWorkerCalculation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, RotateCcw, ClipboardCheck, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useAttendanceLock } from "@/hooks/useAttendanceLock";

interface BulkAttendanceSheetProps {
  organizationId: string;
  siteId: string;
  yearMonth: string;
  defaultWorkDate: string;
  onSaveComplete?: (count: number) => void;
}

const fmt = (n: number) => new Intl.NumberFormat("ko-KR").format(n);
const formatBulkSsnInput = (value: string) => {
  const clean = value.replace(/[^0-9]/g, "").slice(0, 13);
  if (clean.length <= 6) return clean;
  return `${clean.slice(0, 6)}-${clean.slice(6)}`;
};

const getRowPayrollPreview = (row: BulkRow, bulkWorkType: "fixed" | "hourly", dpSettings: any) => {
  const wage = Number(row.wage || 0);
  if (wage <= 0) return null;

  const workDate = row.workDate;
  if (!workDate) return null;

  if (bulkWorkType === "fixed") {
    const workMin = row.workMinutes || 0;
    if (workMin <= 0) return null;

    const dayType = classifyDayType(
      workDate,
      dpSettings.weekly_work_day_list || [],
      dpSettings.weekly_holiday || "sun",
      dpSettings.non_work_day_default_type || "REST_DAY",
    );

    return calculateDailyAttendancePayroll({
      workType: "fixed",
      dailyWage: wage,
      workMinutes: workMin,
      nightMinutes: 0,
      dayType,
    });
  }

  const startTime = row.startTime || null;
  const endTime = row.endTime || null;
  const breakMin = Number(row.breakMinutes || 0);

  const { workMin } = calculateWorkMinutes(startTime, endTime, null, breakMin);
  if (workMin <= 0) return null;

  let nightMin = 0;
  if (startTime && endTime) {
    const sMin = toMinutes(startTime);
    const eMin = adjustEndTime(sMin, toMinutes(endTime));
    nightMin = calculateNightMinutes(sMin, eMin);
    if (nightMin > workMin) nightMin = workMin;
  }

  const dayType = classifyDayType(
    workDate,
    dpSettings.weekly_work_day_list || [],
    dpSettings.weekly_holiday || "sun",
    dpSettings.non_work_day_default_type || "REST_DAY",
  );

  return calculateDailyAttendancePayroll({
    workType: "hourly",
    dailyWage: wage,
    workMinutes: workMin,
    nightMinutes: nightMin,
    dayType,
  });
};

const statusBadge = (status: BulkRow["status"], message: string) => {
  switch (status) {
    case "valid":
      return <Badge className="bg-green-100 text-green-800 border-green-300 text-[10px]">✓ 정상</Badge>;
    case "warning":
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 text-[10px]">⚠ 경고</Badge>;
    case "duplicate":
      return <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-[10px]">↩ 중복</Badge>;
    case "error":
      return <Badge className="bg-red-100 text-red-800 border-red-300 text-[10px]">✗ 오류</Badge>;
    default:
      return (
        <Badge variant="outline" className="text-[10px]">
          — 대기
        </Badge>
      );
  }
};

const rowBgClass = (status: BulkRow["status"]) => {
  switch (status) {
    case "valid":
      return "bg-green-50/50";
    case "warning":
      return "bg-yellow-50/50";
    case "duplicate":
      return "bg-orange-50/50";
    case "error":
      return "bg-red-50/50";
    default:
      return "";
  }
};

export function BulkAttendanceSheet({
  organizationId,
  siteId,
  yearMonth,
  defaultWorkDate,
  onSaveComplete,
}: BulkAttendanceSheetProps) {
  const { settings } = useOrganizationSettings();
  const { lockStatus } = useAttendanceLock(siteId, yearMonth);
  const isLocked = lockStatus.isLocked;
  const { settings: dpSettings } = useDailyPayrollSettings();
  const { jobTypes } = useJobTypes();
  const isOver5 = settings.company_size === "over5";
  const [bulkWorkType, setBulkWorkType] = useState<"fixed" | "hourly">("fixed");
  const [workHoursText, setWorkHoursText] = useState<Record<string, string>>({});

  const {
    rows,
    addRows,
    removeRow,
    updateRow,
    resetAll,
    runValidation,
    saveValidRows,
    validationResult,
    showPreview,
    setShowPreview,
    saving,
    saveResult,
    setSaveResult,
  } = useBulkAttendance(organizationId, siteId, defaultWorkDate, isOver5, dpSettings);

  // 급여유형 변경 시 모든 행의 workType 동기화
  const handleWorkTypeChange = (val: string) => {
    const wt = val as "fixed" | "hourly";
    setBulkWorkType(wt);
    rows.forEach((row) => {
      updateRow(row.id, "workType", wt);
    });
  };

  const handleSaveConfirm = async () => {
    await saveValidRows();
  };

  const handleSaveResultClose = () => {
    const count = saveResult?.success || 0;
    setSaveResult(null);
    resetAll();
    if (count > 0) onSaveComplete?.(count);
  };

  return (
    <div className="space-y-3">
      {/* 급여유형 선택 */}
      <div className="flex items-center gap-4 p-3 border rounded-lg bg-muted/30">
        <Label className="text-sm font-medium">급여유형:</Label>
        <RadioGroup value={bulkWorkType} onValueChange={handleWorkTypeChange} className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="fixed" id="bulk-fixed" />
            <Label htmlFor="bulk-fixed" className="text-sm cursor-pointer">
              고정일당
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <RadioGroupItem value="hourly" id="bulk-hourly" />
            <Label htmlFor="bulk-hourly" className="text-sm cursor-pointer">
              시급제
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* 상단 컨트롤 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => addRows(1)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> 행 추가
        </Button>
        <Button variant="outline" size="sm" onClick={() => addRows(5)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> 5행 추가
        </Button>
        <Button variant="outline" size="sm" onClick={() => addRows(10)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> 10행 추가
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={resetAll}>
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> 전체 초기화
          </Button>
          <Button size="sm" onClick={runValidation} disabled={isLocked}>
            <ClipboardCheck className="w-3.5 h-3.5 mr-1" />
            {isLocked ? "확정된 월은 수정 불가" : "검사 후 저장 미리보기"}
          </Button>
        </div>
      </div>

      {/* 스프레드시트 테이블 */}
      <div className="border rounded-lg overflow-auto max-h-[calc(100vh-300px)]">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-8 text-center">#</TableHead>
              <TableHead className="min-w-[100px]">인부명</TableHead>
              <TableHead className="min-w-[100px]">직종</TableHead>
              <TableHead className="min-w-[180px]">주민번호</TableHead>
              <TableHead className="min-w-[120px]">핸드폰번호</TableHead>
              <TableHead className="min-w-[120px]">근무일</TableHead>
              {bulkWorkType === "hourly" && <TableHead className="w-[90px]">출근</TableHead>}
              {bulkWorkType === "hourly" && <TableHead className="w-[90px]">퇴근</TableHead>}
              <TableHead className="w-[90px]">{bulkWorkType === "fixed" ? "공수" : "휴게(분)"}</TableHead>
              {bulkWorkType === "fixed" && <TableHead className="w-[70px]">근무(h)</TableHead>}
              {bulkWorkType === "fixed" && <TableHead className="w-[70px]">휴게(분)</TableHead>}
              <TableHead className="w-[100px]">{bulkWorkType === "fixed" ? "일당(원)" : "시급(원)"}</TableHead>

              {bulkWorkType === "hourly" && <TableHead className="w-[90px] text-right">정규</TableHead>}
              {bulkWorkType === "hourly" && <TableHead className="w-[90px] text-right">연장</TableHead>}
              {bulkWorkType === "hourly" && <TableHead className="w-[90px] text-right">야간</TableHead>}
              {bulkWorkType === "hourly" && <TableHead className="w-[90px] text-right text-orange-600">휴일</TableHead>}

              {dpSettings.enable_meal_allowance && <TableHead className="w-[90px]">식대</TableHead>}
              {dpSettings.enable_vehicle_allowance && <TableHead className="w-[90px]">차량보조</TableHead>}
              {dpSettings.enable_extra_non_taxable && (
                <TableHead className="w-[90px]">{dpSettings.extra_non_taxable_name || "기타비과세"}</TableHead>
              )}
              <TableHead className="w-[90px] text-right">지급액</TableHead>
              <TableHead className="w-[70px] text-center">상태</TableHead>
              <TableHead className="min-w-[140px]">메시지</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => {
              const payrollPreview = getRowPayrollPreview(row, bulkWorkType, dpSettings);

              const allowanceTotal =
                Number(row.mealAllowance || 0) +
                Number(row.vehicleAllowance || 0) +
                Number(row.extraNonTaxableAllowance || 0);

              const displayPay = (payrollPreview?.calculatedPay || 0) + allowanceTotal;

              return (
                <TableRow key={row.id} className={cn("text-xs", rowBgClass(row.status))}>
                  <TableCell className="text-center text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <Input
                      className="h-7 text-xs px-1.5"
                      value={row.workerName}
                      onChange={(e) => updateRow(row.id, "workerName", e.target.value)}
                      placeholder="이름"
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={row.jobType || "보통인부"} onValueChange={(v) => updateRow(row.id, "jobType", v)}>
                      <SelectTrigger className="h-7 text-xs px-1.5 min-w-[90px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {jobTypes.map((jt) => (
                          <SelectItem key={jt.id} value={jt.name}>
                            {jt.name}
                          </SelectItem>
                        ))}
                        {jobTypes.length === 0 && <SelectItem value="보통인부">보통인부</SelectItem>}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    <Input
                      type="text"
                      inputMode="numeric"
                      className="h-7 text-xs px-1.5 w-[160px]"
                      value={formatBulkSsnInput(row.ssnInput || "")}
                      onChange={(e) =>
                        updateRow(row.id, "ssnInput", e.target.value.replace(/[^0-9]/g, "").slice(0, 13))
                      }
                      placeholder="800101-1234567"
                    />
                  </TableCell>
                  <TableCell className="min-w-[120px]">
                    <Input
                      type="tel"
                      className="h-7 text-xs px-1.5 w-[110px]"
                      value={(row as any).phone || ""}
                      onChange={(e) => updateRow(row.id, "phone", e.target.value.replace(/[^0-9-]/g, ""))}
                      placeholder="010-0000-0000"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="h-7 text-xs px-1.5"
                      value={row.workDate}
                      onChange={(e) => updateRow(row.id, "workDate", e.target.value)}
                    />
                  </TableCell>
                  {bulkWorkType === "hourly" && (
                    <TableCell>
                      <Input
                        type="time"
                        className="h-7 text-xs px-1"
                        value={row.startTime}
                        onChange={(e) => updateRow(row.id, "startTime", e.target.value)}
                      />
                    </TableCell>
                  )}
                  {bulkWorkType === "hourly" && (
                    <TableCell>
                      <Input
                        type="time"
                        className="h-7 text-xs px-1"
                        value={row.endTime}
                        onChange={(e) => updateRow(row.id, "endTime", e.target.value)}
                      />
                    </TableCell>
                  )}
                  {bulkWorkType === "fixed" ? (
                    <>
                      {/* 공수 드롭다운 */}
                      <TableCell>
                        <Select
                          value={
                            row.workMinutes === 240
                              ? "0.5"
                              : row.workMinutes === 480
                                ? "1.0"
                                : row.workMinutes === 720
                                  ? "1.5"
                                  : row.workMinutes === 960
                                    ? "2.0"
                                    : "custom"
                          }
                          onValueChange={(v) => {
                            if (v === "custom") {
                              updateRow(row.id, "workMinutes", 0);
                              return;
                            }
                            const manDay = parseFloat(v);
                            updateRow(row.id, "workMinutes", Math.round(manDay * 8 * 60));
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs px-1.5 w-[80px]">
                            <SelectValue placeholder="1.0" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0.5">0.5</SelectItem>
                            <SelectItem value="1.0">1.0</SelectItem>
                            <SelectItem value="1.5">1.5</SelectItem>
                            <SelectItem value="2.0">2.0</SelectItem>
                            <SelectItem value="custom">직접입력</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      {/* 근무시간 읽기전용 표시 */}
                      <TableCell>
                        <Input
                          type="number"
                          step="0.5"
                          min={0}
                          max={24}
                          className="h-7 text-xs px-1.5 w-16"
                          value={row.workMinutes > 0 ? (row.workMinutes / 60).toString() : ""}
                          readOnly={[240, 480, 720, 960].includes(row.workMinutes)}
                          onChange={(e) => {
                            setWorkHoursText((prev) => ({ ...prev, [row.id]: e.target.value }));
                          }}
                          onBlur={() => {
                            const raw = workHoursText[row.id];
                            if (raw === undefined) return;
                            const hours = Math.min(parseFloat(raw) || 0, 24);
                            updateRow(row.id, "workMinutes", Math.round(hours * 60));
                            setWorkHoursText((prev) => {
                              const n = { ...prev };
                              delete n[row.id];
                              return n;
                            });
                          }}
                          placeholder="8.0"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="h-7 text-xs px-1.5 w-16"
                          value={row.breakMinutes}
                          onChange={(e) => updateRow(row.id, "breakMinutes", parseInt(e.target.value) || 0)}
                        />
                      </TableCell>
                    </>
                  ) : (
                    <TableCell>
                      <Input
                        type="number"
                        className="h-7 text-xs px-1.5 w-16"
                        value={row.breakMinutes}
                        onChange={(e) => updateRow(row.id, "breakMinutes", parseInt(e.target.value) || 0)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="min-w-[130px]">
                    <Input
                      type="number"
                      className="h-7 text-xs px-1.5 min-w-[100px] w-[120px] text-right"
                      value={row.wage || ""}
                      onChange={(e) => updateRow(row.id, "wage", parseInt(e.target.value) || 0)}
                      placeholder={bulkWorkType === "fixed" ? "일당" : "시급"}
                    />
                  </TableCell>
                  {bulkWorkType === "hourly" && (
                    <TableCell className="text-right text-xs">
                      {payrollPreview ? fmt(payrollPreview.regularPay) : "-"}
                    </TableCell>
                  )}
                  {bulkWorkType === "hourly" && (
                    <TableCell className="text-right text-xs">
                      {payrollPreview && payrollPreview.overtimePay > 0 ? fmt(payrollPreview.overtimePay) : "-"}
                    </TableCell>
                  )}
                  {bulkWorkType === "hourly" && (
                    <TableCell className="text-right text-xs">
                      {payrollPreview && payrollPreview.nightPay > 0 ? fmt(payrollPreview.nightPay) : "-"}
                    </TableCell>
                  )}
                  {bulkWorkType === "hourly" && (
                    <TableCell className="text-right text-xs text-orange-600">
                      {payrollPreview && payrollPreview.holidayPay > 0 ? fmt(payrollPreview.holidayPay) : "-"}
                    </TableCell>
                  )}
                  {dpSettings.enable_meal_allowance && (
                    <TableCell>
                      <Input
                        type="number"
                        className="h-7 text-xs px-1.5 w-20"
                        value={row.mealAllowance || ""}
                        onChange={(e) => updateRow(row.id, "mealAllowance", parseInt(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </TableCell>
                  )}
                  {dpSettings.enable_vehicle_allowance && (
                    <TableCell>
                      <Input
                        type="number"
                        className="h-7 text-xs px-1.5 w-20"
                        value={row.vehicleAllowance || ""}
                        onChange={(e) => updateRow(row.id, "vehicleAllowance", parseInt(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </TableCell>
                  )}
                  {dpSettings.enable_extra_non_taxable && (
                    <TableCell>
                      <Input
                        type="number"
                        className="h-7 text-xs px-1.5 w-20"
                        value={row.extraNonTaxableAllowance || ""}
                        onChange={(e) => updateRow(row.id, "extraNonTaxableAllowance", parseInt(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </TableCell>
                  )}
                  <TableCell className="text-right font-medium">{displayPay > 0 ? fmt(displayPay) : "-"}</TableCell>
                  <TableCell className="text-center">{statusBadge(row.status, row.message)}</TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-[160px]">{row.message}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(row.id)}>
                      <Trash2 className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 미리보기 팝업 */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>저장 미리보기</DialogTitle>
            <DialogDescription>검사 결과를 확인하세요</DialogDescription>
          </DialogHeader>
          {validationResult && (
            <div className="space-y-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span>저장 대상</span>
                  <span className="font-medium text-green-700">
                    {validationResult.validCount + validationResult.warningCount}건
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>중복 건너뜀</span>
                  <span className="font-medium text-orange-600">{validationResult.duplicateCount}건</span>
                </div>
                <div className="flex justify-between">
                  <span>오류 제외</span>
                  <span className="font-medium text-red-600">{validationResult.errorCount}건</span>
                </div>
                <div className="border-t pt-1.5 flex justify-between font-medium">
                  <span>총 지급 예정액</span>
                  <span>{fmt(validationResult.totalPay)}원</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">※ 저장된 기록은 이후 수정이 불가합니다.</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              취소 (수정)
            </Button>
            <Button
              onClick={handleSaveConfirm}
              disabled={
                saving || !validationResult || validationResult.validCount + validationResult.warningCount === 0
              }
            >
              {saving
                ? "저장 중..."
                : `${(validationResult?.validCount || 0) + (validationResult?.warningCount || 0)}건 저장 확정`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 저장 완료 팝업 */}
      <Dialog open={!!saveResult} onOpenChange={() => handleSaveResultClose()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              저장 완료
            </DialogTitle>
            <DialogDescription>일괄 저장 결과입니다</DialogDescription>
          </DialogHeader>
          {saveResult && (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span>성공</span>
                <span className="font-medium text-green-700">{saveResult.success}건</span>
              </div>
              <div className="flex justify-between">
                <span>중복 건너뜀</span>
                <span className="font-medium text-orange-600">{saveResult.skipped}건</span>
              </div>
              <div className="flex justify-between">
                <span>오류</span>
                <span className="font-medium text-red-600">{saveResult.error}건</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleSaveResultClose}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
