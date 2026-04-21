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
       return data;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['leave_records', currentOrganization?.id] });
       toast.success('휴가가 신청되었습니다');
     },
     onError: (error) => {
       console.error('Error adding leave record:', error);
       toast.error('휴가 신청 중 오류가 발생했습니다');
     },
   });
 
   const updateLeaveRecord = useMutation({
     mutationFn: async ({ id, ...updates }: { id: string } & LeaveRecordUpdate) => {
       const { data, error } = await supabase
         .from('leave_records')
         .update(updates)
         .eq('id', id)
         .select()
         .single();
 
       if (error) throw error;
       return data;
     },
     onSuccess: (_, variables) => {
       queryClient.invalidateQueries({ queryKey: ['leave_records', currentOrganization?.id] });
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
       const { error } = await supabase
         .from('leave_records')
         .delete()
         .eq('id', id);
 
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['leave_records', currentOrganization?.id] });
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