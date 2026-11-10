import { DeleteTransaction, TransactionForm } from "@/components/InvestmentForms";
import { db } from "@/lib/db";
import { plain } from "@/lib/investments/format";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const LABELS: Record<string, string> = {
  BUY: "Buy",
  SELL: "Sell",
  DIVIDEND: "Dividend",
  INTEREST: "Interest",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  FEE: "Fee",
  SPLIT: "Split",
};

export default async function TransactionsPage() {
  const [accounts, transactions] = await Promise.all([
    db().account.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, currency: true } }),
    db().transaction.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], include: { instrument: { select: { symbol: true } }, account: { select: { name: true } } } }),
  ]);

  return (
    <>
      <h1 className="text-3xl font-semibold">Transactions</h1>
      <p className="mt-2 text-dim">Holdings, average cost and profit or loss are all worked out from these.</p>
      <div className="mt-6">
        <TransactionForm accounts={accounts} />
      </div>

      <section aria-labelledby="history" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="history" className="text-lg font-semibold">
          History ({transactions.length})
        </h2>
        {transactions.length ? (
          <div className="relative mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Transaction history">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="text-dim">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Type</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Holding</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Account</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Shares</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Price</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Amount</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Fees</th>
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const label = `${LABELS[t.type]} ${t.instrument?.symbol ?? ""} on ${dateFormat.format(t.date)}`.replace(/\s+/g, " ");
                  return (
                    <tr key={t.id} className="border-b border-line">
                      <td className="py-3 pr-3 whitespace-nowrap">{dateFormat.format(t.date)}</td>
                      <td className="py-3 pr-3">{LABELS[t.type]}</td>
                      <td className="py-3 pr-3 font-mono">{t.instrument?.symbol ?? "–"}</td>
                      <td className="py-3 pr-3">{t.account.name}</td>
                      <td className="py-3 pr-3 text-right font-mono">{t.type === "SPLIT" ? `×${plain(t.quantity)}` : plain(t.quantity)}</td>
                      <td className="py-3 pr-3 text-right font-mono">{plain(t.price)}</td>
                      <td className="py-3 pr-3 text-right font-mono">
                        {plain(t.amount)} {t.currency}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono">{plain(t.fees)}</td>
                      <td className="py-3">
                        <DeleteTransaction id={t.id} label={label} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-dim">No transactions yet.</p>
        )}
      </section>
    </>
  );
}
