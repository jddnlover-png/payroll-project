export interface Employee {
  id: string;
  employeeNumber: string;
  name: string;
  residentNumber?: string;
  department: string;
  position: string;
  email: string;
  phone: string;
  hireDate: string;
  baseSalary: number;
  payType: 'hourly' | 'monthly' | 'daily';
  dailyRate?: number;
  hourlyRate?: number;
  employmentType: 'regular' | 'contract' | 'daily' | 'freelancer';
  status: 'active' | 'inactive' | 'pending';
    bankName?: string;
  accountNumber?: string;
  jobCategory?: string;
  longTermCareReduction?: boolean;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  department: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: 'present' | 'late' | 'absent' | 'leave';
}

export interface PayrollItemValue {
  itemId: string;
  name: string;
  amount: number;
  type: 'payment' | 'deduction';
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  department: string;
  month: string;
  baseSalary: number;
  overtime: number;
  overtimeHours: number;
  bonus: number;
  deductions: number;
  netSalary: number;
  status: 'pending' | 'paid' | 'confirmed' | 'confirmed_paid';
  presentDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  totalWorkMinutes: number;
  regularWorkMinutes?: number;
  overtimeMinutes?: number;
  nightWorkMinutes?: number;
  nightShiftMinutes?: number;
  holidayWorkMinutes?: number;
  calculatedAt: string;
  // 동적 지급/공제 항목
  paymentItems?: PayrollItemValue[];
  deductionItems?: PayrollItemValue[];
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  leaveType: 'annual' | 'sick' | 'personal' | 'other';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface LeaveBalance {
  employeeId: string;
  totalLeave: number;
  usedLeave: number;
  remainingLeave: number;
}
