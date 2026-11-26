"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { FamilyFormValues } from "@/lib/household/family-view";

const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";

const RELATIONSHIPS = [
  ["SELF", "Me"],
  ["WIFE", "Wife"],
  ["SON", "Son"],
  ["DAUGHTER", "Daughter"],
  ["MOTHER", "Mother"],
  ["FATHER", "Father"],
  ["BROTHER", "Brother"],
  ["SISTER", "Sister"],
  ["OTHER", "Other"],
] as const;
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-[1.5rem] border border-line bg-surface p-5">
      <legend className="px-1 font-display text-lg font-semibold">{title}</legend>
      {hint && <p className="text-sm text-dim">{hint}</p>}
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

/** Adds or edits a family member: you, your wife, children and other family. Only name and relationship are required. */
export function FamilyForm({ id, initial }: { id?: string; initial: FamilyFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const child = values.relationship === "SON" || values.relationship === "DAUGHTER";
  const set = (key: keyof FamilyFormValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const input = (key: keyof FamilyFormValues, label: string, extra: Record<string, unknown> = {}) => (
    <label className="block text-sm">
      {label}
      <input className={FIELD} name={key} value={values[key]} onChange={set(key)} {...extra} />
    </label>
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("Saving…");
    const response = await fetch(id ? `/api/household/family/${id}` : "/api/household/family", {
      method: id ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => null);
    setBusy(false);
    const body = await response?.json().catch(() => null);
    if (!response?.ok) {
      setMessage(body?.error ?? "Couldn't save. Please try again.");
      return;
    }
    setMessage("Saved.");
    router.push(`/household/family/${body.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Section title="About">
        {input("fullName", "Full name", { required: true, maxLength: 120, autoComplete: "off" })}
        <label className="block text-sm">
          Relationship
          <select className={FIELD} name="relationship" required value={values.relationship} onChange={set("relationship")}>
            <option value="" disabled>
              Choose…
            </option>
            {RELATIONSHIPS.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
        {input("dateOfBirth", "Date of birth", { type: "date" })}
        <label className="block text-sm">
          Blood group
          <select className={FIELD} name="bloodGroup" value={values.bloodGroup} onChange={set("bloodGroup")}>
            <option value="">Not known</option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        {input("phone", "Phone", { type: "tel", maxLength: 40, placeholder: "e.g. 0300 1234567" })}
        {input("email", "Email", { type: "email", maxLength: 120 })}
        {input("city", "Lives in", { maxLength: 80, placeholder: "e.g. Peshawar" })}
      </Section>

      <Section title="Pakistan" hint="You're warned before these expire, and passports six months ahead. Upload copies after saving.">
        {input("cnicNo", child ? "B-Form number" : "CNIC number", { maxLength: 20, autoComplete: "off", inputMode: "numeric", placeholder: "35202-1234567-1" })}
        {input("cnicExpiry", child ? "B-Form expiry (if any)" : "CNIC expiry", { type: "date" })}
        <span aria-hidden className="hidden lg:block" />
        {input("passportNo", "Passport number", { maxLength: 20, autoComplete: "off", placeholder: "AB1234567" })}
        {input("passportIssued", "Passport issued", { type: "date" })}
        {input("passportExpiry", "Passport expiry", { type: "date" })}
      </Section>

      <Section title="UAE residency" hint="For anyone living with you in the UAE. Leave it empty otherwise.">
        {input("emiratesIdNo", "Emirates ID number", { maxLength: 20, autoComplete: "off", inputMode: "numeric", placeholder: "784-1990-1234567-1" })}
        {input("emiratesIdExpiry", "Emirates ID expiry", { type: "date" })}
        {input("visaExpiry", "Residence visa expiry", { type: "date" })}
      </Section>

      <fieldset className="rounded-[1.5rem] border border-line bg-surface p-5">
        <legend className="px-1 font-display text-lg font-semibold">Notes</legend>
        <label className="block text-sm">
          <span className="sr-only">Notes</span>
          <textarea className="mt-1 min-h-24 w-full rounded-xl border border-line-strong bg-bg p-3 text-sm text-txt" name="notes" value={values.notes} maxLength={2000} placeholder="School, allergies, anything worth keeping" onChange={set("notes")} />
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-11 rounded-xl px-6" disabled={busy}>
          {id ? "Save changes" : "Add to family"}
        </Button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}

export function RemoveFamilyMember({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        className="border border-line-strong"
        onClick={async () => {
          if (!window.confirm(`Remove ${name} from your family list? Money already sent to them stays in the totals.`)) return;
          const response = await fetch(`/api/household/family/${id}`, { method: "DELETE" }).catch(() => null);
          if (!response?.ok) return setMessage("Couldn't remove them. Please try again.");
          router.push("/household/family");
          router.refresh();
        }}
      >
        <Trash2 aria-hidden className="size-4" /> Remove from family
      </Button>
      {message && (
        <p role="status" className="mt-1 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
