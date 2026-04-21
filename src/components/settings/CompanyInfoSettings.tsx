import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Loader2, Save, Check } from 'lucide-react';

export function CompanyInfoSettings() {
  const { currentOrganization, refreshOrganizations } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [companyInfo, setCompanyInfo] = useState({
    name: '',
    businessNumber: '',
    representative: '',
    address: '',
    phone: '',
    email: '',
    logoUrl: '',
  });

  // 조직 정보 로드
  useEffect(() => {
    if (currentOrganization) {
      setCompanyInfo({
        name: currentOrganization.name || '',
        businessNumber: currentOrganization.business_number || '',
        representative: currentOrganization.representative || '',
        address: currentOrganization.address || '',
        phone: currentOrganization.phone || '',
        email: currentOrganization.email || '',
        logoUrl: '', // 로고는 별도로 관리
      });
      setSaved(true); // 이미 저장된 정보
    }
  }, [currentOrganization]);

  const handleSave = async () => {
    if (!currentOrganization) {
      toast.error('조직 정보를 찾을 수 없습니다');
      return;
    }

    if (!companyInfo.name.trim()) {
      toast.error('회사명은 필수 입력 항목입니다');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: companyInfo.name.trim(),
          business_number: companyInfo.businessNumber.trim() || null,
          representative: companyInfo.representative.trim() || null,
          address: companyInfo.address.trim() || null,
          phone: companyInfo.phone.trim() || null,
          email: companyInfo.email.trim() || null,
        })
        .eq('id', currentOrganization.id);

      if (error) throw error;

      await refreshOrganizations();
      setSaved(true);
      toast.success('회사 정보가 저장되었습니다');
    } catch (error: any) {
      console.error('Error saving company info:', error);
      toast.error('저장 중 오류가 발생했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof typeof companyInfo, value: string) => {
    setCompanyInfo(prev => ({ ...prev, [field]: value }));
    setSaved(false); // 수정 시 저장 상태 해제
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">회사 정보</CardTitle>
            <CardDescription>기본 회사 정보를 설정합니다. 급여명세서에 표시됩니다.</CardDescription>
          </div>
          {saved && (
            <div className="flex items-center gap-1 text-sm text-green-600">
              <Check className="h-4 w-4" />
              저장됨
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>회사명 <span className="text-destructive">*</span></Label>
            <Input
              value={companyInfo.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="주식회사 OOO"
            />
          </div>
          <div className="space-y-2">
            <Label>사업자등록번호</Label>
            <Input
              value={companyInfo.businessNumber}
              onChange={(e) => handleChange('businessNumber', e.target.value)}
              placeholder="000-00-00000"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>대표자명</Label>
            <Input
              value={companyInfo.representative}
              onChange={(e) => handleChange('representative', e.target.value)}
              placeholder="홍길동"
            />
          </div>
          <div className="space-y-2">
            <Label>대표 전화번호</Label>
            <Input
              value={companyInfo.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="02-0000-0000"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>회사 주소</Label>
          <Input
            value={companyInfo.address}
            onChange={(e) => handleChange('address', e.target.value)}
            placeholder="서울특별시 OO구 OO로 123"
          />
        </div>
        <div className="space-y-2">
          <Label>회사 이메일</Label>
          <Input
            type="email"
            value={companyInfo.email}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder="info@company.com"
          />
        </div>
        <Separator />
        <div className="space-y-2">
          <Label>회사 로고 URL</Label>
          <Input
            placeholder="https://example.com/logo.png"
            value={companyInfo.logoUrl}
            onChange={(e) => handleChange('logoUrl', e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            급여명세서 이메일에 표시될 회사 로고 이미지 URL을 입력하세요.
          </p>
          {companyInfo.logoUrl && (
            <div className="mt-3 p-3 border rounded-lg bg-muted/50">
              <Label className="text-sm mb-2 block">로고 미리보기</Label>
              <img 
                src={companyInfo.logoUrl} 
                alt="회사 로고" 
                className="max-h-16 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={saving || saved}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                저장 중...
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                저장됨
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                저장하기
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
