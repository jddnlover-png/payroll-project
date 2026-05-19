import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get token record safely through RPC
    const { data: tokenData, error: tokenError } = await supabase
      .rpc("get_payslip_by_token", {
        p_token: token,
      })
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired link" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get payroll record with employee info
    const { data: payroll, error: payrollError } = await supabase
      .from("payroll_records")
      .select(`
        *,
        employee:employees(name, employee_number, department, position, bank_name, account_number, employment_type)
      `)
      .eq("id", tokenData.payroll_record_id)
      .single();

    if (payrollError || !payroll) {
      return new Response(
        JSON.stringify({ error: "Payroll record not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get organization info
    const { data: org } = await supabase
      .from("organizations")
      .select("name, business_number, representative, address, phone")
      .eq("id", tokenData.organization_id)
      .single();

    return new Response(
      JSON.stringify({
        payroll,
        organization: org,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error fetching payslip:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});