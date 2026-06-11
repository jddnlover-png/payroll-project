export interface PayrollItem {
  id: string;
  name: string;
  type: "payment" | "deduction";
  isDefault: boolean;
  isActive: boolean;
  isLocked: boolean; // true: 법정 고정 항목 (수정/삭제 불가)
  isAlwaysOn?: boolean; // true: ON/OFF도 불가 (기본급)
  exemptLimit?: number; // 비과세 한도 (식대: 200000)
  calculationType: "fixed" | "percentage" | "manual";
  defaultValue?: number;
  description?: string;
}

export interface PayrollSettings {
  paymentItems: PayrollItem[];
  deductionItems: PayrollItem[];
}

export const defaultPaymentItems: PayrollItem[] = [
  // ── 법정 고정 항목 ──
  {
    id: "base-salary",
    name: "기본급",
    type: "payment",
    isDefault: true,
    isActive: true,
    isLocked: true,
    isAlwaysOn: true,
    calculationType: "fixed",
    description: "월 기본급여",
  },
  {
  id: "overtime",
  name: "연장근로수당",
  type: "payment",
  isDefault: true,
  isActive: true,
  isLocked: true,
  calculationType: "manual",
  description: "연장근로수당",
},
{
  id: "night-shift-allowance",
  name: "야간근로수당",
  type: "payment",
  isDefault: true,
  isActive: true,
  isLocked: true,
  calculationType: "manual",
  description: "야간근로수당",
},
{
  id: "holiday-work-allowance",
  name: "휴일근로수당",
  type: "payment",
  isDefault: true,
  isActive: true,
  isLocked: true,
  calculationType: "manual",
  description: "휴일근로수당",
},
  {
    id: "weekly-holiday-allowance",
    name: "주휴수당",
    type: "payment",
    isDefault: true,
    isActive: true,
    isLocked: true,
    calculationType: "manual",
    description: "주휴수당",
  },
  // ── 비과세 고정 항목 (소득세만 비과세, 4대보험 포함) ──
  {
    id: "meal-allowance",
    name: "식대",
    type: "payment",
    isDefault: true,
    isActive: true,
    isLocked: true,
    calculationType: "fixed",
    defaultValue: 200000,
    exemptLimit: 200000,
    description: "식대 (소득세 비과세 한도 월 20만원)",
  },
  {
    id: "transport-allowance",
    name: "차량운전보조금",
    type: "payment",
    isDefault: true,
    isActive: true,
    isLocked: true,
    calculationType: "fixed",
    defaultValue: 200000,
    exemptLimit: 200000,
    description: "차량운전보조금 (소득세 비과세 한도 월 20만원)",
  },
  {
    id: "childcare-allowance",
    name: "보육수당",
    type: "payment",
    isDefault: true,
    isActive: false,
    isLocked: true,
    calculationType: "fixed",
    defaultValue: 200000,
    exemptLimit: 200000,
    description: "출산·보육수당 (6세 이하 자녀, 소득세 비과세 한도 자녀 1명당 월 20만원)",
  },
  {
    id: "research-allowance",
    name: "연구활동비",
    type: "payment",
    isDefault: true,
    isActive: false,
    isLocked: true,
    calculationType: "fixed",
    defaultValue: 200000,
    exemptLimit: 200000,
    description: "연구활동비 (중소/벤처기업 연구소 전담연구원, 소득세 비과세 한도 월 20만원)",
  },
  // ── 회사별 추가 항목 ──
  {
    id: "bonus",
    name: "상여금",
    type: "payment",
    isDefault: false,
    isActive: true,
    isLocked: false,
    calculationType: "manual",
    description: "성과급 및 상여금",
  },
];

export const defaultDeductionItems: PayrollItem[] = [
  {
    id: "income-tax",
    name: "소득세",
    type: "deduction",
    isDefault: true,
    isActive: true,
    isLocked: true,
    calculationType: "manual",
    description: "근로소득세 (간이세액표 자동 적용)",
  },
  {
    id: "local-income-tax",
    name: "지방소득세",
    type: "deduction",
    isDefault: true,
    isActive: true,
    isLocked: true,
    calculationType: "manual",
    description: "소득세의 10% 자동 계산",
  },
  {
  id: "national-pension",
  name: "국민연금",
  type: "deduction",
  isDefault: true,
  isActive: true,
  isLocked: true,
  calculationType: "percentage",
  defaultValue: 4.75,
  description: "국민연금 본인부담분 (법정요율)",
},
{
  id: "health-insurance",
  name: "건강보험",
  type: "deduction",
  isDefault: true,
  isActive: true,
  isLocked: true,
  calculationType: "percentage",
  defaultValue: 3.595,
  description: "건강보험 본인부담분 (법정요율)",
},
  {
    id: "employment-insurance",
    name: "고용보험",
    type: "deduction",
    isDefault: true,
    isActive: true,
    isLocked: true,
    calculationType: "percentage",
    defaultValue: 0.9,
    description: "고용보험 본인부담분 (법정요율)",
  },
  {
    id: "long-term-care",
    name: "장기요양보험",
    type: "deduction",
    isDefault: true,
    isActive: true,
    isLocked: true,
    calculationType: "percentage",
    defaultValue: 12.81,
    description: "건강보험료의 12.81% 자동 계산",
  },
];
