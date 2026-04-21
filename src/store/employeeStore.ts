import { create } from 'zustand';
import { Employee, AttendanceRecord, PayrollRecord, LeaveRequest, LeaveBalance, PayrollItemValue } from '@/types/employee';
import { usePayrollSettingsStore } from '@/store/payrollSettingsStore';
import { differenceInYears, differenceInMonths, parseISO } from 'date-fns';

interface LeaveSettings {
  generationType: 'monthly' | 'yearly';
  baseAnnualLeave: number;
  monthlyLeaveAmount: number;
  maxCarryOver: number;
  additionalLeavePerYear: number;
  maxAdditionalLeave: number;
}

export interface PayrollSettings {
  overtimeRate: number; // 연장근무 시급 배율 (예: 1.5)
  standardWorkHours: number; // 일일 표준 근무시간
  lateDeductionRate: number; // 지각 공제율
  absentDeductionRate: number; // 결근 공제율
  insuranceDeductionRate: number; // 4대보험 등 기본 공제율
}

export interface CompanySettings {
  companyName: string;
  companyLogoUrl: string;
  businessNumber: string;
  representativeName: string;
  address: string;
  phoneNumber: string;
  email: string;
}

const defaultPayrollSettings: PayrollSettings = {
  overtimeRate: 1.5,
  standardWorkHours: 8,
  lateDeductionRate: 0.1,
  absentDeductionRate: 1,
  insuranceDeductionRate: 0.1,
};

const defaultCompanySettings: CompanySettings = {
  companyName: '우리회사',
  companyLogoUrl: '',
  businessNumber: '',
  representativeName: '',
  address: '',
  phoneNumber: '',
  email: '',
};

interface BulkAttendanceInput {
  employeeNumber: string;
  employeeName: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: 'present' | 'late' | 'absent' | 'leave';
}

interface EmployeeStore {
  employees: Employee[];
  attendance: AttendanceRecord[];
  payroll: PayrollRecord[];
  leaveRequests: LeaveRequest[];
  leaveBalances: LeaveBalance[];
  payrollSettings: PayrollSettings;
  companySettings: CompanySettings;
  addEmployee: (employee: Employee) => void;
  updateEmployee: (id: string, employee: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;
  checkIn: (employeeId: string) => void;
  checkOut: (employeeId: string) => void;
  updatePayroll: (id: string, payroll: Partial<PayrollRecord>) => void;
  addLeaveRequest: (request: LeaveRequest) => void;
  updateLeaveRequest: (id: string, status: 'approved' | 'rejected', approvedBy?: string) => void;
  getLeaveBalance: (employeeId: string) => LeaveBalance;
  updateLeaveBalances: (settings: LeaveSettings) => void;
  updatePayrollSettings: (settings: PayrollSettings) => void;
  updateCompanySettings: (settings: CompanySettings) => void;
  calculatePayrollFromAttendance: (month: string, employeeIds?: string[], externalEmployees?: Employee[]) => void;
  getPayrollByMonth: (month: string) => PayrollRecord[];
  bulkAddAttendance: (data: BulkAttendanceInput[]) => void;
}

const today = new Date().toISOString().split('T')[0];

const initialEmployees: Employee[] = [
  {
    id: '1',
    employeeNumber: 'EMP001',
    name: '김철수',
    department: '영업팀',
    position: '대리',
    email: 'kim@company.com',
    phone: '010-1234-5678',
    hireDate: '2022-03-15',
    baseSalary: 3500000,
    payType: 'monthly',
    employmentType: 'regular',
    status: 'active',
  },
  {
    id: '2',
    employeeNumber: 'EMP002',
    name: '이영희',
    department: '개발팀',
    position: '과장',
    email: 'lee@company.com',
    phone: '010-2345-6789',
    hireDate: '2020-07-01',
    baseSalary: 4500000,
    payType: 'monthly',
    employmentType: 'regular',
    status: 'active',
  },
  {
    id: '3',
    employeeNumber: 'EMP003',
    name: '박민수',
    department: '인사팀',
    position: '사원',
    email: 'park@company.com',
    phone: '010-3456-7890',
    hireDate: '2023-01-10',
    baseSalary: 0,
    payType: 'hourly',
    hourlyRate: 15000,
    employmentType: 'daily',
    status: 'active',
  },
];

const initialAttendance: AttendanceRecord[] = initialEmployees.map((emp) => ({
  id: `att-${emp.id}`,
  employeeId: emp.id,
  employeeNumber: emp.employeeNumber,
  employeeName: emp.name,
  department: emp.department,
  date: today,
  checkIn: null,
  checkOut: null,
  status: 'absent' as const,
}));

const initialLeaveBalances: LeaveBalance[] = initialEmployees.map((emp) => ({
  employeeId: emp.id,
  totalLeave: 15,
  usedLeave: 0,
  remainingLeave: 15,
}));

export const useEmployeeStore = create<EmployeeStore>((set, get) => ({
  employees: initialEmployees,
  attendance: initialAttendance,
  payroll: [],
  leaveRequests: [],
  leaveBalances: initialLeaveBalances,
  payrollSettings: defaultPayrollSettings,
  companySettings: defaultCompanySettings,

  addEmployee: (employee) =>
    set((state) => ({
      employees: [...state.employees, employee],
      attendance: [
        ...state.attendance,
        {
          id: `att-${employee.id}`,
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          employeeName: employee.name,
          department: employee.department,
          date: today,
          checkIn: null,
          checkOut: null,
          status: 'absent',
        },
      ],
    })),

  updateEmployee: (id, updatedEmployee) =>
    set((state) => ({
      employees: state.employees.map((emp) =>
        emp.id === id ? { ...emp, ...updatedEmployee } : emp
      ),
    })),

  deleteEmployee: (id) =>
    set((state) => ({
      employees: state.employees.filter((emp) => emp.id !== id),
      attendance: state.attendance.filter((att) => att.employeeId !== id),
    })),

  checkIn: (employeeId) =>
    set((state) => {
      const now = new Date();
      const timeString = now.toTimeString().slice(0, 5);
      const isLate = now.getHours() >= 9 && now.getMinutes() > 0;

      return {
        attendance: state.attendance.map((att) =>
          att.employeeId === employeeId && att.date === today
            ? {
                ...att,
                checkIn: timeString,
                status: isLate ? 'late' : 'present',
              }
            : att
        ),
      };
    }),

  checkOut: (employeeId) =>
    set((state) => {
      const now = new Date();
      const timeString = now.toTimeString().slice(0, 5);

      return {
        attendance: state.attendance.map((att) =>
          att.employeeId === employeeId && att.date === today
            ? { ...att, checkOut: timeString }
            : att
        ),
      };
    }),

  updatePayroll: (id, updatedPayroll) =>
    set((state) => ({
      payroll: state.payroll.map((pay) =>
        pay.id === id ? { ...pay, ...updatedPayroll } : pay
      ),
    })),

  addLeaveRequest: (request) =>
    set((state) => ({
      leaveRequests: [...state.leaveRequests, request],
    })),

  updateLeaveRequest: (id, status, approvedBy) =>
    set((state) => {
      const request = state.leaveRequests.find((r) => r.id === id);
      if (!request) return state;

      const updatedRequests = state.leaveRequests.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              approvedBy: status === 'approved' ? approvedBy : undefined,
              approvedAt: status === 'approved' ? new Date().toISOString() : undefined,
            }
          : r
      );

      let updatedBalances = state.leaveBalances;
      if (status === 'approved') {
        updatedBalances = state.leaveBalances.map((balance) =>
          balance.employeeId === request.employeeId
            ? {
                ...balance,
                usedLeave: balance.usedLeave + request.days,
                remainingLeave: balance.remainingLeave - request.days,
              }
            : balance
        );
      }

      return {
        leaveRequests: updatedRequests,
        leaveBalances: updatedBalances,
      };
    }),

  getLeaveBalance: (employeeId) => {
    const state = get();
    return (
      state.leaveBalances.find((b) => b.employeeId === employeeId) || {
        employeeId,
        totalLeave: 15,
        usedLeave: 0,
        remainingLeave: 15,
      }
    );
  },

  updateLeaveBalances: (settings) =>
    set((state) => {
      const today = new Date();
      
      // 근로기준법에 따른 연차 계산
      const calculateAnnualLeaveByLaw = (hireDate: string): number => {
        const hire = parseISO(hireDate);
        const yearsWorked = differenceInYears(today, hire);
        const monthsWorked = differenceInMonths(today, hire);
        
        // 근속 1년 미만: 1개월 개근 시 1일씩 발생 (최대 11일)
        if (yearsWorked < 1) {
          return Math.min(monthsWorked, 11);
        }
        
        // 근속 1년 이상: 기본 15일
        let totalLeave = 15;
        
        // 근속 3년차부터: 15일 + floor((근속연수 - 1) / 2)
        // 예: 3년차 = 15 + floor((3-1)/2) = 15 + 1 = 16일
        //     5년차 = 15 + floor((5-1)/2) = 15 + 2 = 17일
        //     7년차 = 15 + floor((7-1)/2) = 15 + 3 = 18일
        if (yearsWorked >= 3) {
          const additionalLeave = Math.floor((yearsWorked - 1) / 2);
          totalLeave += additionalLeave;
        }
        
        // 최대 25일 한도
        return Math.min(totalLeave, 25);
      };

      const updatedBalances = state.employees
        .filter((emp) => emp.status === 'active' && emp.hireDate)
        .map((emp) => {
          const existingBalance = state.leaveBalances.find((b) => b.employeeId === emp.id);
          const usedLeave = existingBalance?.usedLeave || 0;
          const totalLeave = calculateAnnualLeaveByLaw(emp.hireDate);

          return {
            employeeId: emp.id,
            totalLeave,
            usedLeave,
            remainingLeave: Math.max(0, totalLeave - usedLeave),
          };
        });

      // 기존에 없는 직원은 기본값으로 추가
      const existingIds = updatedBalances.map((b) => b.employeeId);
      const newBalances = state.employees
        .filter((emp) => emp.status === 'active' && !existingIds.includes(emp.id))
        .map((emp) => ({
          employeeId: emp.id,
          totalLeave: settings.baseAnnualLeave,
          usedLeave: 0,
          remainingLeave: settings.baseAnnualLeave,
        }));

      return {
        leaveBalances: [...updatedBalances, ...newBalances],
      };
    }),

  updatePayrollSettings: (settings) =>
    set(() => ({
      payrollSettings: settings,
    })),

  updateCompanySettings: (settings) =>
    set(() => ({
      companySettings: settings,
    })),

  calculatePayrollFromAttendance: (month, employeeIds, externalEmployees) =>
    set((state) => {
      const settings = state.payrollSettings;
      const payrollItemSettings = usePayrollSettingsStore.getState();
      const activePaymentItems = payrollItemSettings.paymentItems.filter(item => item.isActive);
      const activeDeductionItems = payrollItemSettings.deductionItems.filter(item => item.isActive);

      const [year, monthNum] = month.split('-').map(Number);
      const startDate = new Date(year, monthNum - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];
      const workDaysInMonth = new Date(year, monthNum, 0).getDate();

      // 외부에서 전달받은 직원 데이터 또는 로컬 직원 데이터 사용
      const sourceEmployees = externalEmployees || state.employees;
      
      // 선택된 직원만 필터링 (employeeIds가 없으면 전체 활성 직원)
      const targetEmployees = sourceEmployees.filter((emp) => {
        if (emp.status !== 'active') return false;
        if (employeeIds && employeeIds.length > 0) {
          return employeeIds.includes(emp.id);
        }
        return true;
      });

      const newPayroll: PayrollRecord[] = targetEmployees.map((emp) => {
          // 해당 월의 근태 기록 필터링
          const empAttendance = state.attendance.filter((att) => {
            if (att.employeeId !== emp.id) return false;
            return att.date >= startDate && att.date <= endDate;
          });

          const presentDays = empAttendance.filter((a) => a.status === 'present').length;
          const lateDays = empAttendance.filter((a) => a.status === 'late').length;
          const absentDays = empAttendance.filter((a) => a.status === 'absent').length;
          const leaveDays = empAttendance.filter((a) => a.status === 'leave').length;

          // 총 근무 시간 계산
          let totalWorkMinutes = 0;
          empAttendance.forEach((att) => {
            if (att.checkIn && att.checkOut) {
              const [inH, inM] = att.checkIn.split(':').map(Number);
              const [outH, outM] = att.checkOut.split(':').map(Number);
              totalWorkMinutes += (outH * 60 + outM) - (inH * 60 + inM);
            }
          });

          // 급여 계산
          const standardMonthlyMinutes = workDaysInMonth * settings.standardWorkHours * 60;
          const overtimeMinutes = Math.max(0, totalWorkMinutes - standardMonthlyMinutes);
          const overtimeHours = Math.round(overtimeMinutes / 60 * 10) / 10;

          // 급여 유형별 기본급 계산
          // 실제 근무일수 (출근 + 지각은 모두 출근으로 처리)
          const workedDays = presentDays + lateDays;
          
          let baseSalary = emp.baseSalary;
          if (emp.payType === 'daily' && emp.dailyRate) {
            // 일급제: 일급 × 출근일수
            baseSalary = workedDays * emp.dailyRate;
          } else if (emp.payType === 'hourly' && emp.hourlyRate) {
            // 시급제: 시급 × 근무시간
            baseSalary = Math.round(totalWorkMinutes / 60 * emp.hourlyRate);
          }

          // 연장수당 계산 (시급 기준)
          let hourlyRateForOvertime = 0;
          if (emp.payType === 'hourly') {
            hourlyRateForOvertime = emp.hourlyRate || 0;
          } else if (emp.payType === 'daily' && emp.dailyRate) {
            // 일급제: 일급 / 표준근무시간 = 시급
            hourlyRateForOvertime = Math.round(emp.dailyRate / settings.standardWorkHours);
          } else {
            // 월급제: 월급 / (월 근무일수 × 표준근무시간)
            hourlyRateForOvertime = Math.round(emp.baseSalary / (workDaysInMonth * settings.standardWorkHours));
          }
          const overtime = Math.round(overtimeHours * hourlyRateForOvertime * settings.overtimeRate);

          // 동적 지급 항목 계산
          const paymentItemsValues: PayrollItemValue[] = activePaymentItems.map(item => {
            let amount = 0;
            if (item.id === 'base-salary') {
              amount = baseSalary;
            } else if (item.id === 'overtime') {
              amount = overtime;
            } else if (item.id === 'bonus') {
              amount = 0; // 상여금은 수동 입력
            } else if (item.calculationType === 'fixed' && item.defaultValue) {
              amount = item.defaultValue;
            } else if (item.calculationType === 'percentage' && item.defaultValue) {
              amount = Math.round(baseSalary * item.defaultValue / 100);
            }
            return {
              itemId: item.id,
              name: item.name,
              amount,
              type: 'payment' as const
            };
          });

          // 총 지급액 계산
          const totalPayments = paymentItemsValues.reduce((sum, item) => sum + item.amount, 0);

          // 동적 공제 항목 계산
          const deductionItemsValues: PayrollItemValue[] = activeDeductionItems.map(item => {
            let amount = 0;
            if (item.calculationType === 'percentage' && item.defaultValue) {
              amount = Math.round(baseSalary * item.defaultValue / 100);
            } else if (item.calculationType === 'fixed' && item.defaultValue) {
              amount = item.defaultValue;
            }
            return {
              itemId: item.id,
              name: item.name,
              amount,
              type: 'deduction' as const
            };
          });

          // 지각/결근 공제 추가 (월급제만 해당 - 일급/시급제는 출근일 기준으로 이미 계산됨)
          let dailyRateForDeduction = 0;
          if (emp.payType === 'monthly') {
            dailyRateForDeduction = Math.round(emp.baseSalary / workDaysInMonth);
          }
          const lateDeduction = Math.round(lateDays * dailyRateForDeduction * settings.lateDeductionRate);
          const absentDeduction = Math.round(absentDays * dailyRateForDeduction * settings.absentDeductionRate);
          
          if (lateDeduction > 0) {
            deductionItemsValues.push({
              itemId: 'late-deduction',
              name: '지각공제',
              amount: lateDeduction,
              type: 'deduction'
            });
          }
          if (absentDeduction > 0) {
            deductionItemsValues.push({
              itemId: 'absent-deduction',
              name: '결근공제',
              amount: absentDeduction,
              type: 'deduction'
            });
          }

          const totalDeductions = deductionItemsValues.reduce((sum, item) => sum + item.amount, 0);
          const netSalary = totalPayments - totalDeductions;

          return {
            id: `payroll-${emp.id}-${month}`,
            employeeId: emp.id,
            employeeNumber: emp.employeeNumber,
            employeeName: emp.name,
            department: emp.department,
            month,
            baseSalary,
            overtime,
            overtimeHours,
            bonus: 0,
            deductions: totalDeductions,
            netSalary,
            status: 'pending' as const,
            presentDays,
            lateDays,
            absentDays,
            leaveDays,
            totalWorkMinutes,
            calculatedAt: new Date().toISOString(),
            paymentItems: paymentItemsValues,
            deductionItems: deductionItemsValues,
          };
        });

      // 기존 해당 월 급여 데이터 제거 후 새로 추가
      const filteredPayroll = state.payroll.filter((p) => p.month !== month);
      
      return {
        payroll: [...filteredPayroll, ...newPayroll],
      };
    }),

  getPayrollByMonth: (month) => {
    return get().payroll.filter((p) => p.month === month);
  },

  bulkAddAttendance: (data) =>
    set((state) => {
      const newAttendance = [...state.attendance];

      data.forEach((item) => {
        const employee = state.employees.find(
          (emp) => emp.employeeNumber === item.employeeNumber
        );
        if (!employee) return;

        // 해당 날짜의 기존 기록 찾기
        const existingIndex = newAttendance.findIndex(
          (att) => att.employeeId === employee.id && att.date === item.date
        );

        const record: AttendanceRecord = {
          id: `att-${employee.id}-${item.date}`,
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          employeeName: employee.name,
          department: employee.department,
          date: item.date,
          checkIn: item.checkIn,
          checkOut: item.checkOut,
          status: item.status,
        };

        if (existingIndex >= 0) {
          // 기존 기록 업데이트
          newAttendance[existingIndex] = record;
        } else {
          // 새 기록 추가
          newAttendance.push(record);
        }
      });

      return { attendance: newAttendance };
    }),
}));
