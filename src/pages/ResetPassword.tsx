import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!email) {
      alert("이메일을 입력하세요.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    setLoading(false);

    if (error) {
      alert(error.message);
    } else {
      alert("비밀번호 재설정 메일을 보냈습니다.");
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 max-w-sm mx-auto">
      <h2 className="text-lg font-bold">비밀번호 찾기</h2>

      <Input
        placeholder="이메일 입력"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <Button onClick={handleReset} disabled={loading}>
        {loading ? "전송 중..." : "재설정 메일 보내기"}
      </Button>
    </div>
  );
}