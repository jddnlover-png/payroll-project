import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Settings2, Check, X, Loader2, RotateCcw, Search } from 'lucide-react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useEmployees } from '@/hooks/useEmployees';
import { usePayrollSettingsStore } from '@/store/payrollSettingsStore';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { EmployeeCombobox } from '@/components/employee/EmployeeCombobox';

interface EmployeePayrollOverride {
  itemId: string;
  name: string;
  isActive: boolean;
  value?: number;
  calculationType?: "fixed" | "percentage" | "manual";
}

interface EmployeeSettings {
  employee_id: string;
  payment_items: EmployeePayrollOverride[];
  deduction_items: EmployeePayrollOverride[];
}

export const EmployeePayrollSettings = () => {
  const { currentOrganization } = useOrganization();
  const { employees, isLoading: employeesLoading } = useEmployees();
  const { paymentItems, deductionItems } = usePayrollSettingsStore();
  
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employeeSettingsMap, setEmployeeSettingsMap] = useState<Record<string, EmployeeSettings>>({});
  
  const [currentPaymentItems, setCurrentPaymentItems] = useState<EmployeePayrollOverride[]>([]);
  const [currentDeductionItems, setCurrentDeductionItems] = useState<EmployeePayrollOverride[]>([]);

  // 모든 직원의 오버라이드 설정 조회
  useEffect(() => {
    if (!currentOrganization?.id) return;
    
    const fetchAllSettings = async () => {
      setSettingsLoading(true);
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
        console.error('Error fetching employee settings:', error);
      } finally {
        setSettingsLoading(false);
      }
    };

    fetchAllSettings();
  }, [currentOrganization?.id]);

  // DB에서 가져온 직원 중 활성 상태인 직원만 필터
  const activeEmployees = employees.filter(emp => emp.is_active);

  const openEmployeeSettings = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    
    const existingSettings = employeeSettingsMap[employeeId];
    
    // 조직 기본값을 기반으로 초기화하고 오버라이드 적용
    const initialPaymentItems: EmployeePayrollOverride[] = paymentItems
      .filter(item => item.isActive)
      .map(item => {
        const override = existingSettings?.payment_items?.find(o => o.itemId === item.id);
        return {
  itemId: item.id,
  name: item.name,
  isActive: override ? override.isActive : true,
  value: override?.value ?? item.defaultValue,
  calculationType: item.calculationType,
};
      });


const initialDeductionItems: EmployeePayrollOverride[] = deductionItems
  .filter(item => item.isActive)
  .map(item => {
    const override = existingSettings?.deduction_items?.find(o => o.itemId === item.id);
    return {
  itemId: item.id,
  name: item.name,
  isActive: override ? override.isActive : true,
  value: override?.value ?? item.defaultValue,
  calculationType: item.calculationType,
};
  });

    setCurrentPaymentItems(initialPaymentItems);
    setCurrentDeductionItems(initialDeductionItems);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!currentOrganization?.id || !selectedEmployeeId) return;

    setSaving(true);
    try {
      // 먼저 기존 설정이 있는지 확인
      const { data: existing } = await supabase
        .from('employee_payroll_settings')
        .select('id')
        .eq('organization_id', currentOrganization.id)
        .eq('employee_id', selectedEmployeeId)
        .maybeSingle();

      if (existing) {
        // 업데이트
        const { error } = await supabase
          .from('employee_payroll_settings')
          .update({
            payment_items: currentPaymentItems as any,
            deduction_items: currentDeductionItems as any,
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // 새로 삽입
        const { error } = await supabase
          .from('employee_payroll_settings')
          .insert({
            organization_id: currentOrganization.id,
            employee_id: selectedEmployeeId,
            payment_items: currentPaymentItems as any,
            deduction_items: currentDeductionItems as any,
          });

        if (error) throw error;
      }

      // 로컬 상태 업데이트
      setEmployeeSettingsMap(prev => ({
        ...prev,
        [selectedEmployeeId]: {
          employee_id: selectedEmployeeId,
          payment_items: currentPaymentItems,
          deduction_items: currentDeductionItems,
        }
      }));

      toast.success('직원별 급여 설정이 저장되었습니다.');
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving employee settings:', error);
      toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    if (!currentOrganization?.id || !selectedEmployeeId) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('employee_payroll_settings')
        .delete()
        .eq('organization_id', currentOrganization.id)
        .eq('employee_id', selectedEmployeeId);

      if (error) throw error;

      // 로컬 상태에서 제거
      setEmployeeSettingsMap(prev => {
        const updated = { ...prev };
        delete updated[selectedEmployeeId];
        return updated;
      });

      toast.success('조직 기본 설정으로 초기화되었습니다.');
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error resetting employee settings:', error);
      toast.error('초기화 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const updatePaymentItem = (itemId: string, updates: Partial<EmployeePayrollOverride>) => {
    setCurrentPaymentItems(prev => 
      prev.map(item => 
        item.itemId === itemId ? { ...item, ...updates } : item
      )
    );
  };

  const updateDeductionItem = (itemId: string, updates: Partial<EmployeePayrollOverride>) => {
    setCurrentDeductionItems(prev => 
      prev.map(item => 
        item.itemId === itemId ? { ...item, ...updates } : item
      )
    );
  };

  const getPayTypeLabel = (payType: string | undefined) => {
    switch (payType) {
      case 'monthly': return '월급';
      case 'daily': return '일급';
      case 'hourly': return '시급';
      default: return payType || '-';
    }
  };

  const isLoading = settingsLoading || employeesLoading;

  const hasCustomSettings = (employeeId: string) => {
    return !!employeeSettingsMap[employeeId];
  };

  const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeId);

const getPaymentItem = (itemId: string) => {
  return paymentItems.find(item => item.id === itemId);
};

const getDeductionItem = (itemId: string) => {
  return deductionItems.find(item => item.id === itemId);
};

const NON_EDITABLE_PAYMENT_ITEM_IDS = [
  "base-salary",
  "overtime",
  "night-shift-allowance",
  "holiday-work-allowance",
  "weekly-holiday-allowance",
];

const NON_EDITABLE_DEDUCTION_ITEM_IDS = [
  "income-tax",
  "local-income-tax",
  "national-pension",
  "health-insurance",
  "employment-insurance",
  "long-term-care",
];

const canEditPaymentValue = (item: EmployeePayrollOverride) => {
  return (
    item.calculationType === "manual" &&
    !NON_EDITABLE_PAYMENT_ITEM_IDS.includes(item.itemId)
  );
};

const canEditDeductionValue = (item: EmployeePayrollOverride) => {
  return (
    item.calculationType === "manual" &&
    !NON_EDITABLE_DEDUCTION_ITEM_IDS.includes(item.itemId)
  );
};

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <div>
            <CardTitle>직원별 급여항목 설정</CardTitle>
            <CardDescription>
              직원별로 지급/공제항목을 개별 설정합니다. 설정하지 않은 직원은 조직 기본값이 적용됩니다.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : activeEmployees.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            등록된 직원이 없습니다.
          </div>
        ) : (
          <div className="space-y-4">
            {/* 직원 검색 콤보박스 */}
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 max-w-sm">
                <EmployeeCombobox
                  employees={activeEmployees}
                  value=""
                  onValueChange={(empId) => {
                    if (empId) openEmployeeSettings(empId);
                  }}
                  placeholder="직원 검색 후 바로 설정 열기..."
                />
              </div>
            </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>직원명</TableHead>
                <TableHead>부서</TableHead>
                <TableHead>직책</TableHead>
                <TableHead>급여유형</TableHead>
                <TableHead className="text-center">개별설정</TableHead>
                <TableHead className="text-center">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeEmployees.map(employee => (
                <TableRow key={employee.id}>
                  <TableCell className="font-medium">{employee.name}</TableCell>
                  <TableCell>{employee.department || '-'}</TableCell>
                  <TableCell>{employee.position || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {getPayTypeLabel(employee.pay_type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {hasCustomSettings(employee.id) ? (
                      <Badge variant="default" className="gap-1">
                        <Check className="h-3 w-3" />
                        적용됨
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <X className="h-3 w-3" />
                        기본값
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEmployeeSettings(employee.id)}
                    >
                      <Settings2 className="h-4 w-4 mr-1" />
                      설정
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}

        {/* 직원별 설정 다이얼로그 */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                {selectedEmployee?.name} 급여항목 설정
              </DialogTitle>
              <DialogDescription>
                이 직원에게 적용할 지급/공제 항목을 설정합니다. 
                조직 기본 설정과 다르게 적용할 항목만 수정하세요.
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="max-h-[50vh]">
              <Tabs defaultValue="payment" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="payment">지급항목</TabsTrigger>
                  <TabsTrigger value="deduction">공제항목</TabsTrigger>
                </TabsList>
                
                <TabsContent value="payment" className="space-y-3 pt-4">
                  {currentPaymentItems.map(item => (
                    <div key={item.itemId} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={item.isActive}
                          onCheckedChange={(checked) => updatePaymentItem(item.itemId, { isActive: checked })}
                        />
                        <span className={!item.isActive ? 'text-muted-foreground' : ''}>
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
  {canEditPaymentValue(item) ? (
    <>
      <Input
        type="number"
        value={item.value ?? ""}
        onChange={(e) =>
          updatePaymentItem(item.itemId, {
            value: e.target.value ? Number(e.target.value) : undefined,
          })
        }
        className="w-32 text-right"
        placeholder="금액"
        disabled={!item.isActive}
      />
      <span className="text-sm text-muted-foreground w-8">원</span>
    </>
  ) : (
    <>
      <Input
        value="기본값"
        className="w-32 text-right text-muted-foreground"
        disabled
      />
      <span className="text-sm text-muted-foreground w-8">원</span>
    </>
  )}
</div>
                    </div>
                  ))}
                </TabsContent>
                
                <TabsContent value="deduction" className="space-y-3 pt-4">
                  {currentDeductionItems.map(item => (
                    <div key={item.itemId} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={item.isActive}
                          onCheckedChange={(checked) => updateDeductionItem(item.itemId, { isActive: checked })}
                        />
                        <span className={!item.isActive ? 'text-muted-foreground' : ''}>
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
  {canEditDeductionValue(item) ? (
    <>
      <Input
        type="number"
        value={item.value ?? ""}
        onChange={(e) =>
          updateDeductionItem(item.itemId, {
            value: e.target.value ? Number(e.target.value) : undefined,
          })
        }
        className="w-32 text-right"
        placeholder="금액"
        disabled={!item.isActive}
      />
      <span className="text-sm text-muted-foreground w-8">원</span>
    </>
  ) : (
    <>
      <Input
        value="기본값"
        className="w-32 text-right text-muted-foreground"
        disabled
      />
      <span className="text-sm text-muted-foreground w-8">원</span>
    </>
  )}
</div>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </ScrollArea>

            <DialogFooter className="flex justify-between sm:justify-between">
              <Button
                variant="outline"
                onClick={handleResetToDefault}
                disabled={saving || !hasCustomSettings(selectedEmployeeId || '')}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                기본값으로 초기화
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  취소
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  저장
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
