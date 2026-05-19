import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireOrganization?: boolean;
  redirectIfHasOrganization?: boolean;
}

export function ProtectedRoute({
  children,
  requireOrganization = true,
  redirectIfHasOrganization = false,
}: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { organizations, currentOrganization, loading: orgLoading, initialized } = useOrganization();

const { data: trialStatus, isLoading: trialLoading } = useQuery({
  queryKey: ['organization-trial-status', currentOrganization?.id],
  queryFn: async () => {
    if (!currentOrganization?.id) return null;

    const { data, error } = await (supabase as any)
      .rpc('get_organization_trial_status', {
        _organization_id: currentOrganization.id,
      })
      .maybeSingle();

    if (error) throw error;
    return data as { is_expired: boolean } | null;
  },
  enabled: !!user && initialized && requireOrganization && !!currentOrganization?.id,

  // ✅ 이미 로그인된 사용자도 정지되면 자동 차단되도록 주기 확인
  refetchInterval: 5000,
  refetchOnWindowFocus: true,
  refetchOnMount: 'always',
  staleTime: 0,
});

  // 인증 또는 조직 로딩 중일 때 (initialized가 false면 아직 조회 전)
  if (authLoading || orgLoading || !initialized || trialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // 인증되지 않은 사용자 → /auth로 리다이렉트
  if (!user) {
    return <Navigate to="/landing" replace />;
  }

  // 조직이 필요한 페이지인데 조직이 없는 사용자 → /onboarding으로 리다이렉트
  if (requireOrganization && organizations.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }
  if (requireOrganization && trialStatus?.is_expired) {
  return <Navigate to="/expired" replace />;
}

  // 조직이 필요 없는 페이지(온보딩)인데 이미 조직이 있는 사용자 → /로 리다이렉트
  if (!requireOrganization && redirectIfHasOrganization && organizations.length > 0) {
  return <Navigate to="/" replace />;
}

  return <>{children}</>;
}
