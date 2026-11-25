import type { ReactNode } from "react";
import { SectionTabs } from "@/components/SectionTabs";

export default function HouseholdLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <p className="font-mono text-xs tracking-wider text-accent-text uppercase print:hidden">Household & Family · AED and PKR</p>
      <div className="print:hidden">
        <SectionTabs section="household" label="Household & Family" />
      </div>
      <div className="mt-6 print:mt-0">{children}</div>
    </>
  );
}
