import { DemoData } from "@/components/household/DemoData";
import { SettingsForm } from "@/components/household/SettingsForm";
import { hasDemoData } from "@/lib/household/demo";
import { getHouseholdSettings } from "@/lib/household/settings";

export default async function HouseholdSettingsPage() {
  const settings = await getHouseholdSettings();
  const demo = await hasDemoData();
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
          }}
        />
      </div>

      <section aria-labelledby="demo" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="demo" className="text-lg font-semibold">
          Demo data
        </h2>
        <p className="mt-1 text-sm text-dim">
          Try the section with sample data: two staff, an advance, two paid payroll months, three transfers home and a few expenses. Everything is marked “(demo)”, and clearing it removes only that.
        </p>
        <div className="mt-3">
          <DemoData loaded={demo} />
        </div>
      </section>
    </>
  );
}
