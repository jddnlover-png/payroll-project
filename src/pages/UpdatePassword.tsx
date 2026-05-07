import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UpdatePassword() {
  const [password, setPassword] = useState("");

  const handleUpdate = async () => {
    if (!password) {
      alert("비밀번호 입력");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      alert("비밀번호 변경 완료");
      window.location.href = "/auth";
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 max-w-sm mx-auto">
      <h2 className="text-lg font-bold">새 비밀번호 설정</h2>

      <Input
        type="password"
        placeholder="새 비밀번호"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <Button onClick={handleUpdate}>
        비밀번호 변경
      </Button>
    </div>
  );
}