import { EmployeeForm } from "@/components/household/EmployeeForm";
import { EMPTY_EMPLOYEE } from "@/lib/household/employee-view";

export default function NewEmployeePage() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Add employee</h1>
      <p className="mt-2 text-dim">Only the name, role, joining date and basic salary are required. You can add documents after saving.</p>
      <div className="mt-6">
        <EmployeeForm initial={{ ...EMPTY_EMPLOYEE, joiningDate: new Date().toISOString().slice(0, 10) }} />
      </div>
    </>
  );
}
