import type { ScorableJob } from "@/lib/matching/llmScore";

/** Invented job descriptions, with the outcome each should get for an SAP integration architect. */
export type FixtureJob = ScorableJob & { expected: "strong" | "weak" | "reject"; postedAt: Date | null };

const job = (overrides: Omit<FixtureJob, "workMode" | "employmentType" | "postedAt">): FixtureJob => ({
  workMode: null,
  employmentType: "full-time",
  postedAt: null,
  ...overrides,
});

export const FIXTURE_JOBS: FixtureJob[] = [
  job({
    expected: "strong",
    title: "Senior SAP Integration Architect",
    company: "Gulf Energy Group",
    location: "Dubai, UAE",
    description:
      "Own the integration architecture across our S/4HANA landscape. Design and lead delivery on SAP Integration Suite (CPI) and BTP, migrating interfaces from PI/PO. Define standards for IDoc, OData and API integration, support our RISE with SAP programme and clean core approach, and lead a team of eight developers. 15+ years in SAP with strong ABAP background required.",
  }),
  job({
    expected: "strong",
    title: "SAP Technical Lead",
    company: "Emirates Manufacturing",
    location: "Abu Dhabi",
    description:
      "Lead the SAP technical team through our S/4HANA transformation. Hands-on ABAP on HANA, CDS Views, RAP and OData, with RICEFW delivery across MM, SD and PP. Oversee CPI interfaces and e-Invoicing integration, and act as technical authority working with business and vendors. 10+ years of SAP technical leadership in manufacturing or energy.",
  }),
  job({
    expected: "weak",
    title: "Senior SAP SuccessFactors Consultant",
    company: "People Partners",
    location: "Dubai",
    description:
      "Implement SuccessFactors Employee Central, Recruiting and Performance modules for regional clients. Run HR process workshops and configure payroll. Some awareness of integration to S/4HANA through BTP is useful, though specialists handle that work. SuccessFactors certification required.",
  }),
  job({
    expected: "weak",
    title: "Senior SAP FICO Functional Consultant",
    company: "Finance Advisory LLC",
    location: "Riyadh, Saudi Arabia",
    description:
      "Functional finance consultant for S/4HANA Finance. Configure GL, AP, AR, asset accounting and controlling, and run IFRS reporting workshops with the CFO's team. A CA or ACCA qualification and 8 years of FICO configuration are essential. Able to read ABAP specifications when working with developers.",
  }),
  job({
    expected: "reject",
    title: "Junior SAP ABAP Developer",
    company: "Starter Tech",
    location: "Dubai",
    description: "An entry role for a graduate with up to 2 years of ABAP. You will fix defects and write simple reports with S/4HANA, under close supervision.",
  }),
];
