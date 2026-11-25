import type { ReactNode } from "react";
import { SectionTabs } from "@/components/SectionTabs";

export default function HouseholdLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <p className="font-mono text-xs tracking-wider text-accent-text uppercase">Household & Family · AED and PKR</p>
      <SectionTabs section="household" label="Household & Family" />
      <div className="mt-6">{children}</div>
    </>
  );
}
