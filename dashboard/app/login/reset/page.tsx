import Link from "next/link";
import { ResetPassword } from "@/components/SecurityForms";

export const metadata = { title: "Reset password · Sohail · Home" };

export default function ResetPasswordPage() {
  return (
    <main className="bg-glow flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[2rem] border border-line bg-surface p-6 sm:p-8">
        <p className="flex items-center gap-2 font-display text-lg font-semibold">
          <span aria-hidden className="bg-gradient-accent size-2.5 rounded-full" />
          <span>
            Sohail<span className="text-accent-text">/home</span>
          </span>
        </p>
        <h1 className="mt-6 text-2xl font-semibold">Reset your password</h1>
        <p className="mt-2 text-sm text-dim">Enter the email you sign in with. A code is sent there to confirm it&apos;s you.</p>
        <div className="mt-6">
          <ResetPassword />
        </div>
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-dim underline hover:text-txt">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
