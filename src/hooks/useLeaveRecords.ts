 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { useOrganization } from '@/contexts/OrganizationContext';
 import { toast } from 'sonner';
 
 export interface LeaveRecord {
   id: string;
   organization_id: string;
   employee_id: string;
   leave_type: string;
   start_date: string;
   end_date: string;
   days: number;
   reason: string | null;
   status: string | null;
   created_at: string;
   updated_at: string;
 }
 
 export type LeaveRecordInsert = Omit<LeaveRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'>;
export type LeaveRecordUpdate = Partial<Omit<LeaveRecord, 'id' | 'organization_id' | 'employee_id' | 'created_at' | 'updated_at'>>;

function getDatesBetween(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    result.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  }

  return result;
}

function getAttendanceStatusFromLeaveType(leaveType: string | null | undefined): string {
  if (leaveType === 'half_day' || leaveType === 'half') return 'half_day';

  // attendance_records.status enum에는 annual이 없으므로
  // 연차도 근태 계산용 상태는 leave로 저장한다.
  return 'leave';
}

const LEAVE_ATTENDANCE_STATUSES = ['leave', 'annual', 'half_day'];

async function syncApprovedLeaveToAttendance(record: LeaveRecord) {
  const dates = getDatesBetween(record.start_date, record.end_date);
  const attendanceStatus = getAttendanceStatusFromLeaveType(record.leave_type);

  for (const date of dates) {
    const { data: existing, error: selectError } = await (supabase as any)
      .from('attendance_records')
      .select('id, check_in, check_out, status')
      .eq('organization_id', record.organization_id)
      .eq('employee_id', record.employee_id)
      .eq('date', date)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing?.id) {
      const { error: updateError } = await (supabase as any)
        .from('attendance_records')
        .update({
          status: attendanceStatus,
          check_in: null,
          check_out: null,
          break_minutes: 0,
          work_type: 'day',
        })
        .eq('id', existing.id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await (supabase as any)
        .from('attendance_records')
        .insert({
          organization_id: record.organization_id,
          employee_id: record.employee_id,
          date,
          status: attendanceStatus,
          check_in: null,
          check_out: null,
          break_minutes: 0,
          work_type: 'day',
        });

      if (insertError) throw insertError;
    }
  }
}

async function removeLeaveFromAttendance(record: LeaveRecord) {
  const dates = getDatesBetween(record.start_date, record.end_date);

  const { error } = await (supabase as any)
    .from('attendance_records')
    .delete()
    .eq('organization_id', record.organization_id)
    .eq('employee_id', record.employee_id)
    .in('date', dates)
    .in('status', LEAVE_ATTENDANCE_STATUSES)
    .is('check_in', null)
    .is('check_out', null);

  if (error) throw error;
}
 
export function useLeaveRecords() {
   const { currentOrganization } = useOrganization();
   const queryClient = useQueryClient();
 
   const { data: leaveRecords = [], isLoading, error } = useQuery({
     queryKey: ['leave_records', currentOrganization?.id],
     queryFn: async () => {
       if (!currentOrganization?.id) return [];
 
       const { data, error } = await supabase
         .from('leave_records')
         .select('*')
         .eq('organization_id', currentOrganization.id)
         .order('created_at', { ascending: false });
 
       if (error) throw error;
       return data as LeaveRecord[];
     },
     enabled: !!currentOrganization?.id,
   });
 
   const addLeaveRecord = useMutation({
     mutationFn: async (record: LeaveRecordInsert) => {
       if (!currentOrganization?.id) throw new Error('No organization selected');
 
       const { data, error } = await supabase
         .from('leave_records')
         .insert({
           ...record,
           organization_id: currentOrganization.id,
         })
         .select()
         .single();
 
              if (error) throw error;

       const createdRecord = data as LeaveRecord;

       if (createdRecord.status === 'approved') {
         await syncApprovedLeaveToAttendance(createdRecord);
       }

       return data;
     },
          onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['leave_records', currentOrganization?.id] });
       queryClient.invalidateQueries({ queryKey: ['attendance'] });
       queryClient.invalidateQueries({ queryKey: ['attendance_records'] });
       toast.success('휴가가 신청되었습니다');
     },
     onError: (error) => {
       console.error('Error adding leave record:', error);
       toast.error('휴가 신청 중 오류가 발생했습니다');
     },
   });
 
      const updateLeaveRecord = useMutation({
  mutationFn: async ({ id, ...updates }: { id: string } & LeaveRecordUpdate) => {
    const { data: existing, error: selectError } = await supabase
      .from('leave_records')
      .select('*')
      .eq('id', id)
      .single();

    if (selectError) throw selectError;

    const oldRecord = existing as LeaveRecord;

    if (oldRecord.status === 'approved') {
      await removeLeaveFromAttendance(oldRecord);
    }

    const { data, error } = await supabase
      .from('leave_records')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    const updatedRecord = data as LeaveRecord;

    if (updatedRecord.status === 'approved') {
      await syncApprovedLeaveToAttendance(updatedRecord);
    }

    return data;
  },
  onSuccess: (_, variables) => {
    queryClient.invalidateQueries({ queryKey: ['leave_records', currentOrganization?.id] });
    queryClient.invalidateQueries({ queryKey: ['attendance'] });
    queryClient.invalidateQueries({ queryKey: ['attendance_records'] });

    if (variables.status === 'approved') {
      toast.success('휴가가 승인되었습니다');
    } else if (variables.status === 'rejected') {
      toast.success('휴가가 반려되었습니다');
    } else {
      toast.success('휴가 정보가 수정되었습니다');
    }
  },
  onError: (error) => {
    console.error('Error updating leave record:', error);
    toast.error('휴가 정보 수정 중 오류가 발생했습니다');
  },
});
 
      const deleteLeaveRecord = useMutation({
     mutationFn: async (id: string) => {
       const { data: existing, error: selectError } = await supabase
         .from('leave_records')
         .select('*')
         .eq('id', id)
         .single();

       if (selectError) throw selectError;

       if (existing) {
         await removeLeaveFromAttendance(existing as LeaveRecord);
       }

       const { error } = await supabase
         .from('leave_records')
         .delete()
         .eq('id', id);
 
       if (error) throw error;
     },
     onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['leave_records', currentOrganization?.id] });
  queryClient.invalidateQueries({ queryKey: ['attendance'] });
  queryClient.invalidateQueries({ queryKey: ['attendance_records'] });
  toast.success('휴가 기록이 삭제되었습니다');
},
     onError: (error) => {
       console.error('Error deleting leave record:', error);
       toast.error('휴가 기록 삭제 중 오류가 발생했습니다');
     },
   });
 
   return {
     leaveRecords,
     isLoading,
     error,
     addLeaveRecord,
     updateLeaveRecord,
     deleteLeaveRecord,
   };
 }