import type { ReactNode } from "react";
import { InvestmentsTabs } from "@/components/InvestmentsTabs";

export default function InvestmentsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <p className="font-mono text-xs tracking-wider text-accent-text uppercase">Investments · in AED</p>
      <InvestmentsTabs />
      <div className="mt-6">{children}</div>
    </>
  );
}
