import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ExpiryAlert } from "@/lib/household/employees";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Documents expiring soon, worded so the urgency doesn't rely on colour. */
export function ExpiryAlerts({ alerts, windowDays, linkNames = true }: { alerts: ExpiryAlert[]; windowDays: number; linkNames?: boolean }) {
  if (!alerts.length) return null;
  return (
    <section aria-labelledby="expiry-alerts" className="rounded-[1.5rem] border border-brand-2/60 bg-brand-2/10 p-5">
      <h2 id="expiry-alerts" className="flex items-center gap-2 font-semibold">
        <TriangleAlert aria-hidden className="size-5 text-brand-2" />
        {alerts.length} {alerts.length === 1 ? "document needs" : "documents need"} attention
        <span className="text-sm font-normal text-dim">within {windowDays} days</span>
      </h2>
      <ul className="mt-3 space-y-1 text-sm">
        {alerts.map((a) => (
          <li key={`${a.employeeId}-${a.document}`} className="flex flex-wrap gap-x-2">
            {linkNames ? (
              <Link href={`/household/employees/${a.employeeId}`} className="font-medium underline">
                {a.employeeName}
              </Link>
            ) : (
              <span className="font-medium">{a.employeeName}</span>
            )}
            <span>· {a.document}</span>
            <span className={a.daysLeft < 0 ? "font-semibold" : "text-dim"}>
              {a.daysLeft < 0 ? `expired ${-a.daysLeft} ${a.daysLeft === -1 ? "day" : "days"} ago` : a.daysLeft === 0 ? "expires today" : `expires in ${a.daysLeft} ${a.daysLeft === 1 ? "day" : "days"}`} ({dateFormat.format(a.expiry)})
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
