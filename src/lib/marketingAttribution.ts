import { supabase } from "@/integrations/supabase/client";

const CLICK_STORAGE_KEY = "payroll_marketing_click";
const PENDING_SIGNUP_KEY = "payroll_pending_signup_conversion";
const CLICK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type StoredClick = {
  clickId: string;
  expiresAt: number;
};

type ConversionType = "SIGNUP_COMPLETED" | "CORE_ACTION_COMPLETED";

function isValidClickId(value: string) {
  return /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

export function captureMarketingClick() {
  if (typeof window === "undefined") return;

  const clickId = new URLSearchParams(window.location.search).get("mk_click")?.trim();
  if (!clickId || !isValidClickId(clickId)) return;

  const stored: StoredClick = { clickId, expiresAt: Date.now() + CLICK_MAX_AGE_MS };
  try {
    window.localStorage.setItem(CLICK_STORAGE_KEY, JSON.stringify(stored));
    document.cookie = [
      `mk_click=${encodeURIComponent(clickId)}`,
      "path=/",
      `max-age=${Math.floor(CLICK_MAX_AGE_MS / 1000)}`,
      "SameSite=Lax",
      window.location.protocol === "https:" ? "Secure" : "",
    ].filter(Boolean).join("; ");
  } catch (error) {
    console.warn("마케팅 클릭 정보를 저장하지 못했습니다.", error);
  }
}

function getMarketingClickId() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CLICK_STORAGE_KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as Partial<StoredClick>;
    if (
      typeof stored.clickId !== "string" ||
      !isValidClickId(stored.clickId) ||
      typeof stored.expiresAt !== "number" ||
      stored.expiresAt <= Date.now()
    ) {
      window.localStorage.removeItem(CLICK_STORAGE_KEY);
      return null;
    }

    return stored.clickId;
  } catch {
    window.localStorage.removeItem(CLICK_STORAGE_KEY);
    return null;
  }
}

async function sendConversion(type: ConversionType) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Authenticated session is required");

  const response = await fetch("/api/marketing-event", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type, clickId: getMarketingClickId() }),
  });
  if (!response.ok) throw new Error(`Marketing conversion request failed: ${response.status}`);
}

export function queueSignupConversion() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PENDING_SIGNUP_KEY, new Date().toISOString());
}

export async function flushSignupConversion() {
  if (typeof window === "undefined" || !window.localStorage.getItem(PENDING_SIGNUP_KEY)) return;

  try {
    await sendConversion("SIGNUP_COMPLETED");
    window.localStorage.removeItem(PENDING_SIGNUP_KEY);
  } catch (error) {
    console.warn("가입 전환 이벤트를 나중에 다시 전송합니다.", error);
  }
}

export async function notifyCoreActionCompleted() {
  try {
    await sendConversion("CORE_ACTION_COMPLETED");
  } catch (error) {
    console.warn("핵심 기능 전환 이벤트 전송에 실패했습니다. 다음 계산 때 다시 시도합니다.", error);
  }
}
