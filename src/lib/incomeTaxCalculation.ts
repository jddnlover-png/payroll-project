import { supabase } from "@/integrations/supabase/client";

// ── 상수 ──────────────────────────────────────────
// 8세 이상 20세 이하 자녀 공제액 (간이세액표 이용 방법)
const CHILD_DEDUCTION: Record<number, number> = {
  1: 12500,
  2: 29160,
};
// 3명 이상: 29,160 + (자녀수 - 2) × 25,000

function getChildDeduction(childCount: number): number {
  if (childCount <= 0) return 0;
  if (childCount === 1) return CHILD_DEDUCTION[1];
  if (childCount === 2) return CHILD_DEDUCTION[2];
  return CHILD_DEDUCTION[2] + (childCount - 2) * 25000;
}

// 10,000천원 초과 공식 (부양가족수별 기준세액)
function calcOver10000(taxBase: number, dependents: number, baseAmounts: number[]): number {
  const base = baseAmounts[Math.min(dependents - 1, 10)]; // d1~d11
  const over = taxBase - 10000000;

  if (taxBase <= 14000000) {
    return base + Math.floor(over * 0.98 * 0.35) + 25000;
  } else if (taxBase <= 28000000) {
    return base + 1397000 + Math.floor((taxBase - 14000000) * 0.98 * 0.38);
  } else if (taxBase <= 30000000) {
    return base + 6610600 + Math.floor((taxBase - 28000000) * 0.98 * 0.4);
  } else if (taxBase <= 45000000) {
    return base + 7394600 + Math.floor((taxBase - 30000000) * 0.4);
  } else if (taxBase <= 87000000) {
    return base + 13394600 + Math.floor((taxBase - 45000000) * 0.42);
  } else {
    return base + 31034600 + Math.floor((taxBase - 87000000) * 0.45);
  }
}

// ── 메인 계산 함수 ─────────────────────────────────
export interface IncomeTaxResult {
  incomeTax: number;
  localIncomeTax: number;
}

export async function calculateIncomeTax(params: {
  taxBase: number; // 비과세 제외 과세급여 (원 단위)
  dependents: number; // 공제대상가족수 (본인 포함, 1~11)
  childrenAged8to20: number; // 8세이상 20세이하 자녀 수
  withholdingRate?: number; // 원천징수 비율 (0.8 / 1.0 / 1.2), 기본 1.0
}): Promise<IncomeTaxResult> {
  const { taxBase, dependents, childrenAged8to20, withholdingRate = 1.0 } = params;

  // taxBase가 770,000원 미만이면 소득세 0원
  if (taxBase < 770000) {
    return { incomeTax: 0, localIncomeTax: 0 };
  }

  const clampedDependents = Math.min(Math.max(dependents, 1), 11);

  // 10,000천원 초과 처리
  if (taxBase > 10000000) {
    // 10,000천원 기준 세액 조회
    const { data } = await supabase
      .from("withholding_tax_rows")
      .select("d1,d2,d3,d4,d5,d6,d7,d8,d9,d10,d11,version_id")
      .eq("pay_from", 10000000)
      .limit(1)
      .maybeSingle();

    let baseTax = 0;
    if (data) {
      const cols = [
        data.d1,
        data.d2,
        data.d3,
        data.d4,
        data.d5,
        data.d6,
        data.d7,
        data.d8,
        data.d9,
        data.d10,
        data.d11,
      ];
      baseTax = calcOver10000(taxBase, clampedDependents, cols);
    }

    const childDeduction = getChildDeduction(childrenAged8to20);
    const rawTax = Math.max(0, baseTax - childDeduction);
    const incomeTax = Math.floor((rawTax * withholdingRate) / 10) * 10; // 10원 단위 절사
    const localIncomeTax = Math.floor((incomeTax * 0.1) / 10) * 10;

    return { incomeTax, localIncomeTax };
  }

  // 간이세액표 구간 조회
  const { data, error } = await supabase
    .from("withholding_tax_rows")
    .select("d1,d2,d3,d4,d5,d6,d7,d8,d9,d10,d11")
    .lte("pay_from", taxBase)
    .gt("pay_to", taxBase)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { incomeTax: 0, localIncomeTax: 0 };
  }

  // 부양가족수에 해당하는 세액 선택
  const cols = [data.d1, data.d2, data.d3, data.d4, data.d5, data.d6, data.d7, data.d8, data.d9, data.d10, data.d11];
  const baseTax = cols[clampedDependents - 1] ?? 0;

  // 자녀 공제 차감
  const childDeduction = getChildDeduction(childrenAged8to20);
  const rawTax = Math.max(0, baseTax - childDeduction);

  // 원천징수 비율 적용 후 10원 단위 절사
  const incomeTax = Math.floor((rawTax * withholdingRate) / 10) * 10;
  const localIncomeTax = Math.floor((incomeTax * 0.1) / 10) * 10;

  return { incomeTax, localIncomeTax };
}
