import { Printer, FileDown, X } from "lucide-react";
import { exportToExcel } from "@/utils/exportExcel";

const printStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Malgun Gothic', sans-serif; font-size: 11px; padding: 20px; }
  h1 { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 6px; }
  h2 { font-size: 12px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px; }
  th, td { border: 1px solid #555; padding: 3px 6px; }
  th { background-color: #e8e8e8; font-weight: bold; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .font-bold { font-weight: bold; }
  .bg-gray { background-color: #f5f5f5; }
  .total-row { background-color: #f0f0f0; font-weight: bold; }
  @media print { body { padding: 10px; } @page { size: A4 landscape; margin: 10mm; } }
`;

interface PrintPreviewModalProps {
  title: string;
  subtitle?: string;
  contentId: string;
  excelFilename: string;
  excelSheetName: string;
  excelHeaders: string[];
  excelRows: (string | number)[][];
  onClose: () => void;
  children: React.ReactNode;
}

export function PrintPreviewModal({
  title,
  subtitle,
  contentId,
  excelFilename,
  excelSheetName,
  excelHeaders,
  excelRows,
  onClose,
  children,
}: PrintPreviewModalProps) {
  // 인쇄
  const handlePrint = () => {
    const content = document.getElementById(contentId);
    if (!content) return;
    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <title>${title}</title>
        <style>${printStyles}</style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 500);
  };

  // PDF 저장 (인쇄 대화상자에서 PDF로 저장)
  const handlePDF = () => {
    const content = document.getElementById(contentId);
    if (!content) return;
    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <title>${title}</title>
        <style>${printStyles}</style>
      </head>
      <body>
        ${content.innerHTML}
        <script>window.onload=function(){ window.print(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // 엑셀 저장
  const handleExcel = async () => {
    await exportToExcel(excelFilename, excelSheetName, excelHeaders, excelRows);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-white w-full max-w-6xl rounded-lg shadow-xl">
        {/* 버튼 영역 */}
        <div className="flex justify-end gap-2 p-4 border-b print:hidden">
          <button
            onClick={handleExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
          >
            <FileDown className="w-4 h-4" />
            엑셀 저장
          </button>
          <button
            onClick={handlePDF}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            <FileDown className="w-4 h-4" />
            PDF 저장
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            <Printer className="w-4 h-4" />
            인쇄
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 border rounded text-sm hover:bg-gray-50"
          >
            <X className="w-4 h-4" />
            닫기
          </button>
        </div>

        {/* 미리보기 콘텐츠 */}
        <div className="px-8 py-6" id={contentId}>
          <h1 className="text-center text-2xl font-bold mb-2">{title}</h1>
          {subtitle && <p className="text-center text-sm text-gray-500 mb-6">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
