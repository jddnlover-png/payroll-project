import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Printer } from 'lucide-react';
import { Employee } from '@/hooks/useEmployees';
import { useOrganization } from '@/contexts/OrganizationContext';
import { format, differenceInMonths, differenceInYears } from 'date-fns';

type CertificateType = 'employment' | 'career' | 'resignation';

interface CertificateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: CertificateType;
  employee: Employee | null;
}

const TITLES: Record<CertificateType, string> = {
  employment: '재직증명서',
  career: '경력증명서',
  resignation: '퇴직증명서',
};

function maskResidentNumber(rn: string | null): string {
  if (!rn) return '';
  // 123456-1234567 → 123456-1******
  const cleaned = rn.replace(/[^0-9]/g, '');
  if (cleaned.length >= 7) {
    return cleaned.slice(0, 6) + ' -' + cleaned[6] + '*****';
  }
  return rn;
}

function calcPeriodText(hireDate: string, endDate: string | null): string {
  const start = new Date(hireDate);
  const end = endDate ? new Date(endDate) : new Date();
  const startStr = format(start, 'yyyy.MM.dd');
  const endStr = endDate ? format(end, 'yyyy.MM.dd') : '현재';

  const totalMonths = differenceInMonths(end, start);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  let periodDesc = '';
  if (years > 0 && months > 0) periodDesc = `(${String(years).padStart(2, '0')}년 ${String(months).padStart(2, '0')}개월)`;
  else if (years > 0) periodDesc = `(${String(years).padStart(2, '0')}년)`;
  else periodDesc = `(${String(months).padStart(2, '0')}개월)`;

  return `${startStr} ~ ${endStr} ${periodDesc}`;
}

export function CertificateDialog({
  open,
  onOpenChange,
  type,
  employee,
}: CertificateDialogProps) {
  const { currentOrganization } = useOrganization();
  const [issueNumber, setIssueNumber] = useState('');
  const [purpose, setPurpose] = useState('금융기관 제출');
  const [additionalNote, setAdditionalNote] = useState('');

  const title = TITLES[type];

  if (!employee) return null;

  const periodText = calcPeriodText(
    employee.hire_date,
    type === 'resignation' ? employee.resignation_date || null : null
  );

  const today = format(new Date(), 'yyyy년 MM월 dd일');

  const getCertificationText = () => {
    const hireDateFormatted = format(new Date(employee.hire_date), 'yyyy년 MM월dd일');
    if (type === 'resignation') {
      const resignDate = employee.resignation_date;
      const resignFormatted = resignDate
        ? format(new Date(resignDate), 'yyyy년 MM월dd일')
        : '미정';
      return `상기인은 ${hireDateFormatted} 입사하여 ${resignFormatted}로\n퇴직하였음을 증명함.`;
    }
    return '상기의 사실을 증명함.';
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title} - ${employee.name}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; font-size: 13px; color: #333; padding: 40px; }
  .certificate { max-width: 700px; margin: 0 auto; border: 2px solid #333; padding: 40px; }
  .title { text-align: center; font-size: 28px; font-weight: bold; margin-bottom: 30px; letter-spacing: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th, td { border: 1px solid #999; padding: 10px 14px; font-size: 13px; }
  th { background: #f0f5ff; font-weight: 600; width: 100px; text-align: center; white-space: nowrap; }
  td { text-align: left; }
  .purpose-row { display: flex; gap: 20px; align-items: center; }
  .purpose-item { display: flex; align-items: center; gap: 4px; }
  .purpose-item .circle { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #666; border-radius: 50%; text-align: center; line-height: 12px; font-size: 10px; }
  .purpose-item .circle.selected { background: #3b82f6; border-color: #3b82f6; color: white; }
  .note-area { border: 1px solid #ccc; border-radius: 4px; padding: 12px; color: #999; font-size: 12px; min-height: 40px; margin-bottom: 20px; }
  .cert-text { text-align: center; font-size: 15px; line-height: 1.8; margin: 24px 0; white-space: pre-line; }
  .date-text { text-align: center; font-size: 14px; margin: 24px 0; }
  .company-info { text-align: center; margin-top: 20px; }
  .company-name { font-size: 16px; font-weight: bold; }
  .seal { display: inline-block; border: 2px solid #e53e3e; color: #e53e3e; border-radius: 50%; width: 50px; height: 50px; line-height: 50px; text-align: center; font-weight: bold; font-size: 13px; margin-left: 12px; }
  @media print { body { padding: 0; } .certificate { border: 2px solid #333; } }
</style>
</head>
<body>
<div class="certificate">
  <div class="title">${title}</div>
  <table>
    <tr><th>발급번호</th><td colspan="3">${issueNumber}</td></tr>
    <tr>
      <th>성명</th><td>${employee.name}</td>
      <th>주민등록번호</th><td>${maskResidentNumber(employee.resident_number)}</td>
    </tr>
    <tr><th>소속</th><td colspan="3">${employee.department || ''}</td></tr>
    <tr>
      <th>직위(직급)</th><td>${employee.position || ''}</td>
      <th>직책</th><td></td>
    </tr>
    <tr><th>주소</th><td colspan="3"></td></tr>
    <tr><th>재직기간</th><td colspan="3">${periodText}</td></tr>
    <tr><th>용도</th><td colspan="3">
      <div class="purpose-row">
        ${['금융기관 제출', '관공서 제출', '학교 제출', '기타'].map(p =>
          `<span class="purpose-item"><span class="circle ${purpose === p ? 'selected' : ''}">${purpose === p ? '●' : ''}</span> ${p}</span>`
        ).join('')}
      </div>
    </td></tr>
  </table>
  ${additionalNote
    ? `<div class="note-area">${additionalNote}</div>`
    : `<div class="note-area" style="color:#bbb;">${title} 발급시 추가로 기재할 특이사항을 입력하세요.</div>`
  }
  <div class="cert-text">${getCertificationText()}</div>
  <div class="date-text">${today}</div>
  <div class="company-info">
    <span class="company-name">${currentOrganization?.name || ''}</span>
    ${currentOrganization?.representative ? `<br/>대표이사 ${currentOrganization.representative}` : ''}
    <span class="seal">인</span>
  </div>
</div>
<script>window.onload = function() { window.print(); }</script>
</body>
</html>`;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const purposes = ['금융기관 제출', '관공서 제출', '학교 제출', '기타'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title} 발급</DialogTitle>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" />
            발급
          </Button>
        </div>

        {/* 미리보기 */}
        <div className="border-2 border-foreground/20 rounded-lg p-6 space-y-4">
          <h2 className="text-2xl font-bold text-center tracking-[8px]">{title}</h2>

          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr>
                <th className="border border-border bg-muted p-2 w-24 text-center font-semibold">발급번호</th>
                <td className="border border-border p-2" colSpan={3}>
                  <Input
                    value={issueNumber}
                    onChange={e => setIssueNumber(e.target.value)}
                    placeholder="발급번호 입력"
                    className="h-7 text-sm border-none shadow-none p-0"
                  />
                </td>
              </tr>
              <tr>
                <th className="border border-border bg-muted p-2 text-center font-semibold">성명</th>
                <td className="border border-border p-2 font-medium">{employee.name}</td>
                <th className="border border-border bg-muted p-2 text-center font-semibold">주민등록번호</th>
                <td className="border border-border p-2">{maskResidentNumber(employee.resident_number)}</td>
              </tr>
              <tr>
                <th className="border border-border bg-muted p-2 text-center font-semibold">소속</th>
                <td className="border border-border p-2" colSpan={3}>{employee.department || ''}</td>
              </tr>
              <tr>
                <th className="border border-border bg-muted p-2 text-center font-semibold">직위(직급)</th>
                <td className="border border-border p-2">{employee.position || ''}</td>
                <th className="border border-border bg-muted p-2 text-center font-semibold">직책</th>
                <td className="border border-border p-2"></td>
              </tr>
              <tr>
                <th className="border border-border bg-muted p-2 text-center font-semibold">주소</th>
                <td className="border border-border p-2" colSpan={3}></td>
              </tr>
              <tr>
                <th className="border border-border bg-muted p-2 text-center font-semibold">재직기간</th>
                <td className="border border-border p-2" colSpan={3}>{periodText}</td>
              </tr>
              <tr>
                <th className="border border-border bg-muted p-2 text-center font-semibold">용도</th>
                <td className="border border-border p-2" colSpan={3}>
                  <RadioGroup
                    value={purpose}
                    onValueChange={setPurpose}
                    className="flex flex-wrap gap-4"
                  >
                    {purposes.map(p => (
                      <div key={p} className="flex items-center gap-1">
                        <RadioGroupItem value={p} id={`purpose-${p}`} />
                        <Label htmlFor={`purpose-${p}`} className="text-sm cursor-pointer">{p}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </td>
              </tr>
            </tbody>
          </table>

          <Textarea
            value={additionalNote}
            onChange={e => setAdditionalNote(e.target.value)}
            placeholder={`${title} 발급시 추가로 기재할 특이사항을 입력하세요.`}
            className="text-sm"
            rows={2}
          />

          <p className="text-center text-base leading-relaxed whitespace-pre-line">
            {getCertificationText()}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
