import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { PayrollRecord, PayrollItemValue } from '@/types/employee';
import { usePayrollSettingsStore } from '@/store/payrollSettingsStore';
import { Save } from 'lucide-react';

interface PayrollItemEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: PayrollRecord | null;
  onSave: (paymentItems: PayrollItemValue[], deductionItems: PayrollItemValue[]) => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('ko-KR').format(amount);

export function PayrollItemEditor({
  open,
  onOpenChange,
  record,
  onSave,
}: PayrollItemEditorProps) {
  const { paymentItems, deductionItems } = usePayrollSettingsStore();
  const [editedPaymentItems, setEditedPaymentItems] = useState<PayrollItemValue[]>([]);
  const [editedDeductionItems, setEditedDeductionItems] = useState<PayrollItemValue[]>([]);
  const [deductionRawInputs, setDeductionRawInputs] = useState<Record<string, string>>({});

  const activePaymentItems = paymentItems.filter(item => item.isActive);
  const activeDeductionItems = deductionItems.filter(item => item.isActive);

  // manual 타입 항목만 편집 가능
  const manualPaymentItems = activePaymentItems.filter(item => item.calculationType === 'manual');
  const manualDeductionItems = activeDeductionItems.filter(item => item.calculationType === 'manual');

  useEffect(() => {
    if (record && open) {
      setEditedPaymentItems(record.paymentItems || []);
      setEditedDeductionItems(record.deductionItems || []);
      setDeductionRawInputs({});
    }
  }, [record, open]);

  const getItemValue = (items: PayrollItemValue[], itemId: string): number => {
    const item = items.find(i => i.itemId === itemId);
    return item?.amount || 0;
  };

  const handlePaymentChange = (itemId: string, itemName: string, value: string) => {
    const numValue = parseInt(value.replace(/,/g, '')) || 0;
    setEditedPaymentItems(prev => {
      const existingIndex = prev.findIndex(i => i.itemId === itemId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], amount: numValue };
        return updated;
      }
      return [...prev, { itemId, name: itemName, amount: numValue, type: 'payment' }];
    });
  };

  const handleDeductionChange = (itemId: string, itemName: string, value: string) => {
    // Keep raw input to allow typing "-" 
    const cleaned = value.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, ''); // only allow leading minus
    setDeductionRawInputs(prev => ({ ...prev, [itemId]: cleaned }));
    
    const numValue = cleaned === '-' || cleaned === '' ? 0 : parseInt(cleaned) || 0;
    setEditedDeductionItems(prev => {
      const existingIndex = prev.findIndex(i => i.itemId === itemId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], amount: numValue };
        return updated;
      }
      return [...prev, { itemId, name: itemName, amount: numValue, type: 'deduction' }];
    });
  };

  const handleSave = () => {
    // 변경된 수동 항목을 기존 항목과 합침
    const mergedPaymentItems = record?.paymentItems?.map(item => {
      const edited = editedPaymentItems.find(e => e.itemId === item.itemId);
      return edited || item;
    }) || [];

    // 새로 추가된 항목 추가
    editedPaymentItems.forEach(edited => {
      if (!mergedPaymentItems.find(m => m.itemId === edited.itemId)) {
        mergedPaymentItems.push(edited);
      }
    });

    const mergedDeductionItems = record?.deductionItems?.map(item => {
      const edited = editedDeductionItems.find(e => e.itemId === item.itemId);
      return edited || item;
    }) || [];

    editedDeductionItems.forEach(edited => {
      if (!mergedDeductionItems.find(m => m.itemId === edited.itemId)) {
        mergedDeductionItems.push(edited);
      }
    });

    onSave(mergedPaymentItems, mergedDeductionItems);
    onOpenChange(false);
  };

  // 총 지급액/공제액 계산
  const calculateTotalPayments = () => {
    let total = 0;
    activePaymentItems.forEach(item => {
      if (item.calculationType === 'manual') {
        total += getItemValue(editedPaymentItems, item.id);
      } else {
        total += getItemValue(record?.paymentItems || [], item.id);
      }
    });
    return total;
  };

  const calculateTotalDeductions = () => {
    let total = 0;
    activeDeductionItems.forEach(item => {
      if (item.calculationType === 'manual') {
        total += getItemValue(editedDeductionItems, item.id);
      } else {
        total += getItemValue(record?.deductionItems || [], item.id);
      }
    });
    return total;
  };

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>급여 항목 편집</DialogTitle>
          <DialogDescription>
            {record.employeeName} ({record.employeeNumber}) - {record.month}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 max-h-[60vh] overflow-y-auto">
          {/* 수동 지급 항목 */}
          {manualPaymentItems.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">수동 입력 지급항목</h4>
              {manualPaymentItems.map(item => (
                <div key={item.id} className="grid grid-cols-2 gap-4 items-center">
                  <Label htmlFor={`payment-${item.id}`}>{item.name}</Label>
                  <Input
                    id={`payment-${item.id}`}
                    type="text"
                    value={formatCurrency(getItemValue(editedPaymentItems, item.id))}
                    onChange={(e) => handlePaymentChange(item.id, item.name, e.target.value)}
                    className="text-right"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          )}

          {manualPaymentItems.length > 0 && manualDeductionItems.length > 0 && (
            <Separator />
          )}

          {/* 수동 공제 항목 */}
          {manualDeductionItems.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">
                수동 입력 공제항목
                <span className="block text-xs text-muted-foreground/70 mt-1">
                  음수 입력 시 환급(플러스) 처리됩니다
                </span>
              </h4>
              {manualDeductionItems.map(item => {
                const itemValue = getItemValue(editedDeductionItems, item.id);
                const rawInput = deductionRawInputs[item.id];
                const displayValue = rawInput !== undefined
                  ? rawInput
                  : (itemValue < 0 ? `-${formatCurrency(Math.abs(itemValue))}` : formatCurrency(itemValue));
                return (
                  <div key={item.id} className="grid grid-cols-2 gap-4 items-center">
                    <Label htmlFor={`deduction-${item.id}`}>{item.name}</Label>
                    <Input
                      id={`deduction-${item.id}`}
                      type="text"
                      value={displayValue}
                      onChange={(e) => handleDeductionChange(item.id, item.name, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      onBlur={() => {
                        // Format on blur
                        setDeductionRawInputs(prev => {
                          const next = { ...prev };
                          delete next[item.id];
                          return next;
                        });
                      }}
                      className={`text-right ${itemValue < 0 ? 'text-green-600' : ''}`}
                      placeholder="0"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {manualPaymentItems.length === 0 && manualDeductionItems.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              수동 입력 가능한 항목이 없습니다.
              <br />
              설정에서 수동 입력 항목을 추가해주세요.
            </div>
          )}

          {/* 총계 표시 */}
          <Separator />
          <div className="space-y-2 bg-muted p-4 rounded-lg">
            <div className="flex justify-between text-sm">
              <span>총 지급액</span>
              <span className="font-medium text-green-600">
                ₩{formatCurrency(calculateTotalPayments())}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span>총 공제액</span>
              <span className="font-medium text-destructive">
                ₩{formatCurrency(calculateTotalDeductions())}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>예상 실지급액</span>
              <span className="text-primary">
                ₩{formatCurrency(calculateTotalPayments() - calculateTotalDeductions())}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}