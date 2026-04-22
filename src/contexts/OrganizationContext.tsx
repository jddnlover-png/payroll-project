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
  const fetchedUserIdRef = useRef<string | null>(null);

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
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resetState = useCallback(() => {
    fetchedUserIdRef.current = null;
    safeSetState(() => {
      setOrganizations([]);
      setCurrentOrganizationState(null);
      setCurrentRole(null);
      setLoading(false);
      setInitialized(false);
    });
  }, [safeSetState]);

  const fetchOrganizations = useCallback(async () => {
    if (authLoading) return;

    if (!user?.id) {
      fetchedUserIdRef.current = null;
      resetState();
      return;
    }

    if (fetchedUserIdRef.current === user.id) {
      return;
    }

    fetchedUserIdRef.current = user.id;
    safeSetState(() => setLoading(true));

    try {
      const { data: memberships, error: membershipsError } = await supabase
        .from("organization_members")
        .select("organization_id, is_owner")
        .eq("user_id", user.id);

      if (membershipsError) throw membershipsError;

      if (!memberships || memberships.length === 0) {
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

      if (orgsError) throw orgsError;

      const normalizedOrgs: Organization[] = (orgs ?? []).map((org) => ({
        id: org.id,
        name: org.name,
      }));

      const nextCurrent = normalizedOrgs[0] ?? null;
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

      safeSetState(() => {
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
  }, [user?.id, authLoading, resetState, safeSetState]);

  useEffect(() => {
    void fetchOrganizations();
  }, [fetchOrganizations]);

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
    fetchedUserIdRef.current = null;
    await fetchOrganizations();
  }, [fetchOrganizations]);

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