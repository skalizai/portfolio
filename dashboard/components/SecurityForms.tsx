"use client";

import { KeyRound, LogOut, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";
const MIN = 12;

async function post(path: string, body: object): Promise<{ ok: boolean; data: Record<string, string> }> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = (await response?.json().catch(() => null)) ?? {};
  return { ok: Boolean(response?.ok), data };
}

const read = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? "");

function CodeField() {
  return (
    <label className="block text-sm">
      6-digit code from the email
      <input className={`${FIELD} font-mono tracking-[0.4em]`} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
    </label>
  );
}

function NewPasswordFields() {
  return (
    <>
      <label className="block text-sm">
        New password
        <input className={FIELD} type="password" name="next" autoComplete="new-password" minLength={MIN} required aria-describedby="password-rule" />
      </label>
      <label className="block text-sm">
        New password again
        <input className={FIELD} type="password" name="again" autoComplete="new-password" minLength={MIN} required />
      </label>
      <p id="password-rule" className="text-xs text-dim sm:col-span-2">
        At least {MIN} characters. A few unrelated words together are strong and easy to remember.
      </p>
    </>
  );
}

/** Change your password: current and new password, then the code emailed to your primary address. */
export function ChangePassword() {
  const [step, setStep] = useState<"details" | "code">("details");
  const [sentTo, setSentTo] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (read(form, "next") !== read(form, "again")) return setMessage("The two new passwords don't match.");
    setBusy(true);
    setMessage("Checking and sending a code…");
    const { ok, data } = await post("/api/security/password/start", { current: read(form, "current"), next: read(form, "next") });
    setBusy(false);
    if (!ok) return setMessage(data.error ?? "Couldn't send a code. Please try again.");
    setSentTo(data.sentTo ?? "your email");
    setMessage("");
    setStep("code");
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("Confirming…");
    const { ok, data } = await post("/api/security/password/confirm", { code: read(event.currentTarget, "code") });
    setBusy(false);
    if (!ok) return setMessage(data.error ?? "Couldn't confirm that. Please try again.");
    // Every session ends with the change, so this one goes to sign in with the new password.
    window.location.assign("/session-ended?reason=changed");
  }

  if (step === "code") {
    return (
      <form onSubmit={confirm} className="space-y-4">
        <p className="flex items-start gap-2 text-sm">
          <MailCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
          <span>
            We emailed a code to <strong>{sentTo}</strong>. It works for 10 minutes. Once it&apos;s confirmed, every device is signed out and you sign in again with the new password.
          </span>
        </p>
        <div className="max-w-xs">
          <CodeField />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="h-11" disabled={busy}>
            Confirm and change password
          </Button>
          <Button type="button" variant="ghost" className="h-11 border border-line-strong" onClick={() => (setStep("details"), setMessage(""))}>
            Start again
          </Button>
        </div>
        <p role="status" className="min-h-5 text-sm">
          {message}
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={start} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
          Current password
          <input className={FIELD} type="password" name="current" autoComplete="current-password" required />
        </label>
        <NewPasswordFields />
      </div>
      <Button type="submit" className="h-11" disabled={busy}>
        <KeyRound aria-hidden className="size-4" /> Email me a code
      </Button>
      <p role="status" className="min-h-5 text-sm">
        {message}
      </p>
    </form>
  );
}

export function SignOutEverywhere() {
  const [message, setMessage] = useState("");
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        className="h-11 border border-line-strong"
        onClick={async () => {
          if (!window.confirm("Sign out on every device, including this one?")) return;
          const { ok } = await post("/api/security/sign-out-everywhere", {});
          if (!ok) return setMessage("Couldn't do that. Please try again.");
          window.location.assign("/session-ended?reason=everywhere");
        }}
      >
        <LogOut aria-hidden className="size-4" /> Sign out everywhere
      </Button>
      {message && (
        <p role="status" className="mt-1 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}

/** Forgot your password: your email, then the code and a new password. */
export function ResetPassword() {
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = read(event.currentTarget, "email").trim();
    setBusy(true);
    await post("/api/security/reset/start", { email: value });
    setBusy(false);
    setEmail(value);
    setMessage("");
    setStep("code");
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (read(form, "next") !== read(form, "again")) return setMessage("The two new passwords don't match.");
    setBusy(true);
    setMessage("Saving…");
    const { ok, data } = await post("/api/security/reset/confirm", { email, code: read(form, "code"), next: read(form, "next") });
    setBusy(false);
    if (!ok) return setMessage(data.error ?? "Couldn't reset it. Please try again.");
    setMessage("");
    setStep("done");
  }

  if (step === "done") {
    return (
      <div className="space-y-4">
        <p role="status" className="text-sm">
          Your password is reset, and every device was signed out.
        </p>
        <Button asChild className="h-11 w-full rounded-xl">
          <Link href="/login?notice=reset">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={confirm} className="space-y-4">
        <p className="text-sm text-dim">If {email} is this dashboard&apos;s email, a 6-digit code is on its way. It works for 10 minutes.</p>
        <CodeField />
        <NewPasswordFields />
        <Button type="submit" className="h-11 w-full rounded-xl" disabled={busy}>
          Set new password
        </Button>
        <button type="button" className="text-sm text-dim underline hover:text-txt" onClick={() => (setStep("email"), setMessage(""))}>
          Send another code
        </button>
        <p role="status" className="min-h-5 text-sm">
          {message}
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={start} className="space-y-4">
      <label className="block text-sm">
        Email
        <input className={FIELD} type="email" name="email" autoComplete="username" required defaultValue={email} />
      </label>
      <Button type="submit" className="h-11 w-full rounded-xl" disabled={busy}>
        Email me a code
      </Button>
    </form>
  );
}
