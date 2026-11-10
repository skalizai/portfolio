import { ArrowLeftRight, BriefcaseBusiness, FileText, Landmark, PieChart, ScrollText, Settings, UserRound } from "lucide-react";

/** Every section of the dashboard, used by the Job Dashboard menu and the landing page. */
export const DASHBOARD_LINKS = [
  { href: "/matches", label: "Job Matches", icon: BriefcaseBusiness },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/logs", label: "Logs", icon: ScrollText },
];

/** The investment pages, shown as tabs on each of them. */
export const INVESTMENT_LINKS = [
  { href: "/investments", label: "Overview", icon: PieChart },
  { href: "/investments/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/investments/accounts", label: "Accounts", icon: Landmark },
];
