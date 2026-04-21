import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LockStatus {
  isLocked: boolean;
  lockedAt: string | null;
}

export function useAttendanceLock(siteId: string, yearMonth: string) {
  const [lockStatus, setLockStatus] = useState<LockStatus>({
    isLocked: false,
    lockedAt: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const cacheRef = useRef<Record<string, LockStatus>>({});

  const getCacheKey = (site: string, ym: string) => `${site}__${ym}`;

  const fetchLockStatus = async () => {
    if (!siteId || !yearMonth) {
      setLockStatus({ isLocked: false, lockedAt: null });
      setIsLoading(false);
      return;
    }

    const cacheKey = getCacheKey(siteId, yearMonth);
    const cached = cacheRef.current[cacheKey];

    if (cached) {
      setLockStatus(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const { data, error } = await supabase
      .from("attendance_lock")
      .select("is_locked, locked_at")
      .eq("site_id", siteId)
      .eq("year_month", yearMonth)
      .maybeSingle();

    const nextStatus = {
      isLocked: data?.is_locked ?? false,
      lockedAt: data?.locked_at ?? null,
    };

    if (!error) {
      cacheRef.current[cacheKey] = nextStatus;
      setLockStatus(nextStatus);
    } else {
      setLockStatus({ isLocked: false, lockedAt: null });
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchLockStatus();
  }, [siteId, yearMonth]);

  const lockAttendance = async (): Promise<boolean> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const now = new Date().toISOString();

    const { error } = await supabase.from("attendance_lock").upsert(
      {
        site_id: siteId,
        year_month: yearMonth,
        is_locked: true,
        locked_at: now,
        locked_by: user.id,
        unlocked_at: null,
        unlocked_by: null,
      },
      { onConflict: "site_id,year_month" },
    );

    if (!error) {
      const nextStatus = {
        isLocked: true,
        lockedAt: now,
      };

      cacheRef.current[getCacheKey(siteId, yearMonth)] = nextStatus;
      setLockStatus(nextStatus);
      return true;
    }

    return false;
  };

  const unlockAttendance = async (): Promise<boolean> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from("attendance_lock").upsert(
      {
        site_id: siteId,
        year_month: yearMonth,
        is_locked: false,
        unlocked_at: new Date().toISOString(),
        unlocked_by: user.id,
      },
      { onConflict: "site_id,year_month" },
    );

    if (!error) {
      const nextStatus = {
        isLocked: false,
        lockedAt: null,
      };

      cacheRef.current[getCacheKey(siteId, yearMonth)] = nextStatus;
      setLockStatus(nextStatus);
      return true;
    }

    return false;
  };

  return { lockStatus, isLoading, lockAttendance, unlockAttendance };
}
