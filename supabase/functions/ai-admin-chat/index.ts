import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  organizationId: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = claimsData.claims.sub;

    const body: ChatRequest = await req.json();
    const { messages, organizationId } = body;

    if (!organizationId || !messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const serviceClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const { data: isAdmin } = await serviceClient.rpc("is_org_admin", {
      _user_id: userId,
      _org_id: organizationId,
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 조직 정보
    const { data: orgData } = await serviceClient
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .single();

    // ⭐ 조직 설정 (계산 로직의 핵심 파라미터)
    const { data: orgSettings } = await serviceClient
      .from("organization_settings")
      .select("*")
      .eq("organization_id", organizationId)
      .single();

    // ⭐ 일용직 급여 설정
    const { data: dailySettings } = await serviceClient
      .from("daily_payroll_settings")
      .select("*")
      .eq("organization_id", organizationId)
      .single();

    // 직원 현황
    const { data: employees } = await serviceClient
      .from("employees")
      .select("id, name, department, position, employment_type, pay_type, base_salary, daily_rate, hourly_rate, is_active, settlement_type")
      .eq("organization_id", organizationId);

    const today = new Date();
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    const monthEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()}`;

    // 근태 현황 (상세)
    const { data: attendance } = await serviceClient
      .from("attendance_records")
      .select("employee_id, date, status, check_in, check_out, actual_work_hours, overtime_hours, night_hours, break_minutes, work_type")
      .eq("organization_id", organizationId)
      .gte("date", monthStart)
      .lte("date", monthEnd);

    // 정기 급여 (상세)
    const { data: payroll } = await serviceClient
      .from("payroll_records")
      .select("employee_id, period_year, period_month, base_salary, total_payments, total_deductions, net_salary, status, payment_items, deduction_items, working_days, overtime_hours")
      .eq("organization_id", organizationId)
      .eq("period_year", today.getFullYear())
      .eq("period_month", today.getMonth() + 1);

    // ⭐ 일용직 급여 (상세 - 계산 내역 포함)
    const { data: dailyPayroll } = await serviceClient
      .from("daily_payroll_records")
      .select("employee_id, work_date, work_minutes, overtime_minutes, night_minutes, base_daily_wage, overtime_pay, night_pay, total_wage, settlement_type, income_tax, local_income_tax, employment_insurance, national_pension, health_insurance, total_deductions, net_pay, status, stay_minutes, break_minutes, policy_deduction_minutes")
      .eq("organization_id", organizationId)
      .gte("work_date", monthStart)
      .lte("work_date", monthEnd);

    // 휴가 현황
    const { data: leaves } = await serviceClient
      .from("leave_records")
      .select("employee_id, leave_type, start_date, end_date, days, status")
      .eq("organization_id", organizationId)
      .gte("start_date", monthStart);

    // 통계 계산
    const activeEmployees = employees?.filter((e) => e.is_active) || [];
    const regularEmployees = activeEmployees.filter((e) => e.employment_type === "regular" || e.employment_type === "contract");
    const dailyWorkers = activeEmployees.filter((e) => e.employment_type === "daily" || e.employment_type === "freelancer");

    const deptDistribution: Record<string, number> = {};
    activeEmployees.forEach((e) => {
      const dept = e.department || "미분류";
      deptDistribution[dept] = (deptDistribution[dept] || 0) + 1;
    });

    // 직원별 일용직 급여 상세 (최근 10건)
    const employeeDailyPayrollDetails = dailyWorkers.slice(0, 10).map((emp) => {
      const records = dailyPayroll?.filter((p) => p.employee_id === emp.id) || [];
      if (records.length === 0) return null;
      
      const totalNetPay = records.reduce((sum, r) => sum + (r.net_pay || 0), 0);
      const totalWorkMinutes = records.reduce((sum, r) => sum + (r.work_minutes || 0), 0);
      const totalOvertimeMinutes = records.reduce((sum, r) => sum + (r.overtime_minutes || 0), 0);
      const totalNightMinutes = records.reduce((sum, r) => sum + (r.night_minutes || 0), 0);
      
      return {
        name: emp.name,
        payType: emp.pay_type,
        dailyRate: emp.daily_rate,
        hourlyRate: emp.hourly_rate,
        recordCount: records.length,
        totalWorkMinutes,
        totalOvertimeMinutes,
        totalNightMinutes,
        totalNetPay,
        recentRecords: records.slice(0, 5).map((r) => ({
          date: r.work_date,
          workMinutes: r.work_minutes,
          overtimeMinutes: r.overtime_minutes,
          nightMinutes: r.night_minutes,
          baseDailyWage: r.base_daily_wage,
          overtimePay: r.overtime_pay,
          nightPay: r.night_pay,
          totalWage: r.total_wage,
          totalDeductions: r.total_deductions,
          netPay: r.net_pay,
        })),
      };
    }).filter(Boolean);

    // 시스템 프롬프트 구성 (계산 로직 포함)
    const systemPrompt = `당신은 "${orgData?.name || "회사"}"의 HR/급여 관리 AI 어시스턴트입니다.
관리자의 질문에 친절하고 정확하게 답변하세요. **급여 계산 방식을 설명할 때는 아래 설정값과 공식을 근거로 구체적으로 설명하세요.**

---
## 📋 급여 계산 설정 (organization_settings)

### 근무 시간 설정
- 표준 근무시간: ${orgSettings?.standard_work_hours || 8}시간/일
- 출근 시간: ${orgSettings?.work_start_time || "09:00"}
- 퇴근 시간: ${orgSettings?.work_end_time || "17:00"}
- 점심 휴게: ${orgSettings?.break_start_time || "12:00"} ~ ${orgSettings?.break_end_time || "13:00"}

### 지각/조퇴 기준
- 지각 허용 시간: ${orgSettings?.late_threshold || 10}분
- 조기 퇴근 허용 시간: ${orgSettings?.checkout_threshold || 10}분

### 연장근로 설정
- 연장근로 배율: ${orgSettings?.overtime_multiplier || 1.5}배
- 연장 2시간 초과 시 추가 휴게: ${orgSettings?.overtime_break_2h || 30}분
- 연장 4시간 초과 시 추가 휴게: ${orgSettings?.overtime_break_4h || 60}분

### ⭐ 야간근로 설정 (핵심!)
- 야간근로 시작 시간: ${orgSettings?.night_shift_start_time || "22:00"}
- 야간근로 기본 배율: ${orgSettings?.night_shift_multiplier || 2.0}배
- 야간 휴게시간: ${orgSettings?.night_break_minutes || 30}분

### 야간 3단계 배율 (교대근무용)
- Tier 1: ${orgSettings?.shift_tier1_start || "22:00"} ~ ${orgSettings?.shift_tier1_end || "06:00"} → ${orgSettings?.shift_tier1_multiplier || 1.5}배
- Tier 2: ${orgSettings?.shift_tier2_start || "00:00"} ~ ${orgSettings?.shift_tier2_end || "04:00"} → ${orgSettings?.shift_tier2_multiplier || 2.0}배
- Tier 3: ${orgSettings?.shift_tier3_start || "04:00"} ~ ${orgSettings?.shift_tier3_end || "06:00"} → ${orgSettings?.shift_tier3_multiplier || 2.5}배

---
## 💰 일용직/시급제 급여 설정

- 일용직 세금 면제 한도: ${dailySettings?.tax_exempt_limit?.toLocaleString() || "150,000"}원/일
- 기본 정산 방식: ${dailySettings?.default_settlement_type === "business_income_3_3" ? "사업소득 3.3%" : "근로소득(일용직)"}
- 고용보험 적용: ${dailySettings?.apply_employment_insurance ? "예" : "아니오"} (${dailySettings?.employment_insurance_rate || 0.9}%)
- 국민연금 적용: ${dailySettings?.apply_national_pension ? "예" : "아니오"} (${dailySettings?.national_pension_rate || 4.5}%)
- 건강보험 적용: ${dailySettings?.apply_health_insurance ? "예" : "아니오"} (${dailySettings?.health_insurance_rate || 3.545}%)
- 월 ${dailySettings?.monthly_workday_warning || 8}일 이상 근무 시 4대보험 경고

---
## 📐 급여 계산 공식

### 1. 일당제 (daily)
\`\`\`
인정근무시간 = 체류시간 - 휴게시간 - 정책차감(지각/조퇴 등)
기본 일당 = 설정된 일당 금액
연장수당 = (연장근무분 ÷ 60) × (일당 ÷ 8) × 연장배율(${orgSettings?.overtime_multiplier || 1.5})
야간수당 = (야간근무분 ÷ 60) × (일당 ÷ 8) × 야간배율(0.5) ← 기본임금 외 추가분
총 지급액 = 기본 일당 + 연장수당 + 야간수당
\`\`\`

### 2. 시급제 (hourly)
\`\`\`
기본임금 = 인정근무시간(분) ÷ 60 × 시급
연장수당 = 연장근무시간(분) ÷ 60 × 시급 × (연장배율 - 1)
야간수당 = 야간근무시간(분) ÷ 60 × 시급 × 0.5 ← 야간은 기본임금 외 0.5배 추가
총 지급액 = 기본임금 + 연장수당 + 야간수당
\`\`\`

### 3. 야간수당 계산 상세
- **주간조 근무자가 야간(${orgSettings?.night_shift_start_time || "22:00"} 이후)까지 연장 근무한 경우:**
  - 해당 시간에 대해 기본임금 + 0.5배 가산
- **야간조(교대) 근무자:**
  - 전체 근무시간이 야간 시간대에 해당
  - 3단계 Tier별로 다른 배율 적용 가능

### 4. 세금 계산
- **근로소득(일용직):** 일당 ${dailySettings?.tax_exempt_limit?.toLocaleString() || "150,000"}원 초과분에 대해 6% 원천징수, 지방소득세 10% 추가
- **사업소득(3.3%):** 총 지급액 × 3%(소득세) + 0.3%(지방소득세)
- 모든 세금/보험료는 10원 단위 절삭

---
## 👥 현재 직원 현황 (${today.toLocaleDateString("ko-KR")} 기준)

- 총 재직: ${activeEmployees.length}명 (정규/계약: ${regularEmployees.length}명, 일용직/프리랜서: ${dailyWorkers.length}명)
- 부서별: ${Object.entries(deptDistribution).map(([k, v]) => `${k} ${v}명`).join(", ")}

### 직원 목록
${activeEmployees.slice(0, 20).map((e) => `- ${e.name} (${e.department || "미분류"}, ${e.employment_type === "regular" ? "정규직" : e.employment_type === "contract" ? "계약직" : e.employment_type === "daily" ? "일용직" : "프리랜서"}, ${e.pay_type === "monthly" ? `월급 ${(e.base_salary || 0).toLocaleString()}원` : e.pay_type === "daily" ? `일당 ${(e.daily_rate || 0).toLocaleString()}원` : `시급 ${(e.hourly_rate || 0).toLocaleString()}원`})`).join("\n")}

---
## 📊 이번 달(${today.getMonth() + 1}월) 급여 상세

### 일용직 급여 상세 (직원별)
${employeeDailyPayrollDetails.length > 0 ? employeeDailyPayrollDetails.map((d: any) => `
**${d.name}** (${d.payType === "daily" ? `일당 ${d.dailyRate?.toLocaleString()}원` : `시급 ${d.hourlyRate?.toLocaleString()}원`})
- 총 근무: ${d.recordCount}일, ${Math.floor(d.totalWorkMinutes / 60)}시간 ${d.totalWorkMinutes % 60}분
- 연장: ${Math.floor(d.totalOvertimeMinutes / 60)}시간 ${d.totalOvertimeMinutes % 60}분
- 야간: ${Math.floor(d.totalNightMinutes / 60)}시간 ${d.totalNightMinutes % 60}분
- 총 실지급: ${d.totalNetPay.toLocaleString()}원
- 최근 기록:
${d.recentRecords.map((r: any) => `  · ${r.date}: 근무 ${Math.floor(r.workMinutes / 60)}h${r.workMinutes % 60}m, 연장 ${r.overtimeMinutes}분, 야간 ${r.nightMinutes}분 → 일당 ${r.baseDailyWage.toLocaleString()}원 + 연장 ${r.overtimePay.toLocaleString()}원 + 야간 ${r.nightPay.toLocaleString()}원 = 총 ${r.totalWage.toLocaleString()}원 - 공제 ${r.totalDeductions.toLocaleString()}원 = **${r.netPay.toLocaleString()}원**`).join("\n")}
`).join("\n") : "일용직 급여 기록 없음"}

### 정기 급여 요약
- 총 대상: ${payroll?.length || 0}명
- 총 지급 예정: ${payroll?.reduce((sum, p) => sum + (p.net_salary || 0), 0).toLocaleString()}원
- 확정: ${payroll?.filter((p) => p.status === "confirmed").length || 0}건

### 근태 현황
- 출근: ${attendance?.filter((a) => a.status === "present").length || 0}건
- 지각: ${attendance?.filter((a) => a.status === "late").length || 0}건
- 결근: ${attendance?.filter((a) => a.status === "absent").length || 0}건
- 휴가: ${attendance?.filter((a) => a.status === "leave").length || 0}건

---
## 🎯 응답 가이드라인

1. **"왜 이렇게 나왔어?"** 류의 질문에는 위 계산 공식과 설정값을 근거로 구체적인 계산 과정을 설명하세요.
2. 예: "야간수당은 ${orgSettings?.night_shift_start_time || "22:00"} 이후 근무시간에 대해 기본임금의 0.5배를 추가 지급합니다. 홍길동님은 야간 120분 근무했으므로..."
3. 금액은 원화로 표시하고 천 단위 구분자를 사용합니다.
4. 특정 직원에 대한 질문이면 해당 직원의 상세 데이터를 찾아 답변합니다.
5. 가능하면 계산 과정을 단계별로 보여줍니다.
6. 한국어로만 답변합니다.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. 잠시 후 다시 시도해주세요." }),
          { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI 사용량 초과. 관리자에게 문의하세요." }),
          { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI 서비스 오류가 발생했습니다." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(aiResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error: unknown) {
    console.error("AI chat error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
