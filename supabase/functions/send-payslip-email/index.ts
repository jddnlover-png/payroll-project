import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PaySlipEmailRequest {
  organizationId: string;
  employeeName: string;
  employeeEmail: string;
  month: string;
  employeeNumber: string;
  department: string;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  overtimeHours: number;
  baseSalary: number;
  overtime: number;
  bonus: number;
  deductions: number;
  netSalary: number;
  companyName?: string;
  companyLogoUrl?: string;
}

// Input validation functions
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
};

const isValidUrl = (url: string): boolean => {
  if (!url) return true; // Optional field
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const sanitizeString = (str: string, maxLength: number = 100): string => {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, maxLength)
    .replace(/[<>&"']/g, (char) => {
      const entities: Record<string, string> = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return entities[char] || char;
    });
};

const isValidNumber = (num: unknown, min: number = 0, max: number = 999999999): boolean => {
  return typeof num === 'number' && !isNaN(num) && num >= min && num <= max;
};

const validatePaySlipRequest = (data: unknown): { valid: boolean; error?: string; data?: PaySlipEmailRequest } => {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const req = data as Record<string, unknown>;

  // Required organizationId
  if (!req.organizationId || typeof req.organizationId !== 'string' || req.organizationId.length > 50) {
    return { valid: false, error: 'Invalid organizationId' };
  }

  // Required string validations
  if (!req.employeeName || typeof req.employeeName !== 'string' || req.employeeName.length > 100) {
    return { valid: false, error: 'Invalid employeeName' };
  }
  if (!req.employeeEmail || typeof req.employeeEmail !== 'string' || !isValidEmail(req.employeeEmail)) {
    return { valid: false, error: 'Invalid employeeEmail format' };
  }
  if (!req.month || typeof req.month !== 'string' || !/^\d{4}-\d{2}$/.test(req.month)) {
    return { valid: false, error: 'Invalid month format (expected YYYY-MM)' };
  }
  if (!req.employeeNumber || typeof req.employeeNumber !== 'string' || req.employeeNumber.length > 50) {
    return { valid: false, error: 'Invalid employeeNumber' };
  }
  if (!req.department || typeof req.department !== 'string' || req.department.length > 100) {
    return { valid: false, error: 'Invalid department' };
  }

  // Number validations
  const numericFields = ['presentDays', 'lateDays', 'absentDays', 'leaveDays', 'overtimeHours', 
                          'baseSalary', 'overtime', 'bonus', 'deductions', 'netSalary'];
  for (const field of numericFields) {
    if (!isValidNumber(req[field])) {
      return { valid: false, error: `Invalid ${field}` };
    }
  }

  // Optional field validations
  if (req.companyName && (typeof req.companyName !== 'string' || req.companyName.length > 100)) {
    return { valid: false, error: 'Invalid companyName' };
  }
  if (req.companyLogoUrl && !isValidUrl(req.companyLogoUrl as string)) {
    return { valid: false, error: 'Invalid companyLogoUrl' };
  }

  return { 
    valid: true, 
    data: {
      organizationId: req.organizationId as string,
      employeeName: sanitizeString(req.employeeName as string),
      employeeEmail: (req.employeeEmail as string).trim().toLowerCase(),
      month: req.month as string,
      employeeNumber: sanitizeString(req.employeeNumber as string, 50),
      department: sanitizeString(req.department as string),
      presentDays: req.presentDays as number,
      lateDays: req.lateDays as number,
      absentDays: req.absentDays as number,
      leaveDays: req.leaveDays as number,
      overtimeHours: req.overtimeHours as number,
      baseSalary: req.baseSalary as number,
      overtime: req.overtime as number,
      bonus: req.bonus as number,
      deductions: req.deductions as number,
      netSalary: req.netSalary as number,
      companyName: req.companyName ? sanitizeString(req.companyName as string) : undefined,
      companyLogoUrl: req.companyLogoUrl as string | undefined,
    }
  };
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing or invalid authorization header' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(
      SUPABASE_URL!,
      SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error("Auth error:", claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log("Authenticated user:", userId);

    // Parse and validate request body first to get organizationId
    let rawData: unknown;
    try {
      rawData = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const validation = validatePaySlipRequest(rawData);
    if (!validation.valid || !validation.data) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const data = validation.data;

    // Authorization: Check if user is an admin of the organization
    const serviceClient = createClient(
      SUPABASE_URL!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: isAdmin } = await serviceClient.rpc('is_org_admin', {
      _user_id: userId,
      _org_id: data.organizationId,
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Authorized admin sending payslip email to:", data.employeeEmail);

    const totalPayment = data.baseSalary + data.overtime + data.bonus;
    const companyName = data.companyName || '급여관리시스템';
    const logoHtml = data.companyLogoUrl 
      ? `<img src="${encodeURI(data.companyLogoUrl)}" alt="${companyName}" style="max-height: 50px; margin-bottom: 15px;" />`
      : '';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              padding: 40px 20px;
              min-height: 100vh;
            }
            .wrapper {
              max-width: 600px;
              margin: 0 auto;
            }
            .header {
              background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
              color: white;
              padding: 40px 30px;
              border-radius: 20px 20px 0 0;
              text-align: center;
            }
            .logo {
              font-size: 14px;
              letter-spacing: 3px;
              text-transform: uppercase;
              opacity: 0.8;
              margin-bottom: 15px;
            }
            .header h1 {
              font-size: 32px;
              font-weight: 700;
              margin-bottom: 8px;
            }
            .header .month {
              font-size: 18px;
              opacity: 0.9;
              background: rgba(255,255,255,0.15);
              display: inline-block;
              padding: 8px 20px;
              border-radius: 20px;
              margin-top: 10px;
            }
            .container { 
              background-color: #ffffff; 
              padding: 0;
              border-radius: 0 0 20px 20px;
              box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
              overflow: hidden;
            }
            .employee-info {
              background: linear-gradient(to right, #f8fafc, #f1f5f9);
              padding: 25px 30px;
              display: flex;
              flex-wrap: wrap;
              gap: 20px;
              border-bottom: 1px solid #e2e8f0;
            }
            .employee-item {
              flex: 1;
              min-width: 120px;
            }
            .employee-item .label {
              font-size: 11px;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 4px;
            }
            .employee-item .value {
              font-size: 16px;
              font-weight: 600;
              color: #1e293b;
            }
            .content {
              padding: 30px;
            }
            .section { 
              margin-bottom: 25px; 
            }
            .section:last-child {
              margin-bottom: 0;
            }
            .section-header {
              display: flex;
              align-items: center;
              margin-bottom: 15px;
            }
            .section-icon {
              width: 36px;
              height: 36px;
              border-radius: 10px;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-right: 12px;
              font-size: 18px;
            }
            .section-icon.attendance { background: linear-gradient(135deg, #06b6d4, #0891b2); }
            .section-icon.payment { background: linear-gradient(135deg, #10b981, #059669); }
            .section-icon.deduction { background: linear-gradient(135deg, #f43f5e, #e11d48); }
            .section-title { 
              font-weight: 700; 
              font-size: 16px;
              color: #1e293b;
            }
            .card {
              background: #f8fafc;
              border-radius: 12px;
              padding: 20px;
            }
            .row { 
              display: flex; 
              justify-content: space-between; 
              align-items: center;
              padding: 10px 0; 
              border-bottom: 1px solid #e2e8f0; 
            }
            .row:last-child { border-bottom: none; }
            .label { 
              color: #64748b; 
              font-size: 14px;
            }
            .value { 
              font-weight: 600; 
              color: #1e293b; 
              font-size: 15px;
            }
            .positive { color: #059669; }
            .negative { color: #dc2626; }
            .divider {
              height: 2px;
              background: linear-gradient(to right, #e2e8f0, #cbd5e1, #e2e8f0);
              margin: 15px 0;
            }
            .subtotal-row {
              display: flex;
              justify-content: space-between;
              padding: 12px 0 0 0;
            }
            .subtotal-row .label {
              font-weight: 600;
              color: #374151;
            }
            .subtotal-row .value {
              font-size: 17px;
              font-weight: 700;
            }
            .total-section { 
              background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
              color: white; 
              padding: 30px; 
              text-align: center; 
              margin: 30px -30px -30px -30px;
            }
            .total-label { 
              font-size: 14px; 
              opacity: 0.9;
              letter-spacing: 2px;
              text-transform: uppercase;
              margin-bottom: 8px;
            }
            .total-value { 
              font-size: 36px; 
              font-weight: 800; 
              letter-spacing: -1px;
            }
            .total-note {
              font-size: 13px;
              opacity: 0.7;
              margin-top: 12px;
            }
            .footer { 
              text-align: center; 
              padding: 25px;
              color: #94a3b8; 
              font-size: 12px; 
              line-height: 1.6;
            }
            .badge {
              display: inline-block;
              padding: 4px 10px;
              border-radius: 6px;
              font-size: 13px;
              font-weight: 600;
            }
            .badge-success { background: #d1fae5; color: #065f46; }
            .badge-danger { background: #fee2e2; color: #991b1b; }
            .badge-warning { background: #fef3c7; color: #92400e; }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="header">
              ${logoHtml}
              <div class="logo">${companyName}</div>
              <h1>💼 급여명세서</h1>
              <div class="month">${data.month}</div>
            </div>
            
            <div class="container">
              <div class="employee-info">
                <div class="employee-item">
                  <div class="label">성명</div>
                  <div class="value">${data.employeeName}</div>
                </div>
                <div class="employee-item">
                  <div class="label">사원번호</div>
                  <div class="value">${data.employeeNumber}</div>
                </div>
                <div class="employee-item">
                  <div class="label">부서</div>
                  <div class="value">${data.department}</div>
                </div>
              </div>

              <div class="content">
                <div class="section">
                  <div class="section-header">
                    <div class="section-icon attendance">📊</div>
                    <div class="section-title">근태 현황</div>
                  </div>
                  <div class="card">
                    <div class="row">
                      <span class="label">출근일수</span>
                      <span class="badge badge-success">${data.presentDays}일</span>
                    </div>
                    <div class="row">
                      <span class="label">지각일수</span>
                      <span class="badge ${data.lateDays > 0 ? 'badge-warning' : 'badge-success'}">${data.lateDays}일</span>
                    </div>
                    <div class="row">
                      <span class="label">결근일수</span>
                      <span class="badge ${data.absentDays > 0 ? 'badge-danger' : 'badge-success'}">${data.absentDays}일</span>
                    </div>
                    <div class="row">
                      <span class="label">휴가일수</span>
                      <span class="badge badge-success">${data.leaveDays}일</span>
                    </div>
                    <div class="row">
                      <span class="label">연장근무</span>
                      <span class="badge ${data.overtimeHours > 0 ? 'badge-warning' : 'badge-success'}">${data.overtimeHours}시간</span>
                    </div>
                  </div>
                </div>

                <div class="section">
                  <div class="section-header">
                    <div class="section-icon payment">💰</div>
                    <div class="section-title">지급 내역</div>
                  </div>
                  <div class="card">
                    <div class="row">
                      <span class="label">기본급</span>
                      <span class="value">${formatCurrency(data.baseSalary)}</span>
                    </div>
                    <div class="row">
                      <span class="label">연장수당</span>
                      <span class="value positive">+${formatCurrency(data.overtime)}</span>
                    </div>
                    <div class="row">
                      <span class="label">상여금</span>
                      <span class="value positive">+${formatCurrency(data.bonus)}</span>
                    </div>
                    <div class="divider"></div>
                    <div class="subtotal-row">
                      <span class="label">지급액 합계</span>
                      <span class="value positive">${formatCurrency(totalPayment)}</span>
                    </div>
                  </div>
                </div>

                <div class="section">
                  <div class="section-header">
                    <div class="section-icon deduction">📋</div>
                    <div class="section-title">공제 내역</div>
                  </div>
                  <div class="card">
                    <div class="row">
                      <span class="label">4대보험 및 기타공제</span>
                      <span class="value negative">-${formatCurrency(data.deductions)}</span>
                    </div>
                    <div class="divider"></div>
                    <div class="subtotal-row">
                      <span class="label">공제액 합계</span>
                      <span class="value negative">-${formatCurrency(data.deductions)}</span>
                    </div>
                  </div>
                </div>

                <div class="total-section">
                  <div class="total-label">실지급액</div>
                  <div class="total-value">${formatCurrency(data.netSalary)}</div>
                  <div class="total-note">위 금액을 ${data.month} 급여로 지급합니다.</div>
                </div>
              </div>
            </div>
            
            <div class="footer">
              본 명세서는 ${data.month} 귀속 급여입니다.<br>
              문의사항은 인사팀으로 연락해 주세요.
            </div>
          </div>
        </body>
      </html>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "급여관리시스템 <onboarding@resend.dev>",
        to: [data.employeeEmail],
        subject: `[${data.month}] 급여명세서 - ${data.employeeName}님`,
        html: emailHtml,
      }),
    });

    const emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend API error:", emailResult);
      throw new Error(emailResult.message || "Failed to send email");
    }

    console.log("Email sent successfully:", emailResult);

    return new Response(JSON.stringify({ success: true, data: emailResult }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in send-payslip-email function:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);