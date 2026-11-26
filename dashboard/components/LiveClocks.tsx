"use client";

import { useEffect, useState } from "react";

const CLOCKS = [
  { label: "Dubai", timeZone: "Asia/Dubai" },
  { label: "Pakistan", timeZone: "Asia/Karachi" },
];

const format = (timeZone: string, date: Date) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(date);

/** The time here and at home, kept current while the page is open. */
export function LiveClocks({ start }: { start: string }) {
  const [now, setNow] = useState(() => new Date(start));
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {CLOCKS.map(({ label, timeZone }) => (
        <div key={label} className="rounded-2xl border border-line bg-surface/70 px-4 py-3">
          <dt className="text-xs tracking-wider text-dim uppercase">{label}</dt>
          <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">
            <time suppressHydrationWarning>{format(timeZone, now)}</time>
          </dd>
        </div>
      ))}
    </>
  );
}
