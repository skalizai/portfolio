import { Download, Paperclip, Pencil, Search } from "lucide-react";
import Link from "next/link";
import { RecipientForm, RemittanceForm } from "@/components/household/RemittanceForms";
import { RemoveButton } from "@/components/household/RemoveButton";
import { Button } from "@/components/ui/button";
import { formatAed, formatPkr, mask, monthOf } from "@/lib/household/money";
import { EMPTY_RECIPIENT, groupOf, listRecipients, listRemittances, PURPOSE_LABELS, RELATIONSHIP_LABELS, summarizeRemittances, targetProgress } from "@/lib/household/remittances";
import { syncLinkedRecipients } from "@/lib/household/linked-recipients";
import { accountLabel, accountsByRecipient, listChannels } from "@/lib/household/bank-accounts";
import { getHouseholdSettings } from "@/lib/household/settings";

const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`));

type Search = { from?: string; to?: string; recipientId?: string; purpose?: string; send?: string };

function Breakdown({ title, rows, total }: { title: string; rows: { key: string; name: string; aed: { toString(): string }; pkr: { toString(): string }; count: number }[]; total: number }) {
  return (
    <section aria-label={title} className="rounded-[1.5rem] border border-line bg-surface p-5">
      <h3 className="font-semibold">{title}</h3>
      {rows.length ? (
        <ul className="mt-3 space-y-3 text-sm">
          {rows.map((row) => {
            const share = total > 0 ? Math.round((Number(row.aed.toString()) / total) * 100) : 0;
            return (
              <li key={row.key}>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="min-w-0 break-words">
                    {row.name} <span className="text-dim">· {row.count} {row.count === 1 ? "transfer" : "transfers"}</span>
                  </span>
                  <span className="font-mono">{formatAed(row.aed.toString())}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-surface-2" aria-hidden>
                    <div className="h-2 rounded-full bg-series-1" style={{ width: `${share}%` }} />
                  </div>
                  <span className="w-28 text-right font-mono text-xs text-dim">{formatPkr(row.pkr.toString())}</span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-dim">Nothing yet.</p>
      )}
    </section>
  );
}

export default async function RemittancesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { from = "", to = "", recipientId = "", purpose = "", send = "" } = await searchParams;
  const settings = await getHouseholdSettings();
  // Family members and staff added since the last visit show up as recipients.
  await syncLinkedRecipients();
  const [recipients, accounts, channels] = await Promise.all([listRecipients(), accountsByRecipient(), listChannels()]);
  const rows = await listRemittances({ from, to, recipientId, purpose });
  const thisMonth = monthOf(new Date());
  const monthRows = await listRemittances({ from: `${thisMonth}-01` });
  const summary = summarizeRemittances(rows);
  const targets = targetProgress(recipients, monthRows, thisMonth);
  const filtered = Boolean(from || to || recipientId || purpose);
  const query = new URLSearchParams(Object.entries({ from, to, recipientId, purpose }).filter(([, v]) => v)).toString();
  const year = thisMonth.slice(0, 4);
  const today = new Date().toISOString().slice(0, 10);
  const quick = [
    ["This month", `?from=${thisMonth}-01&to=${today}`],
    ["This year", `?from=${year}-01-01&to=${today}`],
    ["Last year", `?from=${Number(year) - 1}-01-01&to=${Number(year) - 1}-12-31`],
    ["All time", "?"],
  ] as const;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Remittances</h1>
          <p className="mt-2 text-dim">Money sent home to Pakistan: what left in AED, the rate, and the PKR that arrived.</p>
        </div>
        <Button asChild variant="ghost" className="h-11 border border-line-strong">
          <a href={`/api/household/remittances/export${query ? `?${query}` : ""}`} download>
            <Download aria-hidden className="size-4" /> Export to Excel
          </a>
        </Button>
      </div>

      <section aria-labelledby="new-transfer" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="new-transfer" className="text-lg font-semibold">
          Record a transfer
        </h2>
        <div className="mt-4">
          <RemittanceForm
            recipients={recipients.map((r) => ({ id: r.id, name: r.name, group: groupOf(r) }))}
            accounts={accounts}
            channels={channels.map((c) => c.name)}
            initial={{ date: today, recipientId: recipients.find((r) => r.id === send)?.id ?? recipients[0]?.id ?? "", amountAed: "", rate: settings.defaultPkrPerAed.toString(), amountPkr: "", channel: "", bankAccountId: "", reference: "", purpose: "HOUSEHOLD", notes: "" }}
          />
        </div>
      </section>

      {targets.length > 0 && (
        <section aria-labelledby="targets" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
          <h2 id="targets" className="text-lg font-semibold">
            Monthly targets · {monthLabel(thisMonth)}
          </h2>
          <ul className="mt-3 space-y-3 text-sm">
            {targets.map((t) => (
              <li key={t.id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <span>{t.name}</span>
                  <span className="font-mono">
                    {formatAed(t.sent)} of {formatAed(t.target)}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface-2" role="progressbar" aria-label={`${t.name}: ${t.share}% of this month's target sent`} aria-valuenow={t.share} aria-valuemin={0} aria-valuemax={100}>
                  <div className="bg-gradient-accent h-2 rounded-full" style={{ width: `${t.share}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form role="search" aria-label="Filter transfers" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
        <label className="block text-sm">
          From
          <input className={FIELD} type="date" name="from" defaultValue={from} />
        </label>
        <label className="block text-sm">
          To
          <input className={FIELD} type="date" name="to" defaultValue={to} />
        </label>
        <label className="block text-sm">
          Recipient
          <select className={FIELD} name="recipientId" defaultValue={recipientId}>
            <option value="">Everyone</option>
            {recipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Purpose
          <select className={FIELD} name="purpose" defaultValue={purpose}>
            <option value="">Any purpose</option>
            {Object.entries(PURPOSE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="ghost" className="h-11 border border-line-strong">
          <Search aria-hidden className="size-4" /> Filter
        </Button>
      </form>
      <nav aria-label="Quick periods" className="mt-3 flex flex-wrap gap-2 text-sm">
        {quick.map(([label, href]) => (
          <Link key={label} href={`/household/remittances${href}`} className="rounded-full border border-line px-3 py-1.5 text-dim hover:text-txt">
            {label}
          </Link>
        ))}
      </nav>

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Sent", formatAed(summary.aed)],
          ["Received", formatPkr(summary.pkr)],
          ["Average rate", summary.averageRate ? `${summary.averageRate.toFixed(2)} PKR/AED` : "–"],
          ["Transfers", String(summary.count)],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col rounded-[1.25rem] border border-line bg-surface p-4">
            <dt className="text-sm text-dim">{label}</dt>
            <dd className="order-first font-mono text-lg font-semibold break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-sm text-dim">
        {summary.count} {summary.count === 1 ? "transfer" : "transfers"}
        {filtered ? " matching the filters" : " in all"}. The average rate is all the PKR received over all the AED sent.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Breakdown title="By recipient" rows={summary.byRecipient} total={Number(summary.aed)} />
        <Breakdown title="By purpose" rows={summary.byPurpose} total={Number(summary.aed)} />
        <Breakdown title="By month" rows={summary.byMonth.map((m) => ({ ...m, name: monthLabel(m.key) }))} total={Number(summary.aed)} />
      </div>

      <h2 className="mt-8 text-lg font-semibold">Transfers</h2>
      {rows.length ? (
        <ul className="mt-3 space-y-3">
          {rows.map((r) => {
            const label = `${formatAed(r.amountAed)} to ${r.recipient.name} on ${dateFormat.format(r.date)}`;
            return (
              <li key={r.id} className="rounded-[1.25rem] border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">
                      {r.recipient.name} · <span className="font-mono">{formatAed(r.amountAed)}</span> → <span className="font-mono">{formatPkr(r.amountPkr)}</span>
                    </p>
                    <p className="text-sm text-dim">
                      {dateFormat.format(r.date)} · {PURPOSE_LABELS[r.purpose]} · {Number(r.rate).toFixed(2)} PKR/AED
                      {r.bankAccount ? ` · to ${accountLabel(r.bankAccount)}` : ""}
                      {r.channel ? ` · ${r.channel}` : ""}
                      {r.reference ? ` · ref ${r.reference}` : ""}
                    </p>
                    {r.notes && <p className="mt-1 text-sm break-words">{r.notes}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.receiptFileId && (
                      <Button asChild variant="ghost" size="sm" className="border border-line-strong">
                        <a href={`/api/household/files/${r.receiptFileId}`} target="_blank" rel="noreferrer">
                          <Paperclip aria-hidden className="size-4" /> Receipt <span className="sr-only">for {label}</span>
                        </a>
                      </Button>
                    )}
                    <Button asChild variant="ghost" size="sm" className="border border-line-strong">
                      <Link href={`/household/remittances/${r.id}`}>
                        <Pencil aria-hidden className="size-4" /> Edit <span className="sr-only">{label}</span>
                      </Link>
                    </Button>
                    <RemoveButton path={`/api/household/remittances/${r.id}`} label={label} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 rounded-[1.5rem] border border-line bg-surface p-5 text-dim">{filtered ? "No transfers match these filters." : "No transfers yet."}</p>
      )}

      <section aria-labelledby="recipients" className="mt-8 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="recipients" className="text-lg font-semibold">
          Recipients
        </h2>
        <ul className="mt-3 divide-y divide-line">
          {recipients.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">
                    {r.name} <span className="font-normal text-dim">· {RELATIONSHIP_LABELS[r.relationship]}</span>
                    {groupOf(r) !== "other" && <span className="ml-2 rounded-full border border-line-strong px-2 py-0.5 text-xs font-normal">{groupOf(r) === "family" ? "Family" : "Staff"}</span>}
                  </p>
                  <p className="text-dim">
                    {[r.city, r.phone, r.account && `Account ${mask(r.account)}`, r.wallet && `Wallet ${mask(r.wallet)}`, r.monthlyTargetAed && `Target ${formatAed(r.monthlyTargetAed)} a month`].filter(Boolean).join(" · ") || "No details yet"}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <RecipientForm
                    id={r.id}
                    label={r.name}
                    linked={r.familyMemberId ? "their Family record" : r.employeeId ? "their employee record" : undefined}
                    initial={{ name: r.name, relationship: r.relationship, phone: r.phone, account: r.account, wallet: r.wallet, city: r.city, notes: r.notes, monthlyTargetAed: r.monthlyTargetAed?.toString() ?? "" }}
                  />
                  {groupOf(r) === "other" && <RemoveButton path={`/api/household/recipients/${r.id}`} label={r.name} question={`Remove ${r.name}? Their past transfers stay in the totals.`} />}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <h3 className="mt-4 text-sm font-semibold">Add a recipient</h3>
        <div className="mt-2">
          <RecipientForm initial={EMPTY_RECIPIENT} />
        </div>
      </section>
    </>
  );
}
