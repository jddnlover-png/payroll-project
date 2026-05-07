import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const {
      organizationId,
      employeeName,
      employeeEmail,
      month,
      html,
      companyName,
    } = body;

    // 기본 검증
    if (!organizationId) throw new Error("organizationId 없음");
    if (!employeeName) throw new Error("employeeName 없음");
    if (!employeeEmail) throw new Error("employeeEmail 없음");
    if (!month) throw new Error("month 없음");
    if (!html) throw new Error("html 없음");

    // 이메일 발송
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${companyName || "급여관리시스템"} <onboarding@resend.dev>`,
        to: [employeeEmail],
        subject: `[${month}] 급여명세서 - ${employeeName}님`,
        html: html,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend error:", result);
      throw new Error(result.message || "이메일 발송 실패");
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (err: any) {
    console.error("send-document-email error:", err);

    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});