import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SiteManagementTab } from "./SiteManagementTab";
import { DailyAttendanceTab } from "./DailyAttendanceTab";
import { PayrollLaborTab } from "./PayrollLaborTab";
import { BatchRegistrationDialog } from "./BatchRegistrationDialog";
import { BulkAttendanceSheet } from "./BulkAttendanceSheet";
import { DailyPayrollSettingsPanel } from "@/components/settings/DailyPayrollSettingsPanel";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useConstructionSites } from "@/hooks/useConstructionSites";
import { useAttendanceLock } from "@/hooks/useAttendanceLock";
import { JobTypeTab } from "./JobTypeTab";
import { Building2, Briefcase, Calendar, CalendarRange, DollarSign, Settings, Users } from "lucide-react";
import { toast } from "sonner";

export function ConstructionSiteManager() {
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [attendanceSubTab, setAttendanceSubTab] = useState<"single" | "bulk">("single");
  const { currentOrganization } = useOrganization();
  const { activeSites } = useConstructionSites();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [activeSiteId, setActiveSiteId] = useState<string>(localStorage.getItem("last_construction_site") || "");
  const [activeYearMonth, setActiveYearMonth] = useState<string>(currentYearMonth);
  const [optimisticLocked, setOptimisticLocked] = useState<boolean | null>(null);

  // 확정 상태 — 최상위에서 1번만 호출
  const { lockStatus, lockAttendance, unlockAttendance } = useAttendanceLock(activeSiteId, activeYearMonth);

  // DB 조회 완료 시 optimistic 상태 초기화
  const isLocked = optimisticLocked !== null ? optimisticLocked : lockStatus.isLocked;

  return (
    <Tabs defaultValue="attendance" className="space-y-4">
      <TabsList className="h-12">
        <TabsTrigger value="attendance" className="gap-2 px-5 py-2.5 text-base">
          <Calendar className="w-4.5 h-4.5" />
          근태 입력
        </TabsTrigger>
        <TabsTrigger value="payroll" className="gap-2 px-5 py-2.5 text-base">
          <DollarSign className="w-4.5 h-4.5" />
          급여/노무대장
        </TabsTrigger>
        <TabsTrigger value="sites" className="gap-2 px-5 py-2.5 text-base">
          <Building2 className="w-4.5 h-4.5" />
          현장 관리
        </TabsTrigger>
        <TabsTrigger value="jobtypes" className="gap-2 px-5 py-2.5 text-base">
          <Briefcase className="w-4.5 h-4.5" />
          직종 관리
        </TabsTrigger>
        <TabsTrigger value="settings" className="gap-2 px-5 py-2.5 text-base">
          <Settings className="w-4.5 h-4.5" />
          급여 설정
        </TabsTrigger>
      </TabsList>

      <TabsContent value="attendance">
        <div className="flex items-center gap-1 mb-4">
          <Button
            variant={attendanceSubTab === "single" ? "default" : "outline"}
            size="sm"
            onClick={() => setAttendanceSubTab("single")}
            className="gap-1.5"
          >
            <Calendar className="w-3.5 h-3.5" />
            단건 입력
          </Button>
          <div className="w-2" />
          <Button
            variant={attendanceSubTab === "bulk" ? "default" : "outline"}
            size="sm"
            onClick={() => setAttendanceSubTab("bulk")}
            disabled={isLocked}
            className="gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            👥 일괄 입력
          </Button>
          <div className="ml-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setBatchDialogOpen(true)}
              disabled={isLocked}
            >
              <CalendarRange className="w-3.5 h-3.5" />
              기간별/날짜 선택 근태 등록
            </Button>
          </div>
        </div>

        {attendanceSubTab === "single" ? (
          <DailyAttendanceTab
            onOpenBatchDialog={() => setBatchDialogOpen(true)}
            isLocked={isLocked}
            lockAttendance={lockAttendance}
            unlockAttendance={unlockAttendance}
            siteId={activeSiteId}
            onSiteChange={(siteId) => {
              setOptimisticLocked(null);
              setActiveSiteId(siteId);
            }}
            onYearMonthChange={(ym) => {
              setOptimisticLocked(null); // 즉시 초기화 → DB 조회 결과로 대체
              setActiveYearMonth(ym);
            }}
          />
        ) : currentOrganization && activeSiteId ? (
          <BulkAttendanceSheet
            organizationId={currentOrganization.id}
            siteId={activeSiteId}
            yearMonth={activeYearMonth}
            defaultWorkDate={todayStr}
            onSaveComplete={(count) => {
              toast.success(`${count}건 저장 완료`);
              setAttendanceSubTab("single");
            }}
          />
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              현장을 선택한 후 일괄 입력을 사용해주세요.
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="sites">
        <SiteManagementTab />
      </TabsContent>
      <TabsContent value="jobtypes">
        <JobTypeTab />
      </TabsContent>
      <TabsContent value="payroll">
        <PayrollLaborTab />
      </TabsContent>
      <TabsContent value="settings">
        <DailyPayrollSettingsPanel />
      </TabsContent>

      <BatchRegistrationDialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen} />
    </Tabs>
  );
}
