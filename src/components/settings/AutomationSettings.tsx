import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface AutomationSettingsProps {
  autoCheckout: boolean;
  emailNotification: boolean;
  slackNotification: boolean;
  saving: boolean;
  onSave: (data: {
    auto_checkout: boolean;
    email_notification: boolean;
    slack_notification: boolean;
  }) => Promise<boolean>;
}

export function AutomationSettings({
  autoCheckout,
  emailNotification,
  slackNotification,
  saving,
  onSave,
}: AutomationSettingsProps) {
  const [autoCheck, setAutoCheck] = useState(autoCheckout);
  const [emailNotif, setEmailNotif] = useState(emailNotification);
  const [slackNotif, setSlackNotif] = useState(slackNotification);

  useEffect(() => {
    setAutoCheck(autoCheckout);
    setEmailNotif(emailNotification);
    setSlackNotif(slackNotification);
  }, [autoCheckout, emailNotification, slackNotification]);

  const handleSave = async () => {
    const success = await onSave({
      auto_checkout: autoCheck,
      email_notification: emailNotif,
      slack_notification: slackNotif,
    });
    if (success) {
      toast.success('자동화 설정이 저장되었습니다.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">자동화</CardTitle>
        <CardDescription>자동 처리 옵션을 설정합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>자동 퇴근 처리</Label>
            <p className="text-sm text-muted-foreground">
              퇴근 시간이 지나면 자동으로 퇴근 처리
            </p>
          </div>
          <Switch
            checked={autoCheck}
            onCheckedChange={setAutoCheck}
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <Label>이메일 알림</Label>
            <p className="text-sm text-muted-foreground">
              근태 이상 시 관리자에게 이메일 발송
            </p>
          </div>
          <Switch
            checked={emailNotif}
            onCheckedChange={setEmailNotif}
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <Label>Slack 알림</Label>
            <p className="text-sm text-muted-foreground">
              근태 이상 시 Slack 채널로 알림 발송
            </p>
          </div>
          <Switch
            checked={slackNotif}
            onCheckedChange={setSlackNotif}
          />
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            저장
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
