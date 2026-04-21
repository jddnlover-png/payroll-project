import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DailyWageSnapshot } from '@/hooks/useDailyWageSnapshots';
import { formatWorkHours } from '@/utils/workHoursCalculation';

interface DailyWageDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: DailyWageSnapshot | null;
  employeeName: string;
  workDate: string;
}

export function DailyWageDetailDialog({
  open,
  onOpenChange,
  snapshot,
  employeeName,
  workDate,
}: DailyWageDetailDialogProps) {
  if (!snapshot) return null;

  const effectiveHourlyRate = snapshot.pay_type === 'hourly'
    ? snapshot.hourly_rate
    : snapshot.daily_rate / (snapshot.standard_work_hours || 8);

  const overtimeMultiplier = snapshot.overtime_multiplier;
  const nightMultiplier = snapshot.night_shift_multiplier;

  // 야간교대근무자 여부 판정
  const isNightShiftWorker = snapshot.night_shift_minutes > 0 &&
    (snapshot.tier1_minutes > 0 || snapshot.tier2_minutes > 0 || snapshot.tier3_minutes > 0 || (snapshot as any).tier4_minutes > 0);

  // 단계별 휴게시간
  const tier1Break = (snapshot as any).tier1_break_minutes || 0;
  const tier2Break = (snapshot as any).tier2_break_minutes || 0;
  const tier3Break = (snapshot as any).tier3_break_minutes || 0;
  const tier4Break = (snapshot as any).tier4_break_minutes || 0;

  // 야간수당 수식 구성
  let nightFormula = '-';
  if (isNightShiftWorker) {
    const parts: string[] = [];
    if (snapshot.tier1_minutes > 0) {
      const breakNote = tier1Break > 0 ? ` 휴게${tier1Break}분 차감` : '';
      parts.push(`(${Math.round(effectiveHourlyRate).toLocaleString()}×${snapshot.tier1_multiplier}배×${formatWorkHours(snapshot.tier1_minutes)}${breakNote})`);
    }
    if (snapshot.tier2_minutes > 0) {
      const breakNote = tier2Break > 0 ? ` 휴게${tier2Break}분 차감` : '';
      parts.push(`(${Math.round(effectiveHourlyRate).toLocaleString()}×${snapshot.tier2_multiplier}배×${formatWorkHours(snapshot.tier2_minutes)}${breakNote})`);
    }
    if (snapshot.tier3_minutes > 0) {
      const breakNote = tier3Break > 0 ? ` 휴게${tier3Break}분 차감` : '';
      parts.push(`(${Math.round(effectiveHourlyRate).toLocaleString()}×${snapshot.tier3_multiplier}배×${formatWorkHours(snapshot.tier3_minutes)}${breakNote})`);
    }
    if ((snapshot as any).tier4_minutes > 0) {
      const breakNote = tier4Break > 0 ? ` 휴게${tier4Break}분 차감` : '';
      parts.push(`(${Math.round(effectiveHourlyRate).toLocaleString()}×${(snapshot as any).tier4_multiplier}배×${formatWorkHours((snapshot as any).tier4_minutes)}${breakNote})`);
    }
    nightFormula = parts.join(' + ');
  } else if (snapshot.night_minutes > 0) {
    nightFormula = `${Math.round(effectiveHourlyRate).toLocaleString()}(시급) × ${nightMultiplier}(배율) × ${formatWorkHours(snapshot.night_minutes)}`;
  }

  // 야간교대 총 근무시간 (단계별 합산)
  const totalNightShiftMinutes = isNightShiftWorker
    ? snapshot.tier1_minutes + snapshot.tier2_minutes + snapshot.tier3_minutes + ((snapshot as any).tier4_minutes || 0)
    : snapshot.night_shift_minutes;

  const paymentItems = [
    {
      name: snapshot.pay_type === 'daily' ? '기본 일당' : '기본급 (정규)',
      amount: snapshot.base_wage,
      formula: snapshot.pay_type === 'daily'
        ? `고정 일당 ${snapshot.daily_rate.toLocaleString()}원`
        : `${snapshot.hourly_rate.toLocaleString()}(시급) × ${formatWorkHours(snapshot.regular_minutes)}`,
    },
    {
      name: '연장근로수당',
      amount: snapshot.overtime_pay,
      formula: snapshot.overtime_minutes > 0
        ? `${Math.round(effectiveHourlyRate).toLocaleString()}(시급) × ${overtimeMultiplier}(배율) × ${formatWorkHours(snapshot.overtime_minutes)}`
        : '-',
    },
    {
      name: isNightShiftWorker ? '야간교대수당' : '야간근로수당',
      amount: snapshot.night_pay,
      formula: nightFormula,
    },
  ];

  // 야간교대 단계별 상세 내역 (서브 행)
  const tierDetails = isNightShiftWorker ? [
    { name: '  └ 1단계 (정규+비야간)', minutes: snapshot.tier1_minutes, multiplier: snapshot.tier1_multiplier, pay: snapshot.tier1_pay, breakMin: tier1Break },
    { name: '  └ 2단계 (정규+야간)', minutes: snapshot.tier2_minutes, multiplier: snapshot.tier2_multiplier, pay: snapshot.tier2_pay, breakMin: tier2Break },
    { name: '  └ 3단계 (연장+야간)', minutes: snapshot.tier3_minutes, multiplier: snapshot.tier3_multiplier, pay: snapshot.tier3_pay, breakMin: tier3Break },
    { name: '  └ 4단계 (연장+비야간)', minutes: (snapshot as any).tier4_minutes || 0, multiplier: (snapshot as any).tier4_multiplier || 1.5, pay: (snapshot as any).tier4_pay || 0, breakMin: tier4Break },
  ].filter(t => t.minutes > 0) : [];

  const totalWage = snapshot.total_wage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            일일 예상 급여 상세
            <Badge variant="outline" className="text-xs font-normal">
              {snapshot.pay_type === 'hourly' ? '시급제' : '일급제'}
            </Badge>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {employeeName} · {workDate}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* 기본 정보 */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="p-2 rounded bg-muted/50">
              <p className="text-xs text-muted-foreground">적용 시급</p>
              <p className="font-semibold">{Math.round(effectiveHourlyRate).toLocaleString()}원</p>
            </div>
            <div className="p-2 rounded bg-muted/50">
              <p className="text-xs text-muted-foreground">연장 배율</p>
              <p className="font-semibold">{overtimeMultiplier}배</p>
            </div>
            <div className="p-2 rounded bg-muted/50">
              <p className="text-xs text-muted-foreground">야간 배율</p>
              <p className="font-semibold">
                {isNightShiftWorker
                  ? `${snapshot.tier1_multiplier}/${snapshot.tier2_multiplier}/${snapshot.tier3_multiplier}배`
                  : `${nightMultiplier}배`
                }
              </p>
            </div>
          </div>

          {/* 근무시간 요약 */}
          <div className={`grid ${isNightShiftWorker ? 'grid-cols-3' : 'grid-cols-4'} gap-2 text-sm`}>
            <div className="text-center p-2 rounded bg-primary/5">
              <p className="text-xs text-muted-foreground">정규</p>
              <p className="font-medium">{formatWorkHours(snapshot.regular_minutes)}</p>
            </div>
            <div className="text-center p-2 rounded bg-primary/5">
              <p className="text-xs text-muted-foreground">연장</p>
              <p className="font-medium">{formatWorkHours(snapshot.overtime_minutes)}</p>
            </div>
            {!isNightShiftWorker && (
              <div className="text-center p-2 rounded bg-primary/5">
                <p className="text-xs text-muted-foreground">야간</p>
                <p className="font-medium">{formatWorkHours(snapshot.night_minutes)}</p>
              </div>
            )}
            <div className="text-center p-2 rounded bg-primary/5">
              <p className="text-xs text-muted-foreground">야간교대</p>
              <p className="font-medium">{formatWorkHours(totalNightShiftMinutes)}</p>
            </div>
          </div>

          {/* 급여 산출 내역 */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>항목</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead>계산 방법</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paymentItems.map((item) => (
                <TableRow key={item.name}>
                  <TableCell className="font-medium text-sm">{item.name}</TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {item.amount > 0 ? `${item.amount.toLocaleString()}원` : '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.formula}</TableCell>
                </TableRow>
              ))}
              {/* 야간교대 단계별 상세 */}
              {tierDetails.map((tier) => (
                <TableRow key={tier.name} className="text-xs text-muted-foreground">
                  <TableCell className="pl-6 py-1">{tier.name} ({tier.multiplier}배)</TableCell>
                  <TableCell className="text-right py-1">
                    {tier.pay > 0 ? `${tier.pay.toLocaleString()}원` : '-'}
                  </TableCell>
                  <TableCell className="py-1">
                    {Math.round(effectiveHourlyRate).toLocaleString()} × {tier.multiplier} × {formatWorkHours(tier.minutes)}
                    {tier.breakMin > 0 && (
                      <span className="text-destructive ml-1">휴게 {tier.breakMin}분 차감됨</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-bold">
                <TableCell>합계</TableCell>
                <TableCell className="text-right text-primary">
                  {totalWage.toLocaleString()}원
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {isNightShiftWorker && (
            <div className="text-xs space-y-1 p-2 rounded bg-muted/50">
              <p className="text-muted-foreground">※ 지각 기준 적용: 출근 시간이 1단계 시작시간 기준 이내일 경우 정시 출근으로 인정</p>
              <p className="text-muted-foreground">※ 퇴근 기준 적용: 퇴근 시간이 3단계 종료시간 기준 이내일 경우 정시 퇴근으로 처리</p>
              {(tier1Break > 0 || tier2Break > 0 || tier3Break > 0) && (
                <p className="text-muted-foreground">
                  ※ 단계별 휴게시간 차감: 
                  {tier1Break > 0 && ` 1단계 ${tier1Break}분`}
                  {tier2Break > 0 && ` 2단계 ${tier2Break}분`}
                  {tier3Break > 0 && ` 3단계 ${tier3Break}분`}
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            ※ 이 금액은 스냅샷 저장 시점의 시급·배율 기준으로 산출된 예상치입니다.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
