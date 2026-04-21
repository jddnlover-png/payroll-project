import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from 'sonner';

export interface ConstructionSite {
  site_id: string;
  organization_id: string;
  site_name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  updated_at: string;
  created_at: string;
}

export function useConstructionSites() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ['construction_sites', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('construction_sites')
        .select('*')
        .eq('organization_id', orgId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as ConstructionSite[];
    },
    enabled: !!orgId,
  });

  const activeSites = sites.filter(s => s.status === 'active');

  const createSite = useMutation({
    mutationFn: async (params: { site_name: string; start_date?: string; end_date?: string }) => {
      if (!orgId) throw new Error('No organization');
      const { data, error } = await supabase
        .from('construction_sites')
        .insert({ organization_id: orgId, ...params })
        .select()
        .single();
      if (error) {
        if (error.code === '23505') throw new Error('이미 등록된 현장명입니다');
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction_sites', orgId] });
      toast.success('현장이 등록되었습니다');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSite = useMutation({
    mutationFn: async (params: { site_id: string; site_name?: string; status?: string; start_date?: string | null; end_date?: string | null }) => {
      const { site_id, ...updates } = params;
      const { error } = await supabase
        .from('construction_sites')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('site_id', site_id);
      if (error) {
        if (error.code === '23505') throw new Error('이미 등록된 현장명입니다');
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['construction_sites', orgId] });
      toast.success('현장 정보가 수정되었습니다');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { sites, activeSites, isLoading, createSite, updateSite };
}
