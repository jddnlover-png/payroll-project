import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

interface Organization {
  id: string;
  name: string;
  business_number: string | null;
  representative: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

interface OrganizationContextType {
  organizations: Organization[];
  currentOrganization: Organization | null;
  userRole: 'admin' | 'member' | null;
  loading: boolean;
  initialized: boolean;
  setCurrentOrganization: (org: Organization) => void;
  refreshOrganizations: () => Promise<void>;
  isAdmin: boolean;
}

const OrganizationContext = createContext<OrganizationContextType>({
  organizations: [],
  currentOrganization: null,
  userRole: null,
  loading: true,
  initialized: false,
  setCurrentOrganization: () => {},
  refreshOrganizations: async () => {},
  isAdmin: false,
});

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
};

const CURRENT_ORG_KEY = 'current_organization_id';

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganizationState] = useState<Organization | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'member' | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [lastUserId, setLastUserId] = useState<string | null>(null);

  const fetchOrganizations = async (userId: string) => {
    setLoading(true);
    setInitialized(false);
    
    try {
      // Fetch organizations where user is a member
      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId);

      if (memberError) throw memberError;

      if (!memberData || memberData.length === 0) {
        setOrganizations([]);
        setCurrentOrganizationState(null);
        setUserRole(null);
        setLoading(false);
        setInitialized(true);
        return;
      }

      const orgIds = memberData.map(m => m.organization_id);

      const { data: orgsData, error: orgsError } = await supabase
        .from('organizations')
        .select('*')
        .in('id', orgIds);

      if (orgsError) throw orgsError;

      setOrganizations(orgsData || []);

      // Restore or set current organization
      const savedOrgId = localStorage.getItem(CURRENT_ORG_KEY);
      const savedOrg = orgsData?.find(o => o.id === savedOrgId);
      
      if (savedOrg) {
        setCurrentOrganizationState(savedOrg);
        await fetchUserRole(savedOrg.id);
      } else if (orgsData && orgsData.length > 0) {
        setCurrentOrganizationState(orgsData[0]);
        localStorage.setItem(CURRENT_ORG_KEY, orgsData[0].id);
        await fetchUserRole(orgsData[0].id);
      }
    } catch (error) {
      console.error('Error fetching organizations:', error);
      setOrganizations([]);
      setCurrentOrganizationState(null);
      setUserRole(null);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  };

  const resetState = () => {
    setOrganizations([]);
    setCurrentOrganizationState(null);
    setUserRole(null);
    setLoading(false);
    setInitialized(true);
    setLastUserId(null);
  };

  const fetchUserRole = async (orgId: string) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (error) throw error;
      setUserRole(data?.role as 'admin' | 'member' || 'member');
    } catch (error) {
      console.error('Error fetching user role:', error);
      setUserRole('member');
    }
  };

  const setCurrentOrganization = (org: Organization) => {
    setCurrentOrganizationState(org);
    localStorage.setItem(CURRENT_ORG_KEY, org.id);
    fetchUserRole(org.id);
  };

  const refreshOrganizations = async () => {
    if (user) {
      await fetchOrganizations(user.id);
    }
  };

  // authLoading이 완료된 후에만 조직 조회 시작
  // user가 변경될 때마다 조직 재조회
  useEffect(() => {
    if (authLoading) {
      // 인증 로딩 중에는 대기
      setLoading(true);
      setInitialized(false);
      return;
    }

    if (!user) {
      // 로그아웃 상태
      resetState();
      return;
    }

    // 사용자가 변경되었거나 아직 초기화되지 않은 경우
    if (user.id !== lastUserId) {
      setLastUserId(user.id);
      fetchOrganizations(user.id);
    }
  }, [user, authLoading, lastUserId]);

  return (
    <OrganizationContext.Provider
      value={{
        organizations,
        currentOrganization,
        userRole,
        loading,
        initialized,
        setCurrentOrganization,
        refreshOrganizations,
        isAdmin: userRole === 'admin',
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};
