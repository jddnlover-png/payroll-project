import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { isSuperAdmin, loading } = useSuperAdmin();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const adminLoginVerified = sessionStorage.getItem("admin_login_verified") === "true";

  if (!loading && isSuperAdmin && adminLoginVerified) {
    return <Navigate to="/admin" replace />;
  }

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setIsSubmitting(false);
      toast.error("관리자 로그인에 실패했습니다.");
      return;
    }

    const { data: isAdmin, error: roleError } = await supabase.rpc("is_super_admin" as any);

    setIsSubmitting(false);

    if (roleError || isAdmin !== true) {
      await supabase.auth.signOut();
      sessionStorage.removeItem("admin_login_verified");
      toast.error("슈퍼어드민 권한이 없는 계정입니다.");
      return;
    }

    sessionStorage.setItem("admin_login_verified", "true");
    toast.success("관리자 로그인 완료");
    navigate("/admin", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>슈퍼어드민 로그인</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">이메일</Label>
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-password">비밀번호</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "로그인 중..." : "관리자 로그인"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}