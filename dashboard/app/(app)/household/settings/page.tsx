import { SettingsForm } from "@/components/household/SettingsForm";
import { getHouseholdSettings } from "@/lib/household/settings";

export default async function HouseholdSettingsPage() {
  const settings = await getHouseholdSettings();
  return (
    <>
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-2 text-dim">For payslips, exchange rates, payroll and alerts. Expense categories are set on the Expenses tab.</p>
      <div className="mt-6">
        <SettingsForm
          initial={{
            employerName: settings.employerName,
            address: settings.address,
            defaultPkrPerAed: settings.defaultPkrPerAed.toString(),
            payrollDay: settings.payrollDay,
            expiryAlertDays: settings.expiryAlertDays,
            gratuityDaysPerYear: settings.gratuityDaysPerYear.toString(),
          }}
        />
      </div>
    </>
  );
}
