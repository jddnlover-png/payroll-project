import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { usePayrollSettingsStore } from '@/store/payrollSettingsStore';
import { supabase } from '@/integrations/supabase/client';
import { PayrollItem } from '@/types/payroll';

interface EmployeePayrollOverride {
  itemId: string;
  name: string;
  isActive: boolean;
  value?: number;
}

interface EmployeeSettings {
  employee_id: string;
  payment_items: EmployeePayrollOverride[];
  deduction_items: EmployeePayrollOverride[];
}

interface MergedPayrollItem extends PayrollItem {
  overrideValue?: number;
}

const INSURANCE_DEDUCTION_ITEM_IDS = [
  "national-pension",
  "health-insurance",
  "employment-insurance",
  "long-term-care",
];

export function useEmployeePayrollSettings() {
  const { currentOrganization } = useOrganization();
  const { paymentItems: orgPaymentItems, deductionItems: orgDeductionItems } = usePayrollSettingsStore();
  const [employeeSettingsMap, setEmployeeSettingsMap] = useState<Record<string, EmployeeSettings>>({});
  const [loading, setLoading] = useState(true);

  // 모든 직원의 오버라이드 설정 조회
  useEffect(() => {
    if (!currentOrganization?.id) {
      setLoading(false);
      return;
    }

    const fetchAllSettings = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('employee_payroll_settings')
          .select('*')
          .eq('organization_id', currentOrganization.id);

        if (error) throw error;

        const map: Record<string, EmployeeSettings> = {};
        data?.forEach((setting: any) => {
          map[setting.employee_id] = {
            employee_id: setting.employee_id,
            payment_items: setting.payment_items || [],
            deduction_items: setting.deduction_items || [],
          };
        });
        setEmployeeSettingsMap(map);
      } catch (error) {
        console.error('Error fetching employee payroll settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllSettings();
  }, [currentOrganization?.id]);

  // 특정 직원의 최종 지급항목 반환 (조직 기본값 + 오버라이드 적용)
  const getEmployeePaymentItems = useCallback((employeeId: string): MergedPayrollItem[] => {
    const employeeSettings = employeeSettingsMap[employeeId];
    
    return orgPaymentItems
      .filter(item => item.isActive)
      .map(orgItem => {
        const override = employeeSettings?.payment_items?.find(o => o.itemId === orgItem.id);
        
        // 오버라이드가 있으면 적용
        if (override) {
          return {
            ...orgItem,
            isActive: override.isActive,
            overrideValue: override.value,
            defaultValue: override.value ?? orgItem.defaultValue,
          };
        }
        
        return { ...orgItem };
      })
      .filter(item => item.isActive);
  }, [orgPaymentItems, employeeSettingsMap]);

  // 특정 직원의 최종 공제항목 반환 (조직 기본값 + 오버라이드 적용)
  const getEmployeeDeductionItems = useCallback((employeeId: string): MergedPayrollItem[] => {
    const employeeSettings = employeeSettingsMap[employeeId];
    
    return orgDeductionItems
      .filter(item => item.isActive)
      .map(orgItem => {
        const override = employeeSettings?.deduction_items?.find(o => o.itemId === orgItem.id);
          const isInsuranceDeduction =
    INSURANCE_DEDUCTION_ITEM_IDS.includes(orgItem.id);

  if (isInsuranceDeduction) {
    return { ...orgItem };
  }
        
        // 오버라이드가 있으면 적용
        if (override) {
          return {
            ...orgItem,
            isActive: override.isActive,
            overrideValue: override.value,
            defaultValue: override.value ?? orgItem.defaultValue,
          };
        }
        
        return { ...orgItem };
      })
      .filter(item => item.isActive);
  }, [orgDeductionItems, employeeSettingsMap]);

  // 직원이 개별 설정을 가지고 있는지 확인
  const hasCustomSettings = useCallback((employeeId: string): boolean => {
    return !!employeeSettingsMap[employeeId];
  }, [employeeSettingsMap]);

  return {
    loading,
    employeeSettingsMap,
    getEmployeePaymentItems,
    getEmployeeDeductionItems,
    hasCustomSettings,
  };
}
