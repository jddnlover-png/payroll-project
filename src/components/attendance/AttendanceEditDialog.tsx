import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrganizationSettings } from '@/hooks/useOrganizationSettings';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AttendanceEditHistory } from './AttendanceEditHistory';
import { detectShiftType, ShiftType } from '@/hooks/useAttendance';

interface AttendanceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: {
    id: string;
    employeeId: string;
    employeeName: string;
    employeeNumber: string;
    department: string;
    date: string;
    checkIn: string | null;
    checkOut: string | null;
    status: string;
    shiftType?: ShiftType | null;
  };
}

const statusOptions = [
  { value: 'present', label: '출근' },
  { value: 'late', label: '지각' },
  { value: 'absent', label: '결근' },
  { value: 'leave', label: '휴가' },
  { value: 'half_day', label: '반차' },
];

export function AttendanceEditDialog({ open, onOpenChange, record }: AttendanceEditDialogProps) {
  const { currentOrganization } = useOrganization();
  const { settings } = useOrganizationSettings();
  const queryClient = useQueryClient();
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (open) {
      setCheckIn(record.checkIn || '');
      setCheckOut(record.checkOut || '');
      setStatus(record.status);
      setReason('');
      setShowHistory(false);
    }
  }, [open, record]);

  // 출근 시간 기반으로 근무조 자동 판별
  const detectedShift = useMemo((): ShiftType => {
    if (!checkIn) return record.shiftType || 'day';
    const [h, m] = checkIn.split(':').map(Number);
    const fakeDate = new Date(2026, 0, 1, h, m, 0);
    return detectShiftType(fakeDate, settings.work_start_time, settings.shift_tier1_start);
  }, [checkIn, settings.work_start_time, settings.shift_tier1_start, record.shiftType]);

  // 출근 시간 변경 시 지각 상태 자동 재판정
  useEffect(() => {
    if (!checkIn) return;
    // 결근/휴가/반차 등 수동 설정된 상태는 건드리지 않음
    if (status !== 'present' && status !== 'late') return;

    const [h, m] = checkIn.split(':').map(Number);
    const checkInMinutes = h * 60 + m;

    const fakeDate = new Date(2026, 0, 1, h, m, 0);
    const shift = detectShiftType(fakeDate, settings.work_start_time, settings.shift_tier1_start);

    let isLate = false;
    if (shift === 'day') {
      const [startH, startM] = settings.work_start_time.split(':').map(Number);
      const workStartMinutes = startH * 60 + startM;
      isLate = checkInMinutes > workStartMinutes + settings.late_threshold;
    } else {
      const [startH, startM] = settings.shift_tier1_start.split(':').map(Number);
      const shiftStartMinutes = startH * 60 + startM;
      isLate = checkInMinutes > shiftStartMinutes + (settings.shift_late_threshold || settings.late_threshold);
    }

    setStatus(isLate ? 'late' : 'present');
  }, [checkIn, settings.work_start_time, settings.shift_tier1_start, settings.late_threshold, settings.shift_late_threshold]);

  const hasChanges = () => {
    return (
      checkIn !== (record.checkIn || '') ||
      checkOut !== (record.checkOut || '') ||
      status !== record.status
    );
  };

  const handleSave = async () => {
    if (!reason.trim()) {
      toast.error('수정 사유를 입력해주세요.');
      return;
    }

    if (reason.trim().length < 5) {
      toast.error('수정 사유를 5자 이상 입력해주세요.');
      return;
    }

    if (!hasChanges()) {
      toast.error('변경된 내용이 없습니다.');
      return;
    }

    if (!currentOrganization?.id) return;

    setIsSaving(true);

    try {
      // 기존 레코드 조회 (변경 전 값 저장용)
      const { data: existingRecord, error: fetchError } = await supabase
        .from('attendance_records')
        .select('check_in, check_out, status')
        .eq('id', record.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      // 날짜와 시간을 합쳐서 timestamp 생성
      const newCheckIn = checkIn ? `${record.date}T${checkIn}:00+09:00` : null;
      
      // 야간조: 퇴근 시간이 출근 시간보다 이른 경우 다음 날로 처리
      let checkOutDate = record.date;
      if (checkIn && checkOut) {
        const [ciH, ciM] = checkIn.split(':').map(Number);
        const [coH, coM] = checkOut.split(':').map(Number);
        const ciMinutes = ciH * 60 + ciM;
        const coMinutes = coH * 60 + coM;
        if (coMinutes <= ciMinutes) {
          // 퇴근 시간이 출근보다 이르면 다음 날
          const nextDay = new Date(record.date);
          nextDay.setDate(nextDay.getDate() + 1);
          checkOutDate = nextDay.toISOString().split('T')[0];
        }
      }
      const newCheckOut = checkOut ? `${checkOutDate}T${checkOut}:00+09:00` : null;

      // 시프트별 초과근무 계산 (출퇴근 보정 적용)
      let overtimeHours = 0;
      if (newCheckIn && newCheckOut) {
        let checkInDate = new Date(newCheckIn);
        let checkOutDate2 = new Date(newCheckOut);

        if (detectedShift === 'day') {
          // 출근 보정: 정규 출근시간 이전 → 정규 출근시간
          const [wsH, wsM] = settings.work_start_time.split(':').map(Number);
          const workStartMin = wsH * 60 + wsM;
          const ciMin = checkInDate.getHours() * 60 + checkInDate.getMinutes();
          if (ciMin < workStartMin) {
            checkInDate = new Date(checkInDate);
            checkInDate.setHours(wsH, wsM, 0, 0);
          }

          // 퇴근 보정: 정규 퇴근시간 ~ threshold 이내 → 정규 퇴근시간
          const [weH, weM] = settings.work_end_time.split(':').map(Number);
          const workEndMin = weH * 60 + weM;
          const coMin = checkOutDate2.getHours() * 60 + checkOutDate2.getMinutes();
          if (coMin >= workEndMin && coMin <= workEndMin + settings.checkout_threshold) {
            checkOutDate2 = new Date(checkOutDate2);
            checkOutDate2.setHours(weH, weM, 0, 0);
          }

          const totalMinutes = (checkOutDate2.getTime() - checkInDate.getTime()) / (1000 * 60);
          const standardMinutes = settings.standard_work_hours * 60;

          // 휴게시간 차감
          const [bsH, bsM] = settings.break_start_time.split(':').map(Number);
          const [beH, beM] = settings.break_end_time.split(':').map(Number);
          const breakMinutes = (beH * 60 + beM) - (bsH * 60 + bsM);
          const netMinutes = totalMinutes - breakMinutes;

          if (netMinutes > standardMinutes) {
            overtimeHours = Math.round((netMinutes - standardMinutes) / 60 * 10) / 10;
          }
        } else {
          // 야간조: 시작시간 이전 출근 → 시작시간으로 보정
          const [t1sH, t1sM] = settings.shift_tier1_start.split(':').map(Number);
          const ciMin = checkInDate.getHours() * 60 + checkInDate.getMinutes();
          if (ciMin < t1sH * 60 + t1sM) {
            checkInDate = new Date(checkInDate);
            checkInDate.setHours(t1sH, t1sM, 0, 0);
          }

          // 퇴근 보정: 교대근무 종료시간 ~ 퇴근기준 이내 → 종료시간으로 보정
          const [t3eH, t3eM] = settings.shift_tier3_end.split(':').map(Number);
          const shiftEndMin = t3eH * 60 + t3eM;
          const coMin2 = checkOutDate2.getHours() * 60 + checkOutDate2.getMinutes();
          if (coMin2 >= shiftEndMin && coMin2 <= shiftEndMin + settings.shift_checkout_threshold) {
            checkOutDate2 = new Date(checkOutDate2);
            checkOutDate2.setHours(t3eH, t3eM, 0, 0);
          }

          let shiftDuration = (t3eH * 60 + t3eM) - (t1sH * 60 + t1sM);
          if (shiftDuration <= 0) shiftDuration += 1440;

          const netShiftMinutes = shiftDuration - settings.shift_break_minutes;
          const totalMinutes = (checkOutDate2.getTime() - checkInDate.getTime()) / (1000 * 60);

          if (totalMinutes > netShiftMinutes) {
            overtimeHours = Math.round((totalMinutes - netShiftMinutes) / 60 * 10) / 10;
          }
        }
      }

      // 근태 기록 업데이트 (근무조도 재판별하여 저장)
      const { error: updateError } = await supabase
        .from('attendance_records')
        .update({
          check_in: newCheckIn,
          check_out: newCheckOut,
          status: status as any,
          overtime_hours: overtimeHours,
          work_type: detectedShift,
        })
        .eq('id', record.id);

      if (updateError) throw updateError;

      // 수정 이력 저장
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error: logError } = await supabase
        .from('attendance_edit_logs')
        .insert({
          attendance_record_id: record.id,
          organization_id: currentOrganization.id,
          employee_id: record.employeeId,
          edited_by: user?.id || '',
          previous_check_in: existingRecord?.check_in || null,
          previous_check_out: existingRecord?.check_out || null,
          previous_status: existingRecord?.status || null,
          new_check_in: newCheckIn,
          new_check_out: newCheckOut,
          new_status: status,
          reason: reason.trim(),
        });

      if (logError) throw logError;

      queryClient.invalidateQueries({ queryKey: ['attendance', currentOrganization.id] });
      toast.success('근태 기록이 수정되었습니다.');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error editing attendance:', error);
      toast.error('수정 중 오류가 발생했습니다: ' + (error.message || ''));
    } finally {
      setIsSaving(false);
    }
  };

  // 미리보기 근무시간 계산
  const previewWorkHours = useMemo(() => {
    if (!checkIn || !checkOut) return null;
    let [ciH, ciM] = checkIn.split(':').map(Number);
    let [coH, coM] = checkOut.split(':').map(Number);

    if (detectedShift === 'day') {
      // 출근 보정: 정규 출근시간 이전 → 정규 출근시간
      const [wsH, wsM] = settings.work_start_time.split(':').map(Number);
      const workStartMin = wsH * 60 + wsM;
      if (ciH * 60 + ciM < workStartMin) {
        ciH = wsH; ciM = wsM;
      }
      // 퇴근 보정: 정규 퇴근시간 ~ threshold 이내 → 정규 퇴근시간
      const [weH, weM] = settings.work_end_time.split(':').map(Number);
      const workEndMin = weH * 60 + weM;
      const coMin = coH * 60 + coM;
      if (coMin >= workEndMin && coMin <= workEndMin + settings.checkout_threshold) {
        coH = weH; coM = weM;
      }
    } else {
      // 야간조: 시작시간 이전 출근 → 시작시간으로 보정
      const [t1sH, t1sM] = settings.shift_tier1_start.split(':').map(Number);
      if (ciH * 60 + ciM < t1sH * 60 + t1sM) {
        ciH = t1sH; ciM = t1sM;
      }
      // 퇴근 보정: 교대근무 종료시간 ~ 퇴근기준 이내 → 종료시간으로 보정
      const [t3eH, t3eM] = settings.shift_tier3_end.split(':').map(Number);
      const shiftEndMin = t3eH * 60 + t3eM;
      const coMinVal = coH * 60 + coM;
      if (coMinVal >= shiftEndMin && coMinVal <= shiftEndMin + settings.shift_checkout_threshold) {
        coH = t3eH; coM = t3eM;
      }
    }

    let totalMinutes = (coH * 60 + coM) - (ciH * 60 + ciM);
    if (totalMinutes <= 0) totalMinutes += 1440; // 자정 경계

    // 휴게시간 차감 (8시간 이상 60분, 4시간 이상 30분)
    if (detectedShift === 'day') {
      const [bsH, bsM] = settings.break_start_time.split(':').map(Number);
      const [beH, beM] = settings.break_end_time.split(':').map(Number);
      const breakMinutes = (beH * 60 + beM) - (bsH * 60 + bsM);
      totalMinutes = Math.max(0, totalMinutes - breakMinutes);
    } else {
      totalMinutes = Math.max(0, totalMinutes - settings.shift_break_minutes);
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}시간 ${minutes}분`;
  }, [checkIn, checkOut, detectedShift, settings]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            근태 기록 수정
          </DialogTitle>
          <DialogDescription>
            {record.employeeName} ({record.employeeNumber}) · {record.date}
          </DialogDescription>
        </DialogHeader>

        {!showHistory ? (
          <div className="space-y-4">
            {/* 경고 메시지 */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm text-destructive">
                <p className="font-medium">근태 기록 수정 시 유의사항</p>
                <p className="mt-1 opacity-80">모든 수정 내역은 이력으로 기록되며, 수정 사유 입력이 필수입니다.</p>
              </div>
            </div>

            {/* 현재 정보 */}
            <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/50">
              <div>
                <span className="text-xs text-muted-foreground">현재 출근</span>
                <p className="text-sm font-medium">{record.checkIn || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">현재 퇴근</span>
                <p className="text-sm font-medium">{record.checkOut || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">현재 상태</span>
                <p className="text-sm font-medium">
                  {statusOptions.find(s => s.value === record.status)?.label || record.status}
                </p>
              </div>
            </div>

            {/* 수정 입력 필드 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-checkin">출근시간</Label>
                <Input
                  id="edit-checkin"
                  type="time"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-checkout">퇴근시간</Label>
                <Input
                  id="edit-checkout"
                  type="time"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
              </div>
            </div>

            {/* 근무조 & 근무시간 미리보기 */}
            <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-muted/30 border">
              <div>
                <span className="text-xs text-muted-foreground">판별 근무조</span>
                <p className="text-sm font-semibold">
                  <Badge variant="outline" className={detectedShift === 'night' ? 'border-purple-500 text-purple-700' : ''}>
                    {detectedShift === 'day' ? '주간조' : '야간조'}
                  </Badge>
                </p>
              </div>
              {previewWorkHours && (
                <div>
                  <span className="text-xs text-muted-foreground">총 근무시간</span>
                  <p className="text-sm font-semibold">{previewWorkHours}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-status">상태</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 수정 사유 (필수) */}
            <div className="space-y-2">
              <Label htmlFor="edit-reason" className="flex items-center gap-1">
                수정 사유 <Badge variant="destructive" className="text-[10px] px-1.5 py-0">필수</Badge>
              </Label>
              <Textarea
                id="edit-reason"
                placeholder="수정 사유를 상세히 입력해주세요 (최소 5자)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                예: 출근 단말기 오류로 인한 출근시간 정정, 외근 후 퇴근시간 누락 등
              </p>
            </div>
          </div>
        ) : (
          <AttendanceEditHistory
            attendanceRecordId={record.id}
            employeeName={record.employeeName}
          />
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="sm:mr-auto"
          >
            <History className="w-4 h-4 mr-1" />
            {showHistory ? '수정하기' : '수정 이력'}
          </Button>
          {!showHistory && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                취소
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !reason.trim() || !hasChanges()}
              >
                {isSaving ? '저장 중...' : '수정 저장'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
