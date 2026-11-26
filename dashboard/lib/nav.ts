import { ArrowLeftRight, BriefcaseBusiness, FileText, HandCoins, Landmark, LayoutDashboard, PieChart, Receipt, ScrollText, Send, Settings, UserRound, Users, Wallet } from "lucide-react";

/** Every section of the dashboard, used by the Career menu and the Home page. */
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

/** The Household & Family pages, shown as tabs on each of them. */
export const HOUSEHOLD_LINKS = [
  { href: "/household", label: "Overview", icon: LayoutDashboard },
  { href: "/household/employees", label: "Employees", icon: Users },
  { href: "/household/advances", label: "Advances", icon: HandCoins },
  { href: "/household/payroll", label: "Payroll", icon: Wallet },
  { href: "/household/payslips", label: "Payslips", icon: FileText },
  { href: "/household/remittances", label: "Remittances", icon: Send },
  { href: "/household/expenses", label: "Expenses", icon: Receipt },
  { href: "/household/settings", label: "Settings", icon: Settings },
];
