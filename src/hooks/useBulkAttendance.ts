/**
 * 복수 인부 일괄입력 상태관리 훅
 */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculateDailyTax } from "@/utils/dailyTaxCalculation";
import { classifyDayType, calculateDailyAttendancePayroll } from "@/utils/dailyWorkerCalculation";
import { calculateWeeklyHolidayEligibility, resolveWorkerKey } from "@/utils/weeklyHolidayEligibility";
import { upsertWeeklyHolidayPayRecord } from "@/utils/upsertWeeklyHolidayPayRecord";
import {
  BulkRow,
  BulkValidationResult,
  validateAllRows,
  generateBulkFingerprint,
  createBulkSnapshot,
  hashSnapshot,
  processSsn,
  calculateBulkHourlyPay,
} from "@/utils/bulkValidation";
import { toast } from "sonner";

let rowCounter = 0;

function createEmptyRow(workDate: string): BulkRow {
  rowCounter++;
  return {
    id: `bulk-${Date.now()}-${rowCounter}`,
    workerName: "",
    jobType: "보통인부",
    ssnInput: "",
    workDate,
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes: 60,
    workType: "fixed",
    wage: 0,
    workMinutes: 480,
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
    mealAllowance: 0,
    vehicleAllowance: 0,
    extraNonTaxableAllowance: 0,
    extraNonTaxableName: "",
    status: "pending",
    message: "",
    fingerprint: "",
    ssnMasked: null,
    ssnLast4: null,
    phone: null,
  };
}

export function useBulkAttendance(
  organizationId: string | undefined,
  siteId: string,
  defaultWorkDate: string,
  isOver5: boolean,
  dpSettings?: any,
) {
  const [rows, setRows] = useState<BulkRow[]>(() => Array.from({ length: 5 }, () => createEmptyRow(defaultWorkDate)));
  const [validationResult, setValidationResult] = useState<BulkValidationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: number; skipped: number; error: number } | null>(null);

  const addRows = useCallback(
    (count: number) => {
      setRows((prev) => [...prev, ...Array.from({ length: count }, () => createEmptyRow(defaultWorkDate))]);
    },
    [defaultWorkDate],
  );

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateRow = useCallback(
    (id: string, field: keyof BulkRow, value: any) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          const updated = { ...r, [field]: value, status: "pending" as const, message: "" };

          // 시급제: 즉시 계산
          if (updated.workType === "hourly" && updated.wage > 0 && dpSettings) {
            const calc = calculateBulkHourlyPay(updated, isOver5);

            const dayType = classifyDayType(
              updated.workDate,
              dpSettings.weekly_work_day_list || [],
              dpSettings.weekly_holiday || "sun",
              dpSettings.non_work_day_default_type || "REST_DAY",
            );

            const payResult = calculateDailyAttendancePayroll({
              workType: "hourly",
              dailyWage: updated.wage,
              workMinutes: calc.workMinutes,
              nightMinutes: calc.nightMinutes,
              dayType,
            });

            updated.workMinutes = calc.workMinutes;
            updated.nightMinutes = calc.nightMinutes;
            updated.overtimeMinutes = calc.overtimeMinutes;
            updated.calculatedPay = payResult.calculatedPay;
            updated.regularPay = payResult.regularPay;
            updated.overtimePay = payResult.overtimePay;
            updated.nightPay = payResult.nightPay;
            updated.regularHours = payResult.regularHours;
            updated.overtimeHours = payResult.overtimeHours;
            updated.nightHours = payResult.nightHours;
            updated.holidayHours = payResult.holidayHours;
            updated.holidayPay = payResult.holidayPay;
            updated.dayType = dayType;
          }

          if (updated.workType === "fixed" && updated.wage > 0 && updated.workMinutes > 0 && dpSettings) {
            const dayType = classifyDayType(
              updated.workDate,
              dpSettings.weekly_work_day_list || [],
              dpSettings.weekly_holiday || "sun",
              dpSettings.non_work_day_default_type || "REST_DAY",
            );
            const payResult = calculateDailyAttendancePayroll({
              workType: "fixed",
              dailyWage: updated.wage,
              workMinutes: updated.workMinutes,
              nightMinutes: 0,
              dayType,
            });
            updated.calculatedPay = payResult.calculatedPay;
            updated.regularPay = payResult.regularPay;
            updated.overtimePay = payResult.overtimePay;
            updated.holidayHours = 0;
            updated.holidayPay = 0;
            updated.dayType = dayType;
          } else if (updated.workType === "fixed") {
            updated.holidayHours = 0;
            updated.holidayPay = 0;
            updated.dayType = "workday";
          }
          return updated;
        }),
      );
      setValidationResult(null);
    },
    [isOver5],
  );

  const resetAll = useCallback(() => {
    setRows(Array.from({ length: 5 }, () => createEmptyRow(defaultWorkDate)));
    setValidationResult(null);
    setShowPreview(false);
    setSaveResult(null);
  }, [defaultWorkDate]);

  const runValidation = useCallback(async () => {
    if (!organizationId || !siteId) {
      toast.error("현장을 선택해주세요");
      return;
    }

    // 빈 행 제거 (이름이 비어있으면 건너뜀)
    const nonEmptyRows = rows.filter((r) => r.workerName.trim() !== "" || r.wage > 0);
    if (nonEmptyRows.length === 0) {
      toast.error("입력된 데이터가 없습니다");
      return;
    }

    // DB 기존 fingerprint 조회
    // DB 기존 기록 조회 → 현재 bulk 기준으로 fingerprint 다시 계산
    const dates = [...new Set(nonEmptyRows.map((r) => r.workDate))];
    const { data: existing } = await supabase
      .from("daily_attendance")
      .select("worker_name, ssn_masked, work_date, start_time, end_time, calculated_pay")
      .eq("organization_id", organizationId)
      .eq("site_id", siteId)
      .in("work_date", dates);

    const existingFpList = await Promise.all(
      (existing || []).map((e) => {
        const identityKey = e.ssn_masked ? `SSN:${e.ssn_masked}` : `NAME:${(e.worker_name || "").trim()}`;

        return generateBulkFingerprint(
          siteId,
          identityKey,
          e.work_date,
          (e.start_time || "").slice(0, 5),
          (e.end_time || "").slice(0, 5),
          e.calculated_pay || 0,
        );
      }),
    );

    const existingFps = new Set(existingFpList);

    const result = await validateAllRows(nonEmptyRows, organizationId, siteId, existingFps, isOver5, dpSettings);
    setRows((prev) => {
      // 빈 행은 유지, 검증된 행은 교체
      const emptyRows = prev.filter((r) => r.workerName.trim() === "" && r.wage === 0);
      return [...result.rows, ...emptyRows];
    });
    setValidationResult(result);
    setShowPreview(true);
  }, [rows, organizationId, siteId, isOver5, dpSettings]);

  const saveValidRows = useCallback(async () => {
    if (!organizationId || !siteId || !validationResult) return;

    const saveable = validationResult.rows.filter((r) => r.status === "valid" || r.status === "warning");
    if (saveable.length === 0) {
      toast.error("저장할 수 있는 행이 없습니다");
      return;
    }

    setSaving(true);

    try {
      let success = 0;
      let skipped = 0;
      let error = 0;
      const savedRows: BulkRow[] = [];

      for (const row of saveable) {
        try {
          const snapshot = createBulkSnapshot({
            workType: row.workType,
            wage: row.wage,
            calculatedPay: row.calculatedPay,
            startTime: row.startTime,
            endTime: row.endTime,
            breakMinutes: row.breakMinutes,
            workMinutes: row.workMinutes,
            nightMinutes: row.nightMinutes,
            overtimeMinutes: row.overtimeMinutes,
            regularPay: row.regularPay,
            overtimePay: row.overtimePay,
            nightPay: row.nightPay,
            holidayHours: row.holidayHours ?? 0,
            holidayPay: row.holidayPay ?? 0,
            dayType: row.dayType ?? "workday",
            nightStart: "22:00",
            nightEnd: "06:00",
            overtimeMultiplier: 1.5,
            nightMultiplier: 0.5,
            isOver5,
          });

          const snapshotHash = await hashSnapshot(snapshot);
          const snapshotWithHash = { ...snapshot, snapshot_hash: snapshotHash };

          const { error: dbError } = await supabase.from("daily_attendance").upsert(
            {
              organization_id: organizationId,
              site_id: siteId,
              worker_name: row.workerName.trim(),
              job_type: row.jobType || "보통인부",
              ssn_masked: row.ssnMasked,
              ssn_last4: row.ssnLast4,
              ssn_encrypted: null,
              phone: (row as any).phone ?? null,
              work_date: row.workDate,
              start_time: row.startTime,
              end_time: row.endTime,
              break_minutes: row.breakMinutes,
              work_minutes: row.workMinutes,
              work_type: row.workType,
              daily_wage: row.wage,
              calculated_pay: row.calculatedPay,
              final_pay: row.calculatedPay,
              work_hours: Math.round((row.workMinutes / 60) * 100) / 100,
              regular_hours: row.regularHours,
              overtime_hours: row.overtimeHours,
              night_hours: row.nightHours,
              holiday_hours: row.holidayHours ?? 0,
              overtime_pay: row.overtimePay,
              night_pay: row.nightPay,
              holiday_pay: row.holidayPay ?? 0,
              fingerprint: row.fingerprint,
              calculation_snapshot: snapshotWithHash,
              adjustment_memo: "",
              memo: "",
              meal_allowance_amount: (row as any).mealAllowance ?? 0,
              vehicle_allowance_amount: (row as any).vehicleAllowance ?? 0,
              extra_non_taxable_allowance_amount: (row as any).extraNonTaxableAllowance ?? 0,
              extra_non_taxable_allowance_name:
                ((row as any).extraNonTaxableAllowance ?? 0) > 0 ? (row as any).extraNonTaxableName || null : null,
              // 직원별 보험 적용 여부 조회 (async 함수 레벨에서 실행)

              ...(dpSettings
                ? await (async () => {
                    const rowWorkerKey = row.ssnMasked ? `SSN:${row.ssnMasked}` : `NAME:${row.workerName.trim()}`;

                    const { data: insuranceData } = await supabase
                      .from("worker_insurance_settings")
                      .select("apply_national_pension, apply_health_insurance, apply_employment_insurance")
                      .eq("organization_id", organizationId)
                      .eq("worker_key", rowWorkerKey)
                      .maybeSingle();

                    const mergedDpSettings = {
                      ...dpSettings,
                      apply_national_pension: insuranceData?.apply_national_pension ?? false,
                      apply_health_insurance: insuranceData?.apply_health_insurance ?? false,
                      apply_employment_insurance: insuranceData?.apply_employment_insurance ?? true,
                    };

                    const mealAmt = (row as any).mealAllowance ?? 0;
                    const vehicleAmt = (row as any).vehicleAllowance ?? 0;
                    const extraAmt = (row as any).extraNonTaxableAllowance ?? 0;
                    const totalPayWithAllowances = row.calculatedPay + mealAmt + vehicleAmt + extraAmt;
                    const taxResult = calculateDailyTax(totalPayWithAllowances, mergedDpSettings, "employment_income", {
                      totalWage: totalPayWithAllowances,
                      overtimePay: row.overtimePay ?? 0,
                      nightPay: row.nightPay ?? 0,
                      holidayPay: 0,
                      mealAllowance: mealAmt,
                      vehicleAllowance: vehicleAmt,
                      extraNonTaxableAllowance: extraAmt,
                      isProductionWorkerTaxExempt: dpSettings.production_worker_tax_exempt ?? false,
                    });
                    return {
                      income_tax: taxResult.incomeTax,
                      local_income_tax: taxResult.localIncomeTax,
                      employment_insurance: taxResult.employmentInsurance,
                      national_pension: taxResult.nationalPension,
                      health_insurance: taxResult.healthInsurance,
                      long_term_care_insurance: taxResult.longTermCareInsurance,
                      industrial_accident: taxResult.industrialAccident,
                      total_deductions: taxResult.totalDeductions,
                      net_pay: taxResult.netPay,
                    };
                  })()
                : {}),
            },
            { onConflict: "organization_id,fingerprint" },
          );

          if (dbError) {
            console.error("Save error:", dbError);
            error++;
          } else {
            success++;
            savedRows.push(row);
          }
        } catch (e) {
          console.error("Row save error:", e);
          error++;
        }
      }
      skipped = validationResult.duplicateCount;
      setSaveResult({ success, skipped, error: error + validationResult.errorCount });
      setShowPreview(false);

      // 주휴수당 재계산은 저장 완료 후 백그라운드 실행
      void (async () => {
        try {
          if (!organizationId || !dpSettings) return;

          const weeklyKeys = new Set<string>();

          for (const row of savedRows) {
            if (row.workType !== "hourly") continue;

            const workerKey = resolveWorkerKey({
              worker_name: row.workerName.trim(),
              ssn_masked: row.ssnMasked,
              phone: null,
            });

            // 저장 전 전체 현장 데이터 조회 (saveValidRows 함수 상단에 추가)
            const { data: allOrgRecords } = await supabase
              .from("daily_attendance")
              .select("*")
              .eq("organization_id", organizationId)
              .eq("work_type", "hourly");

            const weeklyResult = calculateWeeklyHolidayEligibility({
              organizationId,
              workerKey,
              workerName: row.workerName.trim(),
              targetDate: row.workDate,
              records: [
                ...(allOrgRecords || []),
                ...saveable.map((r) => ({
                  organization_id: organizationId,
                  site_id: siteId,
                  worker_name: r.workerName.trim(),
                  ssn_masked: r.ssnMasked,
                  phone: null,
                  work_date: r.workDate,
                  work_type: r.workType,
                  daily_wage: r.wage,
                  work_minutes: r.workMinutes,
                  created_at: new Date().toISOString(),
                })),
              ] as any,
              weeklyWorkDayList: dpSettings.weekly_work_day_list || [],
              weeklyHoliday: dpSettings.weekly_holiday || "sun",
              weeklyWorkHours: dpSettings.weekly_work_hours || 40,
            });

            const key = `${weeklyResult.organization_id}|${weeklyResult.worker_key}|${weeklyResult.week_start}`;
            if (weeklyKeys.has(key)) continue;
            weeklyKeys.add(key);

            await upsertWeeklyHolidayPayRecord(weeklyResult);
          }
        } catch (e) {
          console.error("bulk weekly holiday recalc error:", e);
        }
      })();
    } finally {
      setSaving(false);
    }
  }, [organizationId, siteId, validationResult, isOver5, dpSettings]);

  return {
    rows,
    addRows,
    removeRow,
    updateRow,
    resetAll,
    runValidation,
    saveValidRows,
    validationResult,
    showPreview,
    setShowPreview,
    saving,
    saveResult,
    setSaveResult,
  };
}
