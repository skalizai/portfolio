import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RemittanceForm } from "@/components/household/RemittanceForms";
import { db } from "@/lib/db";
import { groupOf, listRecipients } from "@/lib/household/remittances";

export default async function EditRemittancePage({ params }: { params: Promise<{ id: string }> }) {
  const r = await db().remittance.findFirst({ where: { id: (await params).id, deletedAt: null }, include: { recipient: true } });
  if (!r) notFound();
  const recipients = await listRecipients();
  // A removed recipient still shows on their own old transfers.
  const options = recipients.some((x) => x.id === r.recipientId) ? recipients : [r.recipient, ...recipients];

  return (
    <>
      <Link href="/household/remittances" className="inline-flex items-center gap-1 text-sm text-dim hover:text-txt">
        <ArrowLeft aria-hidden className="size-4" /> All transfers
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">Edit transfer</h1>
      <div className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <RemittanceForm
          id={r.id}
          recipients={options.map((x) => ({ id: x.id, name: x.name, group: groupOf(x) }))}
          initial={{
            date: r.date.toISOString().slice(0, 10),
            recipientId: r.recipientId,
            amountAed: r.amountAed.toString(),
            rate: r.rate.toString(),
            amountPkr: r.amountPkr.toString(),
            feeAed: r.feeAed.isZero() ? "" : r.feeAed.toString(),
            channel: r.channel,
            reference: r.reference,
            purpose: r.purpose,
            notes: r.notes,
          }}
        />
      </div>
    </>
  );
}
