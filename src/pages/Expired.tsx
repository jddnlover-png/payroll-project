import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, LogOut } from "lucide-react";
import { toast } from "sonner";

export default function Expired() {
  const { signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
      window.location.replace("/auth");
    } catch {
      toast.error("로그아웃 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">무료체험 기간이 종료되었습니다</CardTitle>
        </CardHeader>

        <CardContent className="space-y-5 text-sm">
          <p className="text-center text-muted-foreground leading-relaxed">
            서비스 이용을 계속하려면 입금 후 관리자에게 확인 요청을 해주세요.
          </p>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="font-semibold">입금 계좌</div>
            <div>은행명: 입력 필요</div>
            <div>계좌번호: 입력 필요</div>
            <div>예금주: 입력 필요</div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <div className="font-semibold">문의</div>
            <div>전화번호: 입력 필요</div>
            <div>이메일: 입력 필요</div>
          </div>

          <Button variant="outline" className="w-full" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            로그아웃
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}