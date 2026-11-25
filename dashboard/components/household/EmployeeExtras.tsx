"use client";

import { Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";
const OUTLINE = "border border-line-strong";

async function upload(path: string, form: FormData): Promise<string | null> {
  const response = await fetch(path, { method: "POST", body: form }).catch(() => null);
  if (response?.ok) return null;
  const body = await response?.json().catch(() => null);
  return body?.error ?? "Couldn't upload that. Please try again.";
}

export function DocumentUpload({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage("Uploading…");
    const error = await upload(`/api/household/employees/${employeeId}/documents`, new FormData(form));
    setBusy(false);
    setMessage(error ?? "Uploaded.");
    if (!error) {
      form.reset();
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <label className="block text-sm">
        Document
        <select className={FIELD} name="type" required defaultValue="PASSPORT">
          <option value="CONTRACT">Contract</option>
          <option value="PASSPORT">Passport copy</option>
          <option value="EMIRATES_ID">Emirates ID copy</option>
          <option value="VISA">Visa or permit</option>
          <option value="INSURANCE">Medical insurance</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label className="block text-sm">
        Expiry (optional)
        <input className={FIELD} type="date" name="expiry" />
      </label>
      <label className="block text-sm">
        File (PDF or image, up to 5 MB)
        <input className="mt-1 block w-full text-sm file:mr-3 file:h-11 file:rounded-xl file:border file:border-line-strong file:bg-surface-2 file:px-3 file:text-txt" type="file" name="file" required accept="application/pdf,image/jpeg,image/png,image/webp" />
      </label>
      <Button type="submit" className="h-11" disabled={busy}>
        <Upload aria-hidden className="size-4" /> Upload
      </Button>
      <p role="status" className="min-h-5 text-sm sm:col-span-4">
        {message}
      </p>
    </form>
  );
}

export function DeleteDocument({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={OUTLINE}
      onClick={async () => {
        if (!window.confirm(`Delete ${label}? The file is removed too.`)) return;
        await fetch(`/api/household/documents/${id}`, { method: "DELETE" }).catch(() => null);
        router.refresh();
      }}
    >
      <Trash2 aria-hidden className="size-4" /> Delete <span className="sr-only">{label}</span>
    </Button>
  );
}

export function PhotoUpload({ employeeId, name }: { employeeId: string; name: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return (
    <div>
      <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-line-strong px-3 text-sm text-dim hover:text-txt focus-within:outline-2 focus-within:outline-brand">
        <Upload aria-hidden className="size-4" />
        {"Change photo"} <span className="sr-only">of {name}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const form = new FormData();
            form.set("file", file);
            setMessage("Uploading…");
            const error = await upload(`/api/household/employees/${employeeId}/photo`, form);
            setMessage(error ?? "");
            if (!error) router.refresh();
          }}
        />
      </label>
      {message && (
        <p role="status" className="mt-1 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}

export function RemoveEmployee({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      className={OUTLINE}
      onClick={async () => {
        if (!window.confirm(`Remove ${name}? They're hidden from your lists, but their payroll history and payslips are kept.`)) return;
        const response = await fetch(`/api/household/employees/${id}`, { method: "DELETE" }).catch(() => null);
        if (response?.ok) {
          router.push("/household/employees");
          router.refresh();
        }
      }}
    >
      <Trash2 aria-hidden className="size-4" /> Remove employee
    </Button>
  );
}
