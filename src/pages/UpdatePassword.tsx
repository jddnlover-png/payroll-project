import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UpdatePassword() {
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const prepareSession = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }

      setReady(true);
    };

    prepareSession();
  }, []);

  const handleUpdate = async () => {
    if (!password) {
      alert("새 비밀번호를 입력하세요.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("비밀번호 변경 완료");
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  if (!ready) {
    return <div className="p-6">비밀번호 변경 준비 중...</div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h2 className="text-lg font-bold">새 비밀번호 설정</h2>

        <Input
          type="password"
          placeholder="새 비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button onClick={handleUpdate} disabled={loading} className="w-full">
          {loading ? "변경 중..." : "비밀번호 변경"}
        </Button>
      </div>
    </div>
  );
}