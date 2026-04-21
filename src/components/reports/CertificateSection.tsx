import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, UserCheck, UserX, Search } from 'lucide-react';
import { useEmployees, Employee } from '@/hooks/useEmployees';
import { CertificateDialog } from './CertificateDialog';
import { EmployeeCombobox } from '@/components/employee/EmployeeCombobox';

type CertificateType = 'employment' | 'career' | 'resignation';

export function CertificateSection() {
  const { employees } = useEmployees();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [certType, setCertType] = useState<CertificateType>('employment');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [quickSelectId, setQuickSelectId] = useState('');

  const handleIssue = (type: CertificateType, emp: Employee) => {
    setSelectedEmployee(emp);
    setCertType(type);
    setDialogOpen(true);
  };

  const handleQuickSelect = (empId: string) => {
    setQuickSelectId('');
    const emp = employees.find(e => e.id === empId);
    if (emp) {
      // Scroll to the employee row or just highlight — open employment cert by default
      handleIssue('employment', emp);
    }
  };

  // 재직 직원과 퇴직 직원 분리
  const activeEmployees = employees.filter(e => e.is_active);
  const inactiveEmployees = employees.filter(e => !e.is_active);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            증명서 발급
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            직원을 선택하여 재직증명서, 경력증명서, 퇴직증명서를 발급할 수 있습니다.
          </p>

          {/* 직원 검색 콤보박스 */}
          {employees.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 max-w-sm">
                <EmployeeCombobox
                  employees={employees}
                  value={quickSelectId}
                  onValueChange={handleQuickSelect}
                  placeholder="직원 검색 후 바로 재직증명서 발급..."
                />
              </div>
            </div>
          )}

          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              등록된 직원이 없습니다.
            </p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-1">
                {/* 재직 직원 */}
                {activeEmployees.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 py-2 px-1">
                      <UserCheck className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-medium">재직 ({activeEmployees.length}명)</span>
                    </div>
                    {activeEmployees.map(emp => (
                      <EmployeeRow
                        key={emp.id}
                        employee={emp}
                        onIssue={handleIssue}
                        isActive={true}
                      />
                    ))}
                  </>
                )}

                {/* 퇴직 직원 */}
                {inactiveEmployees.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 py-2 px-1 mt-3">
                      <UserX className="w-4 h-4 text-destructive" />
                      <span className="text-sm font-medium">퇴직 ({inactiveEmployees.length}명)</span>
                    </div>
                    {inactiveEmployees.map(emp => (
                      <EmployeeRow
                        key={emp.id}
                        employee={emp}
                        onIssue={handleIssue}
                        isActive={false}
                      />
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <CertificateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type={certType}
        employee={selectedEmployee}
      />
    </>
  );
}

function EmployeeRow({
  employee,
  onIssue,
  isActive,
}: {
  employee: Employee;
  onIssue: (type: CertificateType, emp: Employee) => void;
  isActive: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{employee.name}</span>
        <span className="text-xs text-muted-foreground">{employee.employee_number}</span>
        <span className="text-xs text-muted-foreground">{employee.department || ''}</span>
        <span className="text-xs text-muted-foreground">{employee.position || ''}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => onIssue('employment', employee)}
        >
          재직증명서
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => onIssue('career', employee)}
        >
          경력증명서
        </Button>
        {!isActive && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => onIssue('resignation', employee)}
          >
            퇴직증명서
          </Button>
        )}
      </div>
    </div>
  );
}
