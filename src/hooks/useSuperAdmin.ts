import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useSuperAdmin() {
  const { user, loading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: ["super-admin", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;

      const { data, error } = await supabase.rpc("is_super_admin" as any);

      if (error) {
        console.error("super admin check error:", error);
        return false;
      }

      return data === true;
    },
    enabled: !authLoading && !!user?.id,
  });

  return {
    isSuperAdmin: query.data === true,
    loading: authLoading || query.isLoading,
    error: query.error,
  };
}