import { AccountActions, AccountForm } from "@/components/InvestmentForms";
import { aed } from "@/lib/investments/format";
import { D } from "@/lib/investments/holdings";
import { getPortfolio } from "@/lib/investments/service";

export default async function AccountsPage() {
  const { accounts, portfolio } = await getPortfolio();

  const valueOf = (id: string) =>
    portfolio.positions.filter((p) => p.accountId === id).reduce((sum, p) => sum.plus(p.marketValueBase), new D(0)).plus(portfolio.cash.filter((c) => c.accountId === id).reduce((sum, c) => sum.plus(c.balanceBase), new D(0)));

  return (
    <>
      <h1 className="text-3xl font-semibold">Accounts</h1>
      <p className="mt-2 text-dim">Your brokerage and bank accounts. This only tracks them: it can&apos;t trade or move money.</p>
      <div className="mt-6">
        <AccountForm />
      </div>
      <section aria-labelledby="your-accounts" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="your-accounts" className="text-lg font-semibold">
          Your accounts ({accounts.length})
        </h2>
        {accounts.length ? (
          <ul className="mt-3 divide-y divide-line">
            {accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words">
                    {account.name} {!account.isActive && <span className="text-sm font-normal text-dim">(archived)</span>}
                  </p>
                  <p className="text-sm text-dim">
                    {account.institution} · {account.currency} · {aed(valueOf(account.id))}
                  </p>
                </div>
                <AccountActions id={account.id} name={account.name} isActive={account.isActive} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-dim">No accounts yet. Use the buttons above to add Interactive Brokers and Sarwa.</p>
        )}
      </section>
    </>
  );
}
