import { AttendanceEditLogsReport } from "@/components/reports/AttendanceEditLogsReport";
import { CertificateSection } from "@/components/reports/CertificateSection";
import { SalaryPaymentReport } from "@/components/reports/SalaryPaymentReport";
import { MonthlyTrendReport } from "@/components/reports/MonthlyTrendReport";
import { AnnualSalaryReport } from "@/components/reports/AnnualSalaryReport";
import { DeductionSummaryReport } from "@/components/reports/DeductionSummaryReport";

interface ReportsTabProps {
  section?: string;
}

export function ReportsTab({ section = "salary-payment" }: ReportsTabProps) {
    return (
    <div className="space-y-6">
      {section === "salary-payment" && <SalaryPaymentReport />}
      {section === "monthly-trend" && <MonthlyTrendReport />}
      {section === "annual-salary" && <AnnualSalaryReport />}
      {section === "deduction-summary" && <DeductionSummaryReport />}
      {section === "certificate" && <CertificateSection />}
      {section === "editlogs" && <AttendanceEditLogsReport />}
    </div>
  );
}
