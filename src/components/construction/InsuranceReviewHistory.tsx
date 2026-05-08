import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useWorkerInsuranceReviewLogs } from "@/hooks/useWorkerInsuranceReviewLogs";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}

export function InsuranceReviewHistory({
  open,
  onClose,
  organizationId,
}: Props) {
  const today = new Date();

  const [yearMonth, setYearMonth] = useState(
    format(today, "yyyy-MM")
  );

  const { logs, loading } =
    useWorkerInsuranceReviewLogs(
      organizationId,
      yearMonth
    );

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) =>
      b.reviewed_at.localeCompare(a.reviewed_at)
    );
  }, [logs]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            보험 검토 확인 이력
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4">
          <input
            type="month"
            value={yearMonth}
            onChange={(e) =>
              setYearMonth(e.target.value)
            }
            className="border rounded px-2 py-1 text-sm"
          />
        </div>

        <div className="border rounded-md overflow-auto max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>확인일시</TableHead>
                <TableHead>성명</TableHead>
                <TableHead>구분</TableHead>
                <TableHead>근무일수</TableHead>
                <TableHead>총소득</TableHead>
                <TableHead>검토내용</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-10"
                  >
                    불러오는 중...
                  </TableCell>
                </TableRow>
              ) : sortedLogs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-10 text-muted-foreground"
                  >
                    확인 이력이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                sortedLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {format(
                        new Date(log.reviewed_at),
                        "yyyy.MM.dd HH:mm"
                      )}
                    </TableCell>

                    <TableCell className="font-medium">
                      {log.worker_name}
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={
                          log.insurance_type === "pension"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {log.insurance_type === "pension"
                          ? "국민연금"
                          : "건강보험"}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {log.work_days ?? "-"}일
                    </TableCell>

                    <TableCell>
                      {log.total_income != null
                        ? new Intl.NumberFormat(
                            "ko-KR"
                          ).format(log.total_income)
                        : "-"}
                    </TableCell>

                    <TableCell className="text-sm whitespace-pre-wrap">
                      {log.review_message}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}