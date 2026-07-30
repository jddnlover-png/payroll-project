import { useNavigate } from "react-router-dom";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Building2,
  FileText,
  Plus,
  Shield,
  User,
} from "lucide-react";

function ManualGuideDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1"
        >
          <BookOpen className="h-4 w-4" />
          사용설명서
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>급여뚝딱 사용설명서</DialogTitle>
          <DialogDescription>
            급여 유형에 맞는 설명서를 선택하세요. 설명서는 새 탭에서
            열립니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <Button
            asChild
            variant="outline"
            className="h-auto justify-start p-4"
          >
            <a
              href="/manuals/monthly-salary-guide.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText className="mr-3 h-5 w-5 shrink-0 text-blue-600" />

              <div className="text-left">
                <div className="font-medium">월급제 사용설명서</div>
                <div className="mt-1 text-xs font-normal text-muted-foreground">
                  초기 설정부터 첫 급여계산·명세서 확인까지
                </div>
              </div>
            </a>
          </Button>

          <Button
            asChild
            variant="outline"
            className="h-auto justify-start p-4"
          >
            <a
              href="/manuals/hourly-wage-guide.pdf"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText className="mr-3 h-5 w-5 shrink-0 text-green-600" />

              <div className="text-left">
                <div className="font-medium">시급제 사용설명서</div>
                <div className="mt-1 text-xs font-normal text-muted-foreground">
                  근태 입력부터 시급제 급여계산·결과 확인까지
                </div>
              </div>
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OrganizationSwitcher() {
  const navigate = useNavigate();

  const {
    organizations,
    currentOrganization,
    setCurrentOrganization,
    userRole,
  } = useOrganization();

  if (organizations.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <ManualGuideDialog />

        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/onboarding")}
        >
          <Plus className="mr-2 h-4 w-4" />
          사업장 추가
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentOrganization?.id || ""}
        onValueChange={(value) => {
          const org = organizations.find((item) => item.id === value);

          if (org) {
            setCurrentOrganization(org);
          }
        }}
      >
        <SelectTrigger className="w-[200px]">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="업체 선택" />
          </div>
        </SelectTrigger>

        <SelectContent>
          {organizations.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              {org.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Badge
        variant={userRole === "admin" ? "default" : "secondary"}
        className="h-7"
      >
        {userRole === "admin" ? (
          <>
            <Shield className="mr-1 h-3 w-3" />
            관리자
          </>
        ) : (
          <>
            <User className="mr-1 h-3 w-3" />
            일반
          </>
        )}
      </Badge>

      <ManualGuideDialog />

      <Button
        variant="outline"
        size="sm"
        className="flex items-center gap-1"
        onClick={() => navigate("/onboarding")}
      >
        <Plus className="h-4 w-4" />
        사업장 추가
      </Button>
    </div>
  );
}