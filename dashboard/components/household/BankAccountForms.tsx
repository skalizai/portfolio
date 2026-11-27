"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";

/** Posts the form as JSON to `path`; on success clears it and refreshes the page. */
function useJsonForm(path: string, done: string) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      setMessage(body?.error ?? "Couldn't save that. Please try again.");
      return;
    }
    form.reset();
    setMessage(done);
    router.refresh();
  }
  return { submit, message, busy };
}

/** Adds a bank account for a family member: bank, title and branch. */
export function AddBankAccount({ memberId, name }: { memberId: string; name: string }) {
  const { submit, message, busy } = useJsonForm(`/api/household/family/${memberId}/bank-accounts`, "Account added.");
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3" aria-label={`Add a bank account for ${name}`}>
      <label className="block text-sm">
        Bank
        <input className={FIELD} name="bankName" required maxLength={80} placeholder="e.g. Bank Alfalah, HBL, Meezan" />
      </label>
      <label className="block text-sm">
        Account title
        <input className={FIELD} name="accountTitle" maxLength={120} placeholder="Name on the account" />
      </label>
      <label className="block text-sm">
        Branch
        <input className={FIELD} name="branch" maxLength={120} placeholder="e.g. Gulberg, Lahore" />
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-3">
        <input type="checkbox" name="isPrimary" className="size-4 accent-[var(--brand)]" /> Main account (chosen first when sending)
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button type="submit" className="h-11 rounded-xl px-5" disabled={busy}>
          <Plus aria-hidden className="size-4" /> Add account
        </Button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}

/** Adds a transfer channel in Settings. */
export function AddChannel() {
  const { submit, message, busy } = useJsonForm("/api/household/channels", "Channel added.");
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="block min-w-0 flex-1 text-sm">
        New channel
        <input className={FIELD} name="name" required maxLength={80} placeholder="e.g. Al Ansari Exchange, Meezan app" />
      </label>
      <Button type="submit" className="h-11 rounded-xl px-5" disabled={busy}>
        <Plus aria-hidden className="size-4" /> Add channel
      </Button>
      <p role="status" className="w-full text-sm empty:hidden">
        {message}
      </p>
    </form>
  );
}
