import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from 'sonner';

export interface JobType {
  id: string;
  organization_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export function useJobTypes() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  const queryKey = ['job_types', orgId];

  const { data: jobTypes = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('job_types')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return data as JobType[];
    },
    enabled: !!orgId,
  });

  const addJobType = useMutation({
    mutationFn: async (name: string) => {
      if (!orgId) throw new Error('조직을 선택해주세요');
      const maxOrder = jobTypes.length > 0
        ? Math.max(...jobTypes.map(j => j.sort_order)) + 1
        : 0;

      const { data: existing, error: fetchError } = await supabase
        .from('job_types')
        .select('id, is_active')
        .eq('organization_id', orgId)
        .eq('name', name.trim())
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        if (existing.is_active) {
          throw new Error('이미 존재하는 직종입니다.');
        }
        const { error } = await supabase
          .from('job_types')
          .update({ is_active: true, sort_order: maxOrder })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('job_types')
          .insert({
            organization_id: orgId,
            name: name.trim(),
            sort_order: maxOrder,
            is_active: true,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('직종이 추가되었습니다');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deactivateJobType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('job_types')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('직종이 숨김 처리되었습니다');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const initDefaultJobTypes = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const defaults = [
        '형틀목수', '철근공', '미장공',
        '방수공', '도장공', '보통인부'
      ];
      const records = defaults.map((name, i) => ({
        organization_id: orgId,
        name,
        sort_order: i,
        is_active: true,
      }));
      const { error } = await supabase
        .from('job_types')
        .upsert(records, {
          onConflict: 'organization_id,name',
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    jobTypes,
    isLoading,
    addJobType,
    deactivateJobType,
    initDefaultJobTypes,
  };
}
