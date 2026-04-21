import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PayrollItem, defaultPaymentItems, defaultDeductionItems } from "@/types/payroll";

/**
 * 기본 항목 중 누락된 것을 기존 목록에 병합합니다.
 * 이미 존재하는 항목은 유지하고, 새로 추가된 기본 항목만 삽입합니다.
 */
function mergeDefaults(existing: PayrollItem[], defaults: PayrollItem[]): PayrollItem[] {
  const existingIds = new Set(existing.map((i) => i.id));
  const missing = defaults.filter((d) => !existingIds.has(d.id));
  if (missing.length === 0) return existing;

  // 기본 항목 순서대로 병합: 각 누락 항목을 defaults 순서 기준으로 올바른 위치에 삽입
  const result = [...existing];
  missing.forEach((item) => {
    const defaultIndex = defaults.findIndex((d) => d.id === item.id);
    // defaults에서 바로 앞 항목을 찾아 그 뒤에 삽입
    let insertAfterIndex = -1;
    for (let i = defaultIndex - 1; i >= 0; i--) {
      const prevIdx = result.findIndex((r) => r.id === defaults[i].id);
      if (prevIdx !== -1) {
        insertAfterIndex = prevIdx;
        break;
      }
    }
    result.splice(insertAfterIndex + 1, 0, item);
  });
  return result;
}

interface PayrollSettingsStore {
  paymentItems: PayrollItem[];
  deductionItems: PayrollItem[];
  addPaymentItem: (item: Omit<PayrollItem, "id" | "type">) => void;
  addDeductionItem: (item: Omit<PayrollItem, "id" | "type">) => void;
  updatePaymentItem: (id: string, updates: Partial<PayrollItem>) => void;
  updateDeductionItem: (id: string, updates: Partial<PayrollItem>) => void;
  deletePaymentItem: (id: string) => void;
  deleteDeductionItem: (id: string) => void;
  togglePaymentItemActive: (id: string) => void;
  toggleDeductionItemActive: (id: string) => void;
  resetToDefaults: () => void;
}

export const usePayrollSettingsStore = create<PayrollSettingsStore>()(
  persist(
    (set) => ({
      paymentItems: defaultPaymentItems,
      deductionItems: defaultDeductionItems,

      addPaymentItem: (item) =>
        set((state) => ({
          paymentItems: [
            ...state.paymentItems,
            {
              ...item,
              id: `payment-${Date.now()}`,
              type: "payment",
            },
          ],
        })),

      addDeductionItem: (item) =>
        set((state) => ({
          deductionItems: [
            ...state.deductionItems,
            {
              ...item,
              id: `deduction-${Date.now()}`,
              type: "deduction",
            },
          ],
        })),

      updatePaymentItem: (id, updates) =>
        set((state) => ({
          paymentItems: state.paymentItems.map((item) => (item.id === id ? { ...item, ...updates } : item)),
        })),

      updateDeductionItem: (id, updates) =>
        set((state) => ({
          deductionItems: state.deductionItems.map((item) => (item.id === id ? { ...item, ...updates } : item)),
        })),

      deletePaymentItem: (id) =>
        set((state) => ({
          paymentItems: state.paymentItems.filter(
            (item) => item.id !== id || item.isLocked, // isLocked 항목은 삭제 불가
          ),
        })),

      deleteDeductionItem: (id) =>
        set((state) => ({
          deductionItems: state.deductionItems.filter(
            (item) => item.id !== id || item.isLocked, // isLocked 항목은 삭제 불가
          ),
        })),

      togglePaymentItemActive: (id) =>
        set((state) => ({
          paymentItems: state.paymentItems.map((item) =>
            // isAlwaysOn 항목(기본급)은 ON/OFF 불가
            item.id === id && !item.isAlwaysOn ? { ...item, isActive: !item.isActive } : item,
          ),
        })),

      toggleDeductionItemActive: (id) =>
        set((state) => ({
          deductionItems: state.deductionItems.map((item) =>
            item.id === id ? { ...item, isActive: !item.isActive } : item,
          ),
        })),

      resetToDefaults: () =>
        set({
          paymentItems: defaultPaymentItems,
          deductionItems: defaultDeductionItems,
        }),
    }),
    {
      name: "payroll-settings-storage",
      version: 5,
      migrate: (persistedState: any, version: number) => {
        if (version < 5) {
          return {
            paymentItems: defaultPaymentItems,
            deductionItems: defaultDeductionItems,
          };
        }
        return persistedState;
      },
    },
  ),
);
