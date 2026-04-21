import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Lock, LockOpen, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Props {
  siteId: string;
  yearMonth: string;
  isLocked?: boolean;
  lockAttendance?: () => Promise<boolean>;
  unlockAttendance?: () => Promise<boolean>;
}

export function AttendanceLockButton({
  siteId,
  yearMonth,
  isLocked: isLockedProp,
  lockAttendance: lockProp,
  unlockAttendance: unlockProp,
}: Props) {
  const isLocked = isLockedProp ?? false;
  const lockAttendance = lockProp;
  const unlockAttendance = unlockProp;

  const [showLockDialog, setShowLockDialog] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [y, m] = yearMonth.split("-");
  const displayMonth = `${y}년 ${parseInt(m)}월`;

  const handleLock = async () => {
    if (!lockAttendance) return;

    setIsProcessing(true);
    const success = await lockAttendance();
    setIsProcessing(false);
    setShowLockDialog(false);

    if (success) {
      toast.success(`${displayMonth} 근태가 확정되었습니다.`);
    } else {
      toast.error("확정 처리 중 오류가 발생했습니다.");
    }
  };

  const handleUnlock = async () => {
    if (!unlockAttendance) return;

    setIsProcessing(true);
    const success = await unlockAttendance();
    setIsProcessing(false);
    setShowUnlockDialog(false);

    if (success) {
      toast.success(`${displayMonth} 근태 확정이 해제되었습니다.`);
    } else {
      toast.error("확정 해제 중 오류가 발생했습니다.");
    }
  };

  if (!siteId) return null;

  return (
    <>
      {isLocked ? (
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50
                          border border-green-200 rounded-md text-sm text-green-700"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>{displayMonth} 확정완료</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUnlockDialog(true)}
            className="text-orange-600 border-orange-300 hover:bg-orange-50"
          >
            <LockOpen className="h-3.5 w-3.5 mr-1" />
            확정 해제
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLockDialog(true)}
          className="text-blue-600 border-blue-300 hover:bg-blue-50"
        >
          <Lock className="h-3.5 w-3.5 mr-1" />
          {displayMonth} 확정
        </Button>
      )}

      <AlertDialog open={showLockDialog} onOpenChange={setShowLockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{displayMonth} 근태를 확정하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              확정 후에는 근태 수정이 불가능합니다.
              <br />
              수정이 필요한 경우 확정을 해제 후 수정할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleLock} disabled={isProcessing}>
              {isProcessing ? "처리 중..." : "확정"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showUnlockDialog} onOpenChange={setShowUnlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              확정을 해제하시겠습니까?
            </AlertDialogTitle>
            <AlertDialogDescription>
              확정을 해제하면 근태 수정이 가능해집니다.
              <br />
              수정 완료 후 반드시 다시 확정해 주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlock}
              disabled={isProcessing}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {isProcessing ? "처리 중..." : "확정 해제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
