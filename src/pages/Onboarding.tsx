import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Building2, Phone, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Onboarding() {
  const navigate = useNavigate();
  const { refreshOrganizations } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);

  // Step 1
  const [orgName, setOrgName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');

  // Step 2
  const [employeeSize, setEmployeeSize] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const handleCreateAndNext = () => {
    if (!orgName.trim()) {
      toast.error('회사명을 입력해주세요');
      return;
    }
    setStep(2);
  };

  const handleComplete = async (skipPhone = false) => {
  if (!skipPhone && !phoneNumber.trim()) {
    toast.error('설정 도움을 받으려면 전화번호를 입력해주세요');
    return;
  }

  setLoading(true);
  try {
    const { data: orgId, error } = await supabase.rpc('create_organization_with_owner', {
  _name: orgName.trim(),
  _business_number: businessNumber.trim() || null,
  _representative: null,
});

    if (error) throw error;
if (!orgId) throw new Error('업체 ID가 생성되지 않았습니다.');

if (employeeSize || (!skipPhone && phoneNumber)) {
  const { error: updateError } = await supabase
    .from('organizations')
    .update({
      employee_size: employeeSize || null,
      phone_number: skipPhone ? null : phoneNumber.trim() || null,
    })
    .eq('id', orgId);

  if (updateError) throw updateError;
}

    if (!skipPhone) {
      const { error: helpError } = await supabase.rpc('submit_setup_help_request', {
  _organization_id: orgId,
  _contact_mobile: phoneNumber.trim(),
  _employee_size: employeeSize || null,
  _company_name: orgName.trim(),
  _business_number: businessNumber.trim() || null,
});

      if (helpError) throw helpError;
    }

    toast.success(skipPhone ? '업체가 생성되었습니다!' : '업체가 생성되고 설정 도움 요청이 접수되었습니다!');
    await refreshOrganizations();
    navigate('/');
  } catch (error: any) {
  console.error('Error creating organization:', error);
  toast.error(error?.message || '업체 생성 중 오류가 발생했습니다');
} finally {
    setLoading(false);
  }
};

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/3 p-4">
      <Card className="w-full max-w-lg shadow-2xl border-0 bg-card/90 backdrop-blur overflow-hidden">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="flex justify-center mb-1">
            <div className="p-3 rounded-full bg-primary/10">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">시작하기</CardTitle>
          <CardDescription>
  {step === 1 ? '회사 정보를 입력해주세요' : '초기 설정을 빠르게 도와드립니다'}
</CardDescription>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-3 pt-2">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    step >= s
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {step > s ? <Check className="h-4 w-4" /> : s}
                </div>
                {s < 2 && (
                  <div className={`w-12 h-0.5 ${step > 1 ? 'bg-primary' : 'bg-muted'} transition-colors`} />
                )}
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <AnimatePresence mode="wait" custom={step}>
            {step === 1 ? (
              <motion.div
                key="step1"
                custom={1}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="orgName">회사명 *</Label>
                    <Input
                      id="orgName"
                      placeholder="예: (주)우리회사"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessNumber">사업자등록번호</Label>
                    <Input
                      id="businessNumber"
                      placeholder="000-00-00000"
                      value={businessNumber}
                      onChange={(e) => setBusinessNumber(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <Button
                    className="w-full mt-2 group"
                    onClick={handleCreateAndNext}
                    disabled={loading}
                  >
                    다음
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="step2"
                custom={1}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3 }}
              >
                <div className="space-y-4">
                  <div className="text-center mb-2">
                    <Phone className="h-8 w-8 text-primary mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      전화번호를 남겨주시면 담당자가 초기 설정을 도와드립니다.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>직원 수</Label>
                    <Select value={employeeSize} onValueChange={setEmployeeSize}>
                      <SelectTrigger>
                        <SelectValue placeholder="직원 수 선택" />
                      </SelectTrigger>
                      <SelectContent>
  <SelectItem value="under_10">10인 이하</SelectItem>
  <SelectItem value="11_30">11~30인 이하</SelectItem>
  <SelectItem value="31_60">31~60인 이하</SelectItem>
  <SelectItem value="over_60">60인 이상</SelectItem>
</SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">전화번호</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="010-0000-0000"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      className="flex-shrink-0"
                      onClick={() => setStep(1)}
                      disabled={loading}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => handleComplete(false)}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      설정 도움 받기
                    </Button>
                  </div>

                  <button
                    type="button"
                    className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                    onClick={() => handleComplete(true)}
                    disabled={loading}
                  >
                  나중에 도움 받기
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
