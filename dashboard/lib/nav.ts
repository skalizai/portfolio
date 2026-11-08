import { BriefcaseBusiness, FileText, ScrollText, Settings, UserRound } from "lucide-react";

/** Every section of the dashboard, used by the Job Dashboard menu and the landing page. */
export const DASHBOARD_LINKS = [
  { href: "/matches", label: "Job Matches", icon: BriefcaseBusiness },
  { href: "/applications", label: "Applications", icon: FileText },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/logs", label: "Logs", icon: ScrollText },
];
