import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Edit, RotateCcw } from "lucide-react";
import { usePayrollSettingsStore } from "@/store/payrollSettingsStore";
import { PayrollItem } from "@/types/payroll";
import { toast } from "sonner";

interface ItemFormData {
  name: string;
  calculationType: "fixed" | "percentage" | "manual";
  defaultValue: string;
  description: string;
}

const initialFormData: ItemFormData = {
  name: "",
  calculationType: "fixed",
  defaultValue: "",
  description: "",
};

export const PayrollItemsSettings = () => {
  const {
    paymentItems,
    deductionItems,
    addPaymentItem,
    addDeductionItem,
    updatePaymentItem,
    updateDeductionItem,
    deletePaymentItem,
    deleteDeductionItem,
    togglePaymentItemActive,
    toggleDeductionItemActive,
    resetToDefaults,
  } = usePayrollSettingsStore();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<"payment" | "deduction">("payment");
  const [formData, setFormData] = useState<ItemFormData>(initialFormData);
  const [editingItem, setEditingItem] = useState<PayrollItem | null>(null);

  const handleAddItem = () => {
    if (!formData.name.trim()) {
      toast.error("항목명을 입력해주세요.");
      return;
    }

    const newItem = {
      name: formData.name,
      isDefault: false,
      isActive: true,
      isLocked: false, // 회사별 추가 항목은 항상 수정/삭제 가능
      calculationType: formData.calculationType,
      defaultValue:
  formData.calculationType === "manual"
    ? undefined
    : formData.defaultValue
      ? parseFloat(formData.defaultValue)
      : undefined,
      description: formData.description,
    };

    if (currentTab === "payment") {
      addPaymentItem(newItem);
    } else {
      addDeductionItem(newItem);
    }

    toast.success("항목이 추가되었습니다.");
    setFormData(initialFormData);
    setIsAddDialogOpen(false);
  };

  const handleEditItem = () => {
    if (!editingItem || !formData.name.trim()) {
      toast.error("항목명을 입력해주세요.");
      return;
    }

    const updates = {
      name: formData.name,
      calculationType: formData.calculationType,
      defaultValue:
  formData.calculationType === "manual"
    ? undefined
    : formData.defaultValue
      ? parseFloat(formData.defaultValue)
      : undefined,
      description: formData.description,
    };

    if (editingItem.type === "payment") {
      updatePaymentItem(editingItem.id, updates);
    } else {
      updateDeductionItem(editingItem.id, updates);
    }

    toast.success("항목이 수정되었습니다.");
    setFormData(initialFormData);
    setEditingItem(null);
    setIsEditDialogOpen(false);
  };

  const handleDelete = (item: PayrollItem) => {
    if (item.isDefault) {
      toast.error("기본 항목은 삭제할 수 없습니다. 비활성화만 가능합니다.");
      return;
    }

    if (item.type === "payment") {
      deletePaymentItem(item.id);
    } else {
      deleteDeductionItem(item.id);
    }
    toast.success("항목이 삭제되었습니다.");
  };

  const handleToggleActive = (item: PayrollItem) => {
    if (item.type === "payment") {
      togglePaymentItemActive(item.id);
    } else {
      toggleDeductionItemActive(item.id);
    }
  };

  const openEditDialog = (item: PayrollItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      calculationType: item.calculationType,
      defaultValue: item.defaultValue?.toString() || "",
      description: item.description || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleReset = () => {
    resetToDefaults();
    toast.success("기본 설정으로 초기화되었습니다.");
  };

  const getCalculationTypeLabel = (type: string) => {
    switch (type) {
      case "fixed":
        return "정액";
      case "percentage":
        return "비율(%)";
      case "manual":
        return "수동입력";
      default:
        return type;
    }
  };

  const renderItemTable = (items: PayrollItem[], type: "payment" | "deduction") => {
    const lockedItems = items.filter((item) => item.isLocked);
    const customItems = items.filter((item) => !item.isLocked);

    return (
      <div className="space-y-4">
        {/* 법정 고정 항목 */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-muted-foreground">법정 고정 항목</span>
            <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
              ON/OFF만 가능
            </Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>항목명</TableHead>
                <TableHead>계산방식</TableHead>
                <TableHead>기본값</TableHead>
                <TableHead>설명</TableHead>
                <TableHead className="text-center">활성화</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lockedItems.map((item) => (
                <TableRow key={item.id} className={!item.isActive ? "opacity-50" : ""}>
                  <TableCell className="font-medium">
                    {item.name}
                    {item.isAlwaysOn && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        필수
                      </Badge>
                    )}
                    {item.exemptLimit && (
                      <Badge variant="outline" className="ml-2 text-xs text-green-600 border-green-300">
                        비과세
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{getCalculationTypeLabel(item.calculationType)}</TableCell>
                  <TableCell>
  {type === "deduction" ? (
    "-"
  ) : (
    <>
      {item.defaultValue !== undefined
        ? item.calculationType === "percentage"
          ? `${item.defaultValue}%`
          : `${item.defaultValue.toLocaleString()}원`
        : "-"}
      {item.exemptLimit && (
        <span className="text-xs text-green-600 ml-1">
          (한도 {(item.exemptLimit / 10000).toFixed(0)}만원)
        </span>
      )}
    </>
  )}
</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{item.description || "-"}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={item.isActive}
                      onCheckedChange={() => handleToggleActive(item)}
                      disabled={item.isAlwaysOn}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* 회사별 추가 항목 */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-muted-foreground">회사별 추가 항목</span>
            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
              자유 추가/수정/삭제
            </Badge>
          </div>
          {customItems.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg">
              추가된 항목이 없습니다. 위 [항목 추가] 버튼을 클릭하세요.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>항목명</TableHead>
                  <TableHead>계산방식</TableHead>
                  <TableHead>기본값</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-center">활성화</TableHead>
                  <TableHead className="text-center">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customItems.map((item) => (
                  <TableRow key={item.id} className={!item.isActive ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{getCalculationTypeLabel(item.calculationType)}</TableCell>
                    <TableCell>
                      {item.defaultValue !== undefined
                        ? item.calculationType === "percentage"
                          ? `${item.defaultValue}%`
                          : `${item.defaultValue.toLocaleString()}원`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.description || "-"}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={item.isActive} onCheckedChange={() => handleToggleActive(item)} />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(item)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    );
  };

  const ItemFormDialog = ({
    isOpen,
    onOpenChange,
    onSubmit,
    title,
    submitLabel,
  }: {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: () => void;
    title: string;
    submitLabel: string;
  }) => (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
  {currentTab === "payment" ? "지급" : "공제"} 항목 정보를 입력하세요.
  정액은 전 직원에게 동일 금액으로 적용되고, 수동입력은 직원별 급여항목 설정에서 개별 금액을 입력합니다.
</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">항목명 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="항목명 입력"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="calculationType">계산방식</Label>
            <Select
              value={formData.calculationType}
              onValueChange={(value: "fixed" | "percentage" | "manual") =>
  setFormData({
    ...formData,
    calculationType: value,
    defaultValue: value === "manual" ? "" : formData.defaultValue,
  })
}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">정액</SelectItem>
                <SelectItem value="percentage">비율(%)</SelectItem>
                <SelectItem value="manual">수동입력</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="defaultValue">기본값 {formData.calculationType === "percentage" ? "(%)" : "(원)"}</Label>
            <Input
              id="defaultValue"
              type="number"
              value={formData.defaultValue}
              onChange={(e) => setFormData({ ...formData, defaultValue: e.target.value })}
              placeholder={formData.calculationType === "manual" ? "수동입력 시 미적용" : "기본값 입력"}
              disabled={formData.calculationType === "manual"}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">설명</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="항목 설명 (선택)"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={onSubmit}>{submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>급여 항목 설정</CardTitle>
            <CardDescription>
  급여계산서 및 급여대장에 표시될 지급항목과 공제항목의 사용 여부를 관리합니다. 4대보험 요율은 [보험요율] 메뉴에서 설정합니다.
</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            초기화
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={currentTab} onValueChange={(v) => setCurrentTab(v as "payment" | "deduction")}>
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="payment">지급항목</TabsTrigger>
              <TabsTrigger value="deduction">공제항목</TabsTrigger>
            </TabsList>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  항목 추가
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>새 {currentTab === "payment" ? "지급" : "공제"} 항목 추가</DialogTitle>
                  <DialogDescription>
  {currentTab === "payment" ? "지급" : "공제"} 항목 정보를 입력하세요.
  정액은 전 직원에게 동일 금액으로 적용되고, 수동입력은 직원별 급여항목 설정에서 개별 금액을 입력합니다.
</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="add-name">항목명 *</Label>
                    <Input
                      id="add-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="항목명 입력"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="add-calculationType">계산방식</Label>
                    <Select
                      value={formData.calculationType}
                      onValueChange={(value: "fixed" | "percentage" | "manual") =>
  setFormData({
    ...formData,
    calculationType: value,
    defaultValue: value === "manual" ? "" : formData.defaultValue,
  })
}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">정액</SelectItem>
                        <SelectItem value="percentage">비율(%)</SelectItem>
                        <SelectItem value="manual">수동입력</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="add-defaultValue">
                      기본값 {formData.calculationType === "percentage" ? "(%)" : "(원)"}
                    </Label>
                    <Input
                      id="add-defaultValue"
                      type="number"
                      value={formData.defaultValue}
                      onChange={(e) => setFormData({ ...formData, defaultValue: e.target.value })}
                      placeholder={formData.calculationType === "manual" ? "수동입력 시 미적용" : "기본값 입력"}
                      disabled={formData.calculationType === "manual"}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="add-description">설명</Label>
                    <Input
                      id="add-description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="항목 설명 (선택)"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    취소
                  </Button>
                  <Button onClick={handleAddItem}>추가</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <TabsContent value="payment">{renderItemTable(paymentItems, "payment")}</TabsContent>
          <TabsContent value="deduction">{renderItemTable(deductionItems, "deduction")}</TabsContent>
        </Tabs>

        <ItemFormDialog
          isOpen={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSubmit={handleEditItem}
          title={`${editingItem?.type === "payment" ? "지급" : "공제"} 항목 수정`}
          submitLabel="저장"
        />
      </CardContent>
    </Card>
  );
};
