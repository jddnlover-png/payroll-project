import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';

interface AttendanceEditHistoryProps {
  attendanceRecordId: string;
  employeeName: string;
}

const statusLabels: Record<string, string> = {
  present: '출근',
  late: '지각',
  absent: '결근',
  leave: '휴가',
  half_day: '반차',
};

function formatTime(timestamp: string | null): string {
  if (!timestamp) return '-';
  try {
    return format(new Date(timestamp), 'HH:mm');
  } catch {
    return '-';
  }
}

export function AttendanceEditHistory({ attendanceRecordId, employeeName }: AttendanceEditHistoryProps) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['attendance-edit-logs', attendanceRecordId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_edit_logs')
        .select('*')
        .eq('attendance_record_id', attendanceRecordId)
        .order('edited_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!attendanceRecordId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        로딩 중...
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <FileText className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">수정 이력이 없습니다.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[350px]">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {employeeName}의 수정 이력 ({logs.length}건)
        </p>
        {logs.map((log) => (
          <div
            key={log.id}
            className="p-3 rounded-lg border bg-card space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {format(new Date(log.edited_at), 'yyyy-MM-dd HH:mm', { locale: ko })}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              {/* 출근시간 변경 */}
              {log.previous_check_in !== log.new_check_in && (
                <div>
                  <span className="text-xs text-muted-foreground">출근시간</span>
                  <div className="flex items-center gap-1">
                    <span className="line-through text-muted-foreground">
                      {formatTime(log.previous_check_in)}
                    </span>
                    <span>→</span>
                    <span className="font-medium text-primary">
                      {formatTime(log.new_check_in)}
                    </span>
                  </div>
                </div>
              )}
              {/* 퇴근시간 변경 */}
              {log.previous_check_out !== log.new_check_out && (
                <div>
                  <span className="text-xs text-muted-foreground">퇴근시간</span>
                  <div className="flex items-center gap-1">
                    <span className="line-through text-muted-foreground">
                      {formatTime(log.previous_check_out)}
                    </span>
                    <span>→</span>
                    <span className="font-medium text-primary">
                      {formatTime(log.new_check_out)}
                    </span>
                  </div>
                </div>
              )}
              {/* 상태 변경 */}
              {log.previous_status !== log.new_status && (
                <div>
                  <span className="text-xs text-muted-foreground">상태</span>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs">
                      {statusLabels[log.previous_status || ''] || log.previous_status || '-'}
                    </Badge>
                    <span>→</span>
                    <Badge variant="secondary" className="text-xs">
                      {statusLabels[log.new_status || ''] || log.new_status || '-'}
                    </Badge>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-1 border-t">
              <span className="text-xs text-muted-foreground">사유: </span>
              <span className="text-sm">{log.reason}</span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
