import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function TrialNoticeDialog() {
  const { currentOrganization } = useOrganization();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["trial-notice-status", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { data, error } = await (supabase as any)
        .rpc("get_organization_trial_status", {
          _organization_id: currentOrganization.id,
        })
        .maybeSingle();

      if (error) throw error;
      return data as {
        organization_id: string;
        billing_status: string;
        remaining_days: number;
        is_expired: boolean;
      } | null;
    },
    enabled: !!currentOrganization?.id,
  });

  useEffect(() => {
    if (!data) return;
    if (data.is_expired) return;
    if (data.billing_status === "paid") return;
    if (data.remaining_days < 0) return;

    const todayKey = new Date().toISOString().slice(0, 10);
    const storageKey = `trial_notice_${data.organization_id}_${todayKey}`;

    if (localStorage.getItem(storageKey) === "hidden") return;

    setOpen(true);
  }, [data]);

  const hideToday = () => {
    if (data?.organization_id) {
      const todayKey = new Date().toISOString().slice(0, 10);
      const storageKey = `trial_notice_${data.organization_id}_${todayKey}`;
      localStorage.setItem(storageKey, "hidden");
    }

    setOpen(false);
  };

  if (!data || data.is_expired || data.billing_status === "paid") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>무료체험 기간 안내</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p>
            현재 무료체험 기간이{" "}
            <span className="font-bold text-primary">{data.remaining_days}일</span>{" "}
            남았습니다.
          </p>
          <p className="text-muted-foreground">
            무료기간 종료 후에는 입금 확인 후 계속 이용할 수 있습니다.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={hideToday}>
            오늘 하루 보지 않기
          </Button>
          <Button onClick={() => setOpen(false)}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}