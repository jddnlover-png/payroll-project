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
      return new Response(JSON.stringify({ error: "Token is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokenData, error: tokenError } = await supabase
      .from("payslip_tokens")
      .select("*")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (tokenError || !tokenData) {
      return new Response(JSON.stringify({ error: "Invalid or expired link" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("name, business_number, representative, address, phone")
      .eq("id", tokenData.organization_id)
      .single();

    if (tokenData.payslip_type === "daily") {
  const year = tokenData.period_year;
  const month = tokenData.period_month;
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  let query = supabase
    .from("daily_attendance")
    .select(`
      *,
      site:construction_sites(site_name)
    `)
    .eq("organization_id", tokenData.organization_id)
    .gte("work_date", startDate)
    .lte("work_date", endDate);

  if (tokenData.site_id && tokenData.site_id !== "all") {
    query = query.eq("site_id", tokenData.site_id);
  }

  const { data: rows, error: rowsError } = await query;

  if (rowsError) {
    return new Response(JSON.stringify({ error: "Daily attendance records not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const workerRows = (rows || []).filter((r: any) => {
    const key = r.ssn_masked
      ? `SSN:${r.ssn_masked}`
      : r.phone
        ? `PHONE:${String(r.phone).replace(/[^0-9]/g, "")}`
        : `NAME:${String(r.worker_name || "").trim()}`;

    return key === tokenData.daily_worker_key;
  });

  if (workerRows.length === 0) {
    return new Response(JSON.stringify({ error: "Daily worker payslip not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const totalPayments = workerRows.reduce((sum: number, r: any) => {
    return (
      sum +
      Number(r.calculated_pay ?? 0) +
      Number(r.meal_allowance_amount ?? 0) +
      Number(r.vehicle_allowance_amount ?? 0) +
      Number(r.extra_non_taxable_allowance_amount ?? 0)
    );
  }, 0);

  const totalDeductions = workerRows.reduce(
    (sum: number, r: any) => sum + Number(r.total_deductions ?? 0),
    0,
  );

  const payroll = {
    worker_name: workerRows[0].worker_name,
    ssn_masked: workerRows[0].ssn_masked,
    phone: workerRows[0].phone,
    period_year: year,
    period_month: month,
    start_date: startDate,
    end_date: endDate,
    work_days: new Set(workerRows.map((r: any) => r.work_date)).size,
    total_payments: totalPayments,
    total_deductions: totalDeductions,
    net_pay: totalPayments - totalDeductions,
    rows: workerRows,
  };

  return new Response(
    JSON.stringify({
      payslipType: "daily",
      payroll,
      organization: org,
    }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
  );
}

    const { data: payroll, error: payrollError } = await supabase
      .from("payroll_records")
      .select(`
        *,
        employee:employees(name, employee_number, department, position, bank_name, account_number, employment_type)
      `)
      .eq("id", tokenData.payroll_record_id)
      .single();

    if (payrollError || !payroll) {
      return new Response(JSON.stringify({ error: "Payroll record not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(
      JSON.stringify({
        payslipType: "monthly",
        payroll,
        organization: org,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error("Error fetching payslip:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});