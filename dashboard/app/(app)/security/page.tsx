import { CircleAlert, Mail, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { ChangePassword, SignOutEverywhere } from "@/components/SecurityForms";
import { credentialInfo } from "@/lib/security/credentials";
import { maskEmail, primaryEmail } from "@/lib/security/email";
import { recentActivity } from "@/lib/security/flows";

export const metadata = { title: "Security · Sohail · Home" };

const timeFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" });

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-[1.5rem] border border-line bg-surface p-5 sm:p-6">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function SecurityPage() {
  const [info, activity] = await Promise.all([credentialInfo(), recentActivity()]);
  const email = primaryEmail();

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="bg-gradient-accent flex size-11 items-center justify-center rounded-2xl text-on-accent">
          <ShieldCheck aria-hidden className="size-5" />
        </span>
        <div>
          <h1 className="text-3xl font-semibold">Security</h1>
          <p className="text-dim">Your password, your devices, and recent sign-in activity.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-5">
          <Panel id="password" title="Change password">
            <p className="mb-4 text-sm text-dim">
              {info.changedAt ? `Last changed ${timeFormat.format(info.changedAt)}.` : "Still the password set up on the server."} To change it, enter the current one and a new one; a code is then emailed to your primary email to confirm it&apos;s you.
            </p>
            <ChangePassword />
          </Panel>

          <Panel id="devices" title="Devices">
            <p className="mb-4 text-sm text-dim">
              Signed in somewhere you shouldn&apos;t be, such as a shared computer? This ends every session, including this one.
              {info.sessionsValidFrom ? ` Last done ${timeFormat.format(info.sessionsValidFrom)}.` : ""}
            </p>
            <SignOutEverywhere />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel id="primary-email" title="Primary email">
            <p className="flex items-center gap-2 font-mono text-sm">
              <Mail aria-hidden className="size-4 text-brand" />
              {maskEmail(email)}
            </p>
            <p className="mt-2 text-sm text-dim">You sign in with this email. Verification codes and alerts about password changes go to it, and it&apos;s how you reset a forgotten password from the sign-in page.</p>
          </Panel>

          <Panel id="activity" title="Recent activity">
            {activity.length ? (
              <ul className="space-y-2 text-sm">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 border-b border-line pb-2 last:border-0">
                    <span className="flex items-start gap-2">
                      {a.warning && <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-2" />}
                      {a.label}
                    </span>
                    <time className="shrink-0 text-xs text-dim" dateTime={a.at.toISOString()}>
                      {timeFormat.format(a.at)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-dim">Nothing yet.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
