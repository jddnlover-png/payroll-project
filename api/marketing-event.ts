const corsHeaders = {
  "Access-Control-Allow-Origin": "https://payroll-project-rho.vercel.app",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const acceptedTypes = new Set(["SIGNUP_COMPLETED", "CORE_ACTION_COMPLETED"]);
const defaultSupabaseUrl = "https://ysmfcijkhmgfuhzrxwbg.supabase.co";
const defaultSupabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzbWZjaWpraG1nZnVoenJ4d2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NDY2NzYsImV4cCI6MjA5MjMyMjY3Nn0.v-6Vrf16hZmzSTep2NNoUWF6QZjZwh97j5FaDVRyxzg";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function postWithRetry(url: string, apiKey: string, payload: unknown) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`Marketing API returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }

  throw lastError ?? new Error("Marketing API request failed");
}

export const config = { runtime: "edge" };

export default async function handler(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  const marketingApiKey = process.env.MARKETING_EVENT_API_KEY;
  const marketingApiUrl = process.env.MARKETING_EVENT_API_URL ?? "https://marketing-platform-ivory.vercel.app/api/v1/events";
  const supabaseUrl = process.env.SUPABASE_URL ?? defaultSupabaseUrl;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? defaultSupabaseAnonKey;

  if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  if (!marketingApiKey) return json({ error: "Server integration is not configured" }, 503);

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: supabaseAnonKey },
  });
  if (!userResponse.ok) return json({ error: "Unauthorized" }, 401);
  const user = await userResponse.json() as { id?: unknown };
  if (typeof user.id !== "string" || !user.id) return json({ error: "Unauthorized" }, 401);

  let body: { type?: unknown; clickId?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (typeof body.type !== "string" || !acceptedTypes.has(body.type)) {
    return json({ error: "Unsupported conversion type" }, 400);
  }
  if (body.clickId != null && (typeof body.clickId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(body.clickId))) {
    return json({ error: "Invalid clickId" }, 400);
  }

  const eventPrefix = body.type === "SIGNUP_COMPLETED" ? "signup-completed" : "core-action";
  const upstream = await postWithRetry(marketingApiUrl, marketingApiKey, {
    eventId: `${eventPrefix}:${user.id}`,
    type: body.type,
    externalUserId: user.id,
    clickId: body.clickId ?? undefined,
    metadata: {
      source: "payroll-app",
      ...(body.type === "CORE_ACTION_COMPLETED" ? { action: "first_payroll_calculation_completed" } : {}),
    },
  });

  const upstreamBody = await upstream.json().catch(() => ({}));
  return json(upstreamBody, upstream.status);
}
