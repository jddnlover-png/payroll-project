import { DailyAttendance } from '@/components/attendance/DailyAttendance';
import { AttendanceSummary } from '@/components/attendance/AttendanceSummary';
import { ExcelAttendanceUpload } from '@/components/attendance/ExcelAttendanceUpload';

interface AttendanceTabProps {
  activeTab?: string;
}

export function AttendanceTab({ activeTab: controlledTab }: AttendanceTabProps) {
  const currentTab = controlledTab || 'daily';

    return (
    <div className="space-y-4">
      {currentTab === 'daily' && <DailyAttendance />}
      {currentTab === 'summary' && <AttendanceSummary />}
      {currentTab === 'upload' && <ExcelAttendanceUpload />}
    </div>
  );
}
