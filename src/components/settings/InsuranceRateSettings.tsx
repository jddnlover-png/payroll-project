import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import { usePayrollSettingsStore } from "@/store/payrollSettingsStore";

const INSURANCE_ITEMS = [
  {
    id: "national-pension",
    label: "국민연금",
    description: "기준소득월액 × 요율",
  },
  {
    id: "health-insurance",
    label: "건강보험",
    description: "보수월액 × 요율",
  },
  {
    id: "long-term-care",
    label: "장기요양보험",
    description: "건강보험료 × 요율",
  },
  {
    id: "employment-insurance",
    label: "고용보험",
    description: "지급총액 × 요율",
  },
];

export const InsuranceRateSettings = () => {
  const { deductionItems, updateDeductionItem } = usePayrollSettingsStore();

  const getItem = (id: string) => deductionItems.find((item) => item.id === id);

  const handleChange = (id: string, value: string) => {
    const rate = value === "" ? undefined : Number(value);

    updateDeductionItem(id, {
      defaultValue: Number.isFinite(rate) ? rate : undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          <div>
            <CardTitle>정기급여 보험요율 설정</CardTitle>
            <CardDescription>
              정기급여 계산에 적용할 회사 공통 보험요율을 설정합니다. 직원별 개별 요율은 적용되지 않습니다.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {INSURANCE_ITEMS.map((insurance) => {
          const item = getItem(insurance.id);

          return (
            <div
              key={insurance.id}
              className="grid grid-cols-1 gap-2 rounded-lg border p-4 md:grid-cols-[180px_1fr_140px]"
            >
              <div>
                <Label className="font-medium">{insurance.label}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{insurance.description}</p>
              </div>

              <div className="text-sm text-muted-foreground">
                {item?.description || "보험요율 설정값을 기준으로 자동 계산됩니다."}
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={item?.defaultValue ?? ""}
                  onChange={(e) => handleChange(insurance.id, e.target.value)}
                  className="text-right"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          );
        })}

        <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          장기요양보험은 기준금액이 아니라 <strong>건강보험료 × 장기요양보험 요율</strong>로 계산됩니다.
        </div>
      </CardContent>
    </Card>
  );
};