import { AddChannel } from "@/components/household/BankAccountForms";
import { DemoData } from "@/components/household/DemoData";
import { RemoveButton } from "@/components/household/RemoveButton";
import { listChannels } from "@/lib/household/bank-accounts";
import { SettingsForm } from "@/components/household/SettingsForm";
import { hasDemoData } from "@/lib/household/demo";
import { getHouseholdSettings } from "@/lib/household/settings";

export default async function HouseholdSettingsPage() {
  const settings = await getHouseholdSettings();
  const demo = await hasDemoData();
  const channels = await listChannels();
  return (
    <>
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-2 text-dim">For payslips, the exchange rate a transfer starts with, transfer channels, payroll and alerts. Expense categories are set on the Expenses tab.</p>
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

      <section aria-labelledby="channels" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="channels" className="text-lg font-semibold">
          Transfer channels
        </h2>
        <p className="mt-1 text-sm text-dim">How you send money home, such as an exchange house or a bank app. You pick one when recording a transfer.</p>
        {channels.length ? (
          <ul aria-label="Channels" className="mt-4 grid gap-2 sm:grid-cols-2">
            {channels.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2 text-sm">
                <span className="min-w-0 break-words">{c.name}</span>
                <RemoveButton path={`/api/household/channels/${c.id}`} label={c.name} question={`Remove ${c.name} from the list? Transfers already recorded keep it.`} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-dim">No channels yet. Add the ones you use.</p>
        )}
        <div className="mt-4">
          <AddChannel />
        </div>
      </section>

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
