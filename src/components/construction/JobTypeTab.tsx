import { useState, useEffect, useRef } from 'react';
import { useJobTypes } from '@/hooks/useJobTypes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Briefcase, Plus, EyeOff } from 'lucide-react';

export function JobTypeTab() {
  const {
    jobTypes,
    isLoading,
    addJobType,
    deactivateJobType,
    initDefaultJobTypes,
  } = useJobTypes();
  const [newName, setNewName] = useState('');
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!isLoading && jobTypes.length === 0 && !hasInitialized.current) {
      hasInitialized.current = true;
      initDefaultJobTypes.mutate();
    }
  }, [isLoading, jobTypes.length]);

  const handleAdd = () => {
    if (!newName.trim()) return;
    addJobType.mutate(newName.trim(), {
      onSuccess: () => setNewName(''),
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Briefcase className="w-5 h-5" />
            직종 관리
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            근태 입력 시 사용할 직종을 관리합니다.
            회사별로 직종명을 자유롭게 설정할 수 있습니다.
          </p>

          <div className="flex items-center gap-2">
            <Input
              placeholder="새 직종명 (예: 타일공)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              maxLength={50}
              className="max-w-xs"
            />
            <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              추가
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">로딩 중...</p>
          ) : (
            <div className="space-y-1">
              {jobTypes.map(j => (
                <div key={j.id} className="flex items-center justify-between px-3 py-2 border rounded-md">
                  <span className="text-sm">{j.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(
                        `'${j.name}' 직종을 숨김 처리하시겠습니까?\n기존 근태 기록은 유지됩니다.`
                      )) {
                        deactivateJobType.mutate(j.id);
                      }
                    }}
                    className="text-muted-foreground hover:text-destructive ml-1"
                    title="숨김 처리"
                  >
                    <EyeOff className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {jobTypes.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  등록된 직종이 없습니다.
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            * 숨김 처리해도 기존 근태 기록의 직종은 유지됩니다.<br />
            * 동일한 이름으로 다시 추가하면 재활성화됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
