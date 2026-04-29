import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

export interface Employee {
  id: string;
  organization_id: string;
  employee_number: string;
  name: string;
  department: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  resident_number: string | null;
  employment_type: "regular" | "contract" | "daily" | "freelancer";
  hire_date: string;
  resignation_date: string | null;
  base_salary: number;
  pay_type: "monthly" | "hourly" | "daily";
  hourly_rate: number | null;
  daily_rate: number | null;
  bank_name: string | null;
  account_number: string | null;
  is_active: boolean;
  settlement_type: string;
  job_category: string;
  dependents: number;
  children_aged_8_to_20: number;
  created_at: string;
  updated_at: string;
}

export type EmployeeInsert = Omit<Employee, "id" | "created_at" | "updated_at">;
export type EmployeeUpdate = Partial<Omit<Employee, "id" | "organization_id" | "created_at" | "updated_at">>;

export function useEmployees() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const {
    data: employees = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["employees", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("employee_number");

      if (error) throw error;
      return data as unknown as Employee[];
    },
    enabled: true,
  });

  const addEmployee = useMutation({
    mutationFn: async (employee: Omit<EmployeeInsert, "organization_id">) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");

      const { data, error } = await supabase
        .from("employees")
        .insert({
          ...employee,
          organization_id: currentOrganization.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees", currentOrganization?.id] });
      toast.success("직원이 등록되었습니다");
    },
    onError: (error: any) => {
      console.error("Error adding employee:", error);
      if (error.message?.includes("unique")) {
        toast.error("이미 존재하는 사번입니다");
      } else {
        toast.error("직원 등록 중 오류가 발생했습니다");
      }
    },
  });

  const updateEmployee = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & EmployeeUpdate) => {
      const { data, error } = await supabase.from("employees").update(updates).eq("id", id).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees", currentOrganization?.id] });
      toast.success("직원 정보가 수정되었습니다");
    },
    onError: (error) => {
      console.error("Error updating employee:", error);
      toast.error("직원 정보 수정 중 오류가 발생했습니다");
    },
  });

  const deleteEmployee = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees", currentOrganization?.id] });
      toast.success("직원이 삭제되었습니다");
    },
    onError: (error) => {
      console.error("Error deleting employee:", error);
      toast.error("직원 삭제 중 오류가 발생했습니다");
    },
  });

  const activeEmployees = employees.filter((e) => e.is_active);

  return {
    employees,
    activeEmployees,
    isLoading,
    error,
    addEmployee,
    updateEmployee,
    deleteEmployee,
  };
}