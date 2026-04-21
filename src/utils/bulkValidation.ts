/**
 * 복수 인부 일괄입력 계산/검증 엔진
 * - dailyWorkerCalculation.ts 를 수정하지 않고 독립 구현
 * - STEP 1~8 안전장치 적용
 */

import { classifyDayType, calculateDailyAttendancePayroll } from "@/utils/dailyWorkerCalculation";

// ── 타입 ──────────────────────────────────────────

export type BulkRowStatus = "pending" | "valid" | "warning" | "duplicate" | "error";

export interface BulkRow {
  id: string; // 클라이언트 임시 ID
  workerName: string;
  jobType: string;
  ssnInput: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workType: "fixed" | "hourly";
  wage: number; // 일당 or 시급
  // 계산 결과
  workMinutes: number;
  nightMinutes: number;
  overtimeMinutes: number;
  calculatedPay: number;
  regularPay: number;
  overtimePay: number;
  nightPay: number;
  regularHours: number;
  overtimeHours: number;
  nightHours: number;
  holidayHours: number;
  holidayPay: number;
  dayType: "workday" | "weekly_holiday" | "unpaid_holiday" | "offday";
  // 비과세 항목
  mealAllowance: number;
  vehicleAllowance: number;
  extraNonTaxableAllowance: number;
  extraNonTaxableName: string;
  // 상태
  status: BulkRowStatus;
  message: string;
  fingerprint: string;
  // SSN
  ssnMasked: string | null;
  ssnLast4: string | null;
  // 연락처
  phone: string | null;
}

// ── 유틸 ──────────────────────────────────────────

export function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + (m || 0);
}

function normalizeTime(t: string): string {
  const clean = t.replace(/\s/g, "");
  const m = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  return `${String(parseInt(m[1])).padStart(2, "0")}:${m[2]}`;
}

function adjustEnd(startMin: number, endMin: number): number {
  return endMin <= startMin ? endMin + 1440 : endMin;
}

/** 22:00~06:00 (=22:00~30:00) 구간 교집합 방식 야간시간 계산 */
function calcNightMinutes(startMin: number, endMin: number): number {
  const nightStart = 22 * 60; // 1320
  const nightEnd = 30 * 60; // 1800

  let total = 0;

  // 첫 번째 야간 구간: 22:00 ~ 30:00
  const overlapStart1 = Math.max(startMin, nightStart);
  const overlapEnd1 = Math.min(endMin, nightEnd);
  if (overlapEnd1 > overlapStart1) {
    total += overlapEnd1 - overlapStart1;
  }

  // 두 번째 야간 구간(전일 야간이 넘어온 경우): -120 ~ 360 (= 전일 22:00 ~ 당일 06:00)
  // 출근이 06:00 이전인 경우
  if (startMin < 360) {
    const overlapStart2 = Math.max(startMin, 0);
    const overlapEnd2 = Math.min(endMin, 360);
    if (overlapEnd2 > overlapStart2) {
      total += overlapEnd2 - overlapStart2;
    }
  }

  return total;
}

// ── SHA-256 fingerprint ──────────────────────────

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function generateBulkFingerprint(
  siteId: string,
  identityKey: string,
  workDate: string,
  startTime: string,
  endTime: string,
  calculatedPay: number,
): Promise<string> {
  const st = normalizeTime(startTime);
  const et = normalizeTime(endTime);
  const raw = `${siteId}|${identityKey}|${workDate}|${st}|${et}|0|${calculatedPay}`;
  return sha256(raw);
}

// ── SSN 처리 ─────────────────────────────────────

export function processSsn(ssnInput: string): { masked: string | null; last4: string | null } {
  const clean = ssnInput.replace(/[^0-9]/g, "");
  if (clean.length >= 7) {
    return {
      masked: `${clean.substring(0, 6)}-${clean.charAt(6)}******`,
      last4: clean.slice(-4),
    };
  }
  return { masked: null, last4: null };
}

// ── 지급액 계산 ──────────────────────────────────

interface PayCalcInput {
  workType: "fixed" | "hourly";
  wage: number;
  workMinutes: number;
  nightMinutes: number;
  isOver5: boolean;
  startMin?: number;
  endMin?: number;
  breakMinutes?: number;
}

interface PayCalcResult {
  calculatedPay: number;
  regularPay: number;
  overtimePay: number;
  nightPay: number;
  regularHours: number;
  overtimeHours: number;
  nightHours: number;
  overtimeMinutes: number;
}

function calculatePay(input: PayCalcInput): PayCalcResult {
  const { workType, wage, workMinutes, nightMinutes, isOver5 } = input;
  const standardMin = 8 * 60; // 480

  // 총 근무시간 8시간 초과 기준으로 정규/연장 분리
  const totalWorkMin = workMinutes;
  const regularMin = Math.min(totalWorkMin, standardMin);
  const overtimeMin = Math.max(0, totalWorkMin - standardMin);

  if (workType === "fixed") {
    // 일급제: 입력 금액 그대로 + 연장/야간 가산
    const regularPay = wage;
    let overtimePay = 0;
    let nightPay = 0;

    if (isOver5) {
      const hourlyEquiv = wage / 8;
      overtimePay = Math.round(hourlyEquiv * (overtimeMin / 60) * 0.5); // 0.5 추가 가산
      nightPay = Math.round(hourlyEquiv * (nightMinutes / 60) * 0.5); // 0.5 추가 가산
    }

    return {
      calculatedPay: regularPay + overtimePay + nightPay,
      regularPay,
      overtimePay,
      nightPay,
      regularHours: Math.round((regularMin / 60) * 100) / 100,
      overtimeHours: Math.round((overtimeMin / 60) * 100) / 100,
      nightHours: Math.round((nightMinutes / 60) * 100) / 100,
      overtimeMinutes: overtimeMin,
    };
  } else {
    // 시급제
    const regularPay = Math.round(wage * (regularMin / 60));
    let overtimePay = 0;
    let nightPay = 0;

    if (isOver5) {
      overtimePay = Math.round(wage * (overtimeMin / 60) * 1.5);
      nightPay = Math.round(wage * (nightMinutes / 60) * 0.5);
    } else {
      overtimePay = Math.round(wage * (overtimeMin / 60));
    }

    return {
      calculatedPay: regularPay + overtimePay + nightPay,
      regularPay,
      overtimePay,
      nightPay,
      regularHours: Math.round((regularMin / 60) * 100) / 100,
      overtimeHours: Math.round((overtimeMin / 60) * 100) / 100,
      nightHours: Math.round((nightMinutes / 60) * 100) / 100,
      overtimeMinutes: overtimeMin,
    };
  }
}

// ── 일괄입력 시급제 즉시 계산 (bulk 전용) ────────

export function calculateBulkHourlyPay(
  row: Pick<BulkRow, "startTime" | "endTime" | "breakMinutes" | "wage">,
  isOver5: boolean,
): PayCalcResult & { workMinutes: number; nightMinutes: number } {
  const startMin = toMinutes(row.startTime);
  let endMin = toMinutes(row.endTime);
  endMin = adjustEnd(startMin, endMin);
  const grossMin = endMin - startMin;
  const workMin = Math.max(0, grossMin - row.breakMinutes);
  let nightMin = calcNightMinutes(startMin, endMin);
  if (nightMin > workMin) nightMin = workMin;

  const payResult = calculatePay({
    workType: "hourly",
    wage: row.wage,
    workMinutes: workMin,
    nightMinutes: nightMin,
    isOver5,
    startMin,
    endMin,
    breakMinutes: row.breakMinutes,
  });

  return { ...payResult, workMinutes: workMin, nightMinutes: nightMin };
}

// ── Snapshot 생성 ────────────────────────────────

export function createBulkSnapshot(params: {
  workType: string;
  wage: number;
  calculatedPay: number;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workMinutes: number;
  nightMinutes: number;
  overtimeMinutes: number;
  regularPay: number;
  overtimePay: number;
  nightPay: number;
  holidayHours: number;
  holidayPay: number;
  dayType: "workday" | "weekly_holiday" | "unpaid_holiday" | "offday";
  nightStart: string;
  nightEnd: string;
  overtimeMultiplier: number;
  nightMultiplier: number;
  isOver5: boolean;
}) {
  return {
    ...params,
    calculatedAt: new Date().toISOString(),
    source: "bulk_input",
    version: "2.0",
  };
}

export async function hashSnapshot(snapshot: object): Promise<string> {
  return sha256(JSON.stringify(snapshot));
}

// ── 행 검증 (STEP 1~8) ──────────────────────────

export interface ValidateRowResult {
  status: BulkRowStatus;
  message: string;
  workMinutes: number;
  nightMinutes: number;
  overtimeMinutes: number;
  payResult: PayCalcResult | null;
}

export function validateRow(row: BulkRow, isOver5: boolean): ValidateRowResult {
  const fail = (msg: string): ValidateRowResult => ({
    status: "error",
    message: msg,
    workMinutes: 0,
    nightMinutes: 0,
    overtimeMinutes: 0,
    payResult: null,
  });

  // STEP 1: 인부명 비어있으면 오류
  if (!row.workerName.trim()) {
    return fail("인부명을 입력하세요");
  }

  // STEP 2: 익일 퇴근 자동 처리
  const startMin = toMinutes(row.startTime);
  let endMin = toMinutes(row.endTime);
  endMin = adjustEnd(startMin, endMin);

  // STEP 3: 실근무시간 계산
  const grossMin = endMin - startMin;
  const workMin = grossMin - row.breakMinutes;

  // STEP 4: 휴게시간 검사
  if (row.breakMinutes < 0) return fail("휴게시간은 0 이상이어야 합니다");
  if (row.breakMinutes > 720) return fail("휴게시간이 12시간을 초과합니다");
  if (row.breakMinutes >= grossMin) return fail("휴게시간이 근무시간 이상입니다");

  // STEP 5: 24시간 초과 검사
  let warning = "";
  if (workMin >= 1440) return fail("실근무시간이 24시간을 초과합니다");
  if (workMin >= 1200) warning = "실근무시간 20시간 이상 — 입력값을 확인하세요";
  else if (workMin >= 960) warning = "실근무시간 16시간 이상 — 입력값을 확인하세요";

  // STEP 6: 최종 방어
  if (workMin <= 0) return fail("실근무시간이 0분 이하입니다");

  // STEP 2.5 (after STEP 6): 야간시간 계산
  let nightMin = calcNightMinutes(startMin, endMin);
  if (nightMin > workMin) nightMin = workMin;

  // STEP 8: 지급액 계산
  const payResult = calculatePay({
    workType: row.workType,
    wage: row.wage,
    workMinutes: workMin,
    nightMinutes: nightMin,
    isOver5,
    startMin,
    endMin,
    breakMinutes: row.breakMinutes,
  });

  return {
    status: warning ? "warning" : "valid",
    message: warning || "정상",
    workMinutes: workMin,
    nightMinutes: nightMin,
    overtimeMinutes: payResult.overtimeMinutes,
    payResult,
  };
}

// ── 전체 일괄 검증 ──────────────────────────────

export interface BulkValidationResult {
  rows: BulkRow[];
  validCount: number;
  warningCount: number;
  duplicateCount: number;
  errorCount: number;
  totalPay: number;
}

export async function validateAllRows(
  rows: BulkRow[],
  organizationId: string,
  siteId: string,
  existingFingerprints: Set<string>,
  isOver5: boolean,
  dpSettings?: any,
): Promise<BulkValidationResult> {
  const seenFingerprints = new Set<string>();
  let validCount = 0;
  let warningCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;
  let totalPay = 0;

  const processed: BulkRow[] = [];

  for (const row of rows) {
    const result = validateRow(row, isOver5);

    let finalDayType: "workday" | "weekly_holiday" | "unpaid_holiday" | "offday" = "workday";
    let finalCalculatedPay = result.payResult?.calculatedPay ?? 0;
    let finalRegularPay = result.payResult?.regularPay ?? 0;
    let finalOvertimePay = result.payResult?.overtimePay ?? 0;
    let finalNightPay = result.payResult?.nightPay ?? 0;
    let finalRegularHours = result.payResult?.regularHours ?? 0;
    let finalOvertimeHours = result.payResult?.overtimeHours ?? 0;
    let finalNightHours = result.payResult?.nightHours ?? 0;
    let finalHolidayHours = 0;
    let finalHolidayPay = 0;

    if (result.status === "error") {
      processed.push({
        ...row,
        status: "error",
        message: result.message,
        workMinutes: 0,
        nightMinutes: 0,
        overtimeMinutes: 0,
        calculatedPay: 0,
        regularPay: 0,
        overtimePay: 0,
        nightPay: 0,
        regularHours: 0,
        overtimeHours: 0,
        nightHours: 0,
        holidayHours: 0,
        holidayPay: 0,
        dayType: "workday",
      });
      errorCount++;
      continue;
    }

    if (row.workType === "hourly" && dpSettings) {
      finalDayType = classifyDayType(
        row.workDate,
        dpSettings.weekly_work_day_list || [],
        dpSettings.weekly_holiday || "sun",
        dpSettings.non_work_day_default_type || "REST_DAY",
      );

      const holidayCalc = calculateDailyAttendancePayroll({
        workType: "hourly",
        dailyWage: row.wage,
        workMinutes: result.workMinutes,
        nightMinutes: result.nightMinutes,
        dayType: finalDayType,
      });

      finalCalculatedPay = holidayCalc.calculatedPay;
      finalRegularPay = holidayCalc.regularPay;
      finalOvertimePay = holidayCalc.overtimePay;
      finalNightPay = holidayCalc.nightPay;
      finalRegularHours = holidayCalc.regularHours;
      finalOvertimeHours = holidayCalc.overtimeHours;
      finalNightHours = holidayCalc.nightHours;
      finalHolidayHours = holidayCalc.holidayHours;
      finalHolidayPay = holidayCalc.holidayPay;
    }

    // SSN 처리
    const ssn = processSsn(row.ssnInput);

    // STEP 7: fingerprint & 중복 감지
    const identityKey = ssn.masked ? `SSN:${ssn.masked}` : `NAME:${row.workerName.trim()}`;

    const fp = await generateBulkFingerprint(
      siteId,
      identityKey,
      row.workDate,
      row.startTime,
      row.endTime,
      finalCalculatedPay,
    );

    if (seenFingerprints.has(fp) || existingFingerprints.has(fp)) {
      processed.push({
        ...row,
        status: "duplicate",
        message: seenFingerprints.has(fp) ? "시트 내 중복" : "DB에 이미 존재",
        fingerprint: fp,
        ssnMasked: ssn.masked,
        ssnLast4: ssn.last4,
        workMinutes: result.workMinutes,
        nightMinutes: result.nightMinutes,
        overtimeMinutes: result.overtimeMinutes,
        calculatedPay: finalCalculatedPay,
        regularPay: finalRegularPay,
        overtimePay: finalOvertimePay,
        nightPay: finalNightPay,
        regularHours: finalRegularHours,
        overtimeHours: finalOvertimeHours,
        nightHours: finalNightHours,
        holidayHours: finalHolidayHours,
        holidayPay: finalHolidayPay,
        dayType: finalDayType,
      });
      duplicateCount++;
      continue;
    }

    seenFingerprints.add(fp);
    const updatedRow: BulkRow = {
      ...row,
      status: result.status,
      message: result.message,
      fingerprint: fp,
      ssnMasked: ssn.masked,
      ssnLast4: ssn.last4,
      workMinutes: result.workMinutes,
      nightMinutes: result.nightMinutes,
      overtimeMinutes: result.overtimeMinutes,
      calculatedPay: finalCalculatedPay,
      regularPay: finalRegularPay,
      overtimePay: finalOvertimePay,
      nightPay: finalNightPay,
      regularHours: finalRegularHours,
      overtimeHours: finalOvertimeHours,
      nightHours: finalNightHours,
      holidayHours: finalHolidayHours,
      holidayPay: finalHolidayPay,
      dayType: finalDayType,
    };

    if (result.status === "warning") warningCount++;
    else validCount++;
    totalPay += finalCalculatedPay;

    processed.push(updatedRow);
  }

  return { rows: processed, validCount, warningCount, duplicateCount, errorCount, totalPay };
}
