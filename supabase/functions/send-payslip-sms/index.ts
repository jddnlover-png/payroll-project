import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SOLAPI_API_KEY = Deno.env.get("SOLAPI_API_KEY");
const SOLAPI_API_SECRET = Deno.env.get("SOLAPI_API_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SmsRequest {
  organizationId: string;
  employeeName: string;
  employeePhone: string;
  employeeId: string;
  payrollRecordId: string;
  month: string;
  baseSalary: number;
  totalPayments: number;
  deductions: number;
  netSalary: number;
  companyName?: string;
  siteUrl?: string;
}

const formatCurrency = (amount: number) => new Intl.NumberFormat("ko-KR").format(amount);

const sanitizePhone = (phone: string): string | null => {
  const digits = phone.replace(/[^0-9]/g, "");
  if (/^01[016789]\d{7,8}$/.test(digits)) {
    return digits;
  }
  return null;
};

const generateHmacSha256 = async (key: string, message: string): Promise<string> => {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const generateSignature = async (apiKey: string, apiSecret: string): Promise<string> => {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID();
  const signature = await generateHmacSha256(apiSecret, date + salt);
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
  return new Response(null, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

  try {
    if (!SOLAPI_API_KEY || !SOLAPI_API_SECRET) {
      throw new Error("SOLAPI API keys are not configured");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    let body: SmsRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (
      !body.organizationId ||
      !body.employeeName ||
      !body.employeePhone ||
      !body.month ||
      !body.payrollRecordId ||
      !body.employeeId
    ) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const phone = sanitizePhone(body.employeePhone);
    if (!phone) {
      return new Response(JSON.stringify({ error: "Invalid phone number format" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const serviceClient = createClient(SUPABASE_URL!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: isAdmin } = await serviceClient.rpc("is_org_admin", {
      _user_id: user.id,
      _org_id: body.organizationId,
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const companyName = body.companyName || "급여관리시스템";
    let message: string;

    if (body.employeeId === "daily-worker") {
      message = `[${companyName}] ${body.month} 임금명세서

${body.employeeName}님의 임금내역입니다.

▶ 지급총액: ${formatCurrency(body.totalPayments)}원
▶ 공제합계: ${formatCurrency(body.deductions)}원
▶ 실수령액: ${formatCurrency(body.netSalary)}원`;
    } else {
      const { data: tokenData, error: tokenError } = await serviceClient
        .from("payslip_tokens")
        .insert({
          payroll_record_id: body.payrollRecordId,
          organization_id: body.organizationId,
          employee_id: body.employeeId,
        })
        .select("token")
        .single();

      if (tokenError || !tokenData) {
        console.error("Token creation failed:", tokenError);
        throw new Error("Failed to create payslip link");
      }

      const siteUrl = body.siteUrl || "https://ai-crafted-web-spark.lovable.app";
      const payslipUrl = `${siteUrl}/payslip?token=${tokenData.token}`;

      message = `[${companyName}] ${body.month} 급여명세서

${body.employeeName}님의 급여내역입니다.

▶ 총 지급액: ${formatCurrency(body.totalPayments)}원
▶ 총 공제액: ${formatCurrency(body.deductions)}원
▶ 실 수령액: ${formatCurrency(body.netSalary)}원

상세 명세서 확인
${payslipUrl}

※ 링크는 30일간 유효합니다.`;
    }

    console.log(`Sending SMS to ${phone} for employee ${body.employeeName}`);

    const messageType = message.length > 45 ? "LMS" : "SMS";
    const authorization = await generateSignature(SOLAPI_API_KEY, SOLAPI_API_SECRET);

    const senderNumber = Deno.env.get("SOLAPI_SENDER_NUMBER");
    if (!senderNumber) {
      throw new Error("SOLAPI_SENDER_NUMBER is not configured.");
    }

    const solapiResponse = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify({
        messages: [{ to: phone, from: senderNumber, type: messageType, text: message }],
      }),
    });

    const solapiResult = await solapiResponse.json();

    if (!solapiResponse.ok) {
      console.error("Solapi API error:", JSON.stringify(solapiResult));
      throw new Error(`Solapi API call failed [${solapiResponse.status}]: ${JSON.stringify(solapiResult)}`);
    }

    console.log("SMS sent successfully:", JSON.stringify(solapiResult));

    return new Response(JSON.stringify({ success: true, result: solapiResult }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error sending SMS:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
