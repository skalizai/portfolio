import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/household/ExpenseForms";
import { db } from "@/lib/db";
import { listCategories, pkrPerAedOf } from "@/lib/household/expenses";
import { getHouseholdSettings } from "@/lib/household/settings";

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const e = await db().expense.findFirst({ where: { id: (await params).id, deletedAt: null } });
  if (!e) notFound();
  const categories = await listCategories();
  const settings = await getHouseholdSettings();
  const options = categories.filter((c) => c.isActive || c.id === e.categoryId);

  return (
    <>
      <Link href="/household/expenses" className="inline-flex items-center gap-1 text-sm text-dim hover:text-txt">
        <ArrowLeft aria-hidden className="size-4" /> All expenses
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">Edit expense</h1>
      <div className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <ExpenseForm
          id={e.id}
          categories={options.map((c) => ({ id: c.id, name: c.name }))}
          initial={{
            date: e.date.toISOString().slice(0, 10),
            categoryId: e.categoryId,
            amount: e.amount.toString(),
            currency: e.currency === "PKR" ? "PKR" : "AED",
            rate: e.currency === "PKR" ? (pkrPerAedOf(e.rateToAed)?.toString() ?? settings.defaultPkrPerAed.toString()) : settings.defaultPkrPerAed.toString(),
            paymentMethod: e.paymentMethod,
            notes: e.notes,
            status: e.status,
          }}
        />
      </div>
    </>
  );
}
