import { useNavigate } from 'react-router-dom';
import { useOrganization } from '@/contexts/OrganizationContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, Shield, User } from 'lucide-react';

export function OrganizationSwitcher() {
  const navigate = useNavigate();
  const { organizations, currentOrganization, setCurrentOrganization, userRole } = useOrganization();

  if (organizations.length === 0) {
    return (
      <Button variant="outline" size="sm" onClick={() => navigate('/onboarding')}>
        <Plus className="h-4 w-4 mr-2" />
        업체 추가
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentOrganization?.id || ''}
        onValueChange={(value) => {
          const org = organizations.find((o) => o.id === value);
          if (org) setCurrentOrganization(org);
        }}
      >
        <SelectTrigger className="w-[200px]">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="업체 선택" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {organizations.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              {org.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Badge variant={userRole === 'admin' ? 'default' : 'secondary'} className="h-7">
        {userRole === 'admin' ? (
          <>
            <Shield className="h-3 w-3 mr-1" />
            관리자
          </>
        ) : (
          <>
            <User className="h-3 w-3 mr-1" />
            일반
          </>
        )}
      </Badge>

      <Button variant="ghost" size="icon" onClick={() => navigate('/onboarding')}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
