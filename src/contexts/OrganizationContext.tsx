import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Organization = {
  id: string;
  name?: string | null;
};

type OrganizationContextType = {
  organizations: Organization[];
  currentOrganization: Organization | null;
  currentRole: string | null;
  loading: boolean;
  initialized: boolean;
  setCurrentOrganization: (org: Organization | null) => void;
  refreshOrganizations: () => Promise<void>;
};

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();

  const mountedRef = useRef(true);
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganizationState] = useState<Organization | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const safeSetState = useCallback((fn: () => void) => {
    if (!mountedRef.current) return;
    fn();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
  console.log('[ORG] useEffect 실행 - authLoading:', authLoading, 'user?.id:', user?.id, 'prevUserIdRef:', prevUserIdRef.current);

  if (authLoading) {
    console.log('[ORG] authLoading 중 - 스킵');
    return;
  }

  if (prevUserIdRef.current === user?.id) {
    console.log('[ORG] user?.id 동일 - 스킵');
    return;
  }

  prevUserIdRef.current = user?.id;
  console.log('[ORG] fetch 시작');

    if (!user?.id) {
      safeSetState(() => {
        setOrganizations([]);
        setCurrentOrganizationState(null);
        setCurrentRole(null);
        setLoading(false);
        setInitialized(true);
      });
      return;
    }

    // user?.id가 생긴 경우 fetch 실행
    const run = async () => {
  console.log('[ORG] run 시작');
  safeSetState(() => setLoading(true));

  try {
    const { data: memberships, error: membershipsError } = await supabase
      .from("organization_members")
      .select("organization_id, is_owner")
      .eq("user_id", user.id);

    console.log('[ORG] memberships:', memberships, '에러:', membershipsError);

if (membershipsError) throw membershipsError;

if (!memberships || memberships.length === 0) {
  console.log('[ORG] memberships 없음 - 종료');
          safeSetState(() => {
            setOrganizations([]);
            setCurrentOrganizationState(null);
            setCurrentRole(null);
            setLoading(false);
            setInitialized(true);
          });
          return;
        }

        const organizationIds = memberships.map((m) => m.organization_id);

        const { data: orgs, error: orgsError } = await supabase
  .from("organizations")
  .select("id, name")
  .in("id", organizationIds);

console.log('[ORG] orgs:', orgs, '에러:', orgsError);
if (orgsError) throw orgsError;

const normalizedOrgs: Organization[] = (orgs ?? []).map((org) => ({
  id: org.id,
  name: org.name,
}));

const nextCurrent = normalizedOrgs[0] ?? null;
console.log('[ORG] nextCurrent:', nextCurrent);
let nextRole: string | null = null;

        if (nextCurrent) {
          const { data: roleRow, error: roleError } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("organization_id", nextCurrent.id)
            .maybeSingle();

          if (roleError) throw roleError;
          nextRole = roleRow?.role ?? null;
        }

        console.log('[ORG] safeSetState 호출 직전 - mountedRef:', mountedRef.current);
safeSetState(() => {
  console.log('[ORG] safeSetState 내부 실행됨');
  setOrganizations(normalizedOrgs);
  setCurrentOrganizationState(nextCurrent);
  setCurrentRole(nextRole);
  setLoading(false);
  setInitialized(true);
});
      } catch (error) {
        console.error("OrganizationContext error:", error);
        safeSetState(() => {
          setOrganizations([]);
          setCurrentOrganizationState(null);
          setCurrentRole(null);
          setLoading(false);
          setInitialized(true);
        });
      }
    };

    void run();
  }, [user?.id, authLoading, safeSetState]);

  const setCurrentOrganization = useCallback(
    (org: Organization | null) => {
      safeSetState(() => setCurrentOrganizationState(org));

      if (!user?.id || !org?.id) {
        safeSetState(() => setCurrentRole(null));
        return;
      }

      void (async () => {
        try {
          const { data, error } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("organization_id", org.id)
            .maybeSingle();

          if (error) throw error;
          safeSetState(() => setCurrentRole(data?.role ?? null));
        } catch (error) {
          console.error("OrganizationContext setCurrentOrganization role error:", error);
          safeSetState(() => setCurrentRole(null));
        }
      })();
    },
    [safeSetState, user?.id]
  );

  const refreshOrganizations = useCallback(async () => {
    prevUserIdRef.current = undefined;
    // user?.id를 다시 세팅해서 useEffect 재실행 유도
    // 직접 run()을 호출하는 것과 동일한 효과
    if (!user?.id) return;
    
    safeSetState(() => setLoading(true));

    try {
      const { data: memberships, error: membershipsError } = await supabase
        .from("organization_members")
        .select("organization_id, is_owner")
        .eq("user_id", user.id);

      if (membershipsError) throw membershipsError;

      const organizationIds = (memberships ?? []).map((m) => m.organization_id);

      const { data: orgs, error: orgsError } = await supabase
        .from("organizations")
        .select("id, name")
        .in("id", organizationIds);

      if (orgsError) throw orgsError;

      const normalizedOrgs: Organization[] = (orgs ?? []).map((org) => ({
        id: org.id,
        name: org.name,
      }));

      const nextCurrent = normalizedOrgs[0] ?? null;
      let nextRole: string | null = null;

      if (nextCurrent && user?.id) {
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("organization_id", nextCurrent.id)
          .maybeSingle();
        nextRole = roleRow?.role ?? null;
      }

      safeSetState(() => {
        setOrganizations(normalizedOrgs);
        setCurrentOrganizationState(nextCurrent);
        setCurrentRole(nextRole);
        setLoading(false);
        setInitialized(true);
      });
    } catch (error) {
      console.error("refreshOrganizations error:", error);
      safeSetState(() => setLoading(false));
    }
  }, [user?.id, safeSetState]);

  const value = useMemo<OrganizationContextType>(
    () => ({
      organizations,
      currentOrganization,
      currentRole,
      loading,
      initialized,
      setCurrentOrganization,
      refreshOrganizations,
    }),
    [organizations, currentOrganization, currentRole, loading, initialized, setCurrentOrganization, refreshOrganizations]
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error("useOrganization must be used within an OrganizationProvider");
  }
  return context;
}