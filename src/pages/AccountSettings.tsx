import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrganizationFeatureFlags } from "@/hooks/useOrganizationFeatureFlags";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Building2, Users, CalendarDays, ShieldCheck } from "lucide-react";

const formatDate = (dateString?: string | null) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR");
};

const addDays = (dateString?: string | null, days = 50) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date;
};

const getRemainingDays = (targetDate: Date | null) => {
  if (!targetDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export default function AccountSettings() {
  const { user } = useAuth();
  const { currentOrganization, userRole } = useOrganization();
  const { featureFlags } = useOrganizationFeatureFlags();

  const { data: organizationDetail } = useQuery({
    queryKey: ["account-organization-detail", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, created_at")
        .eq("id", currentOrganization.id)
        .maybeSingle();

      if (error) throw error;
      return data as { id: string; name: string; created_at: string | null } | null;
    },
    enabled: !!currentOrganization?.id,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["account-employee-summary", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await (supabase as any)
        .from("employees")
        .select("id, employment_type, pay_type, is_active, resignation_date, status")
        .eq("organization_id", currentOrganization.id);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentOrganization?.id,
  });

  const employeeSummary = useMemo(() => {
    const activeRows = employees.filter((emp: any) => {
      if (emp.status && emp.status !== "active") return false;
      if (emp.is_active === false) return false;
      if (emp.resignation_date) return false;
      return true;
    });

    const dailyCount = activeRows.filter((emp: any) => {
      return emp.employment_type === "daily" || emp.pay_type === "daily" || emp.pay_type === "hourly";
    }).length;

    return {
      regularCount: Math.max(activeRows.length - dailyCount, 0),
      dailyCount,
    };
  }, [employees]);

  const trialEndDate = addDays(organizationDetail?.created_at, 50);
  const remainingDays = getRemainingDays(trialEndDate);

  const planLabel =
    remainingDays === null
      ? "무료체험"
      : remainingDays >= 0
        ? "무료체험"
        : "확인 필요";

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">계정 정보</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            현재 로그인 계정과 이용 현황을 확인합니다. 이 화면은 읽기 전용입니다.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                계정 정보
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="text-muted-foreground">이름 / 표시명</div>
                <div className="mt-1 font-medium">{user?.user_metadata?.full_name || "사용자"}</div>
              </div>

              <div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  로그인 이메일
                </div>
                <div className="mt-1 font-medium">{user?.email ?? "-"}</div>
              </div>

              <div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  현재 회사
                </div>
                <div className="mt-1 font-medium">{currentOrganization?.name ?? "-"}</div>
              </div>

              <div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  현재 권한
                </div>
                <div className="mt-1">
                  <Badge variant="secondary">{userRole === "admin" ? "관리자" : "사용자"}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                사용 현황
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="text-xs text-muted-foreground">정기급여 등록 직원 수</div>
                <div className="mt-2 text-2xl font-bold">{employeeSummary.regularCount}명</div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="text-xs text-muted-foreground">일용직 등록 직원 수</div>
                <div className="mt-2 text-2xl font-bold">{employeeSummary.dailyCount}명</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />
              이용 상태
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">현재 요금제</div>
              <div className="mt-2 font-semibold">{planLabel}</div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">무료체험 종료일</div>
              <div className="mt-2 font-semibold">{formatDate(trialEndDate?.toISOString())}</div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">남은 기간</div>
              <div className="mt-2 font-semibold">
                {remainingDays === null ? "-" : remainingDays >= 0 ? `D-${remainingDays}` : "종료"}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="text-xs text-muted-foreground">일용직관리</div>
              <div className="mt-2">
                <Badge variant={featureFlags.construction_daily_enabled ? "default" : "secondary"}>
                  {featureFlags.construction_daily_enabled ? "사용중" : "미사용"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          회사 정보, 급여 설정, 급여 항목 설정은 좌측 사이드바의 설정 메뉴에서 관리할 수 있습니다.
          요금제와 기능 권한은 관리자 설정 기준으로 표시됩니다.
        </p>
      </div>
    </div>
  );
}