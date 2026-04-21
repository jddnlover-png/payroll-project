import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireOrganization?: boolean;
}

export function ProtectedRoute({ children, requireOrganization = true }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { organizations, loading: orgLoading, initialized } = useOrganization();

  // 인증 또는 조직 로딩 중일 때 (initialized가 false면 아직 조회 전)
  if (authLoading || orgLoading || !initialized) {
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

  // 조직이 필요 없는 페이지(온보딩)인데 이미 조직이 있는 사용자 → /로 리다이렉트
  if (!requireOrganization && organizations.length > 0) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
