# Dashboard

A private dashboard for one person, behind email and password sign-in: a job search, investments,
and household payroll and family money. It runs on Next.js on Vercel, with Postgres on Supabase.

```bash
npm install
npm run dev             # http://localhost:3000
npm test                # unit tests (each database test runs its own in-memory Postgres)
npm run test:e2e        # browser tests; stop the dev server on port 3000 first
npm run db:deploy       # apply migrations to the database in DATABASE_URL
```

## Household & Family

Household staff in Pakistan, their pay and advances, money sent home, and other household spending.
Open it from **Household & Family** in the top bar.

| Tab | What it does |
| --- | --- |
| Overview | Choose a month: payroll paid, advances outstanding, money sent home (and to your wife), expenses and total outflow, for the month and the year to date. A six-month outflow chart, shares by recipient, purpose and category, document expiries, open advances, the month's payroll and recent transfers. |
| Employees | Staff records: CNIC and Cantt Pass with expiry dates, pay in PKR with allowances, cash or bank transfer, documents and a photo. Lists show only the last 4 characters of CNICs and IBANs. |
| Advances | Advances repaid in one go, at a fixed amount a month, or on a custom schedule. Change or skip one month, or change the monthly amount for the rest; what's owed is always repaid in full. |
| Payroll | One run a month: prepared from active staff with that month's advance repayment, then edited (overtime, Eid gift, unpaid days at basic ÷ 30), approved, and marked paid. Reopening needs a reason. |
| Payslips | Frozen when payroll is paid. View and print, download as PDF, or all of a month as a ZIP. |
| Remittances | Transfers home in AED, with the rate, the PKR received (worked out, or as entered), fee, channel, purpose and receipt. Totals by recipient, purpose and month, the average rate, and optional monthly targets. |
| Expenses | Spending in AED or PKR (converted to AED). Category budgets warn at 80% and when passed. Monthly expenses such as rent appear on their day as "to confirm". |
| Settings | Household name and address for payslips, the default PKR per AED rate, payroll day, expiry alert window, and demo data. |

**Money.** Payroll, salaries and advances are in PKR. Remittances are sent in AED and received in PKR.
Expenses are totalled in AED. All amounts are exact decimals, rounded half up to 2 places. Payroll is
shown in AED on the Overview at the default rate from Settings.

**Records.** Every change to employees, advances, payroll, transfers and expenses is written to an
audit log with before and after values. Deleting hides a record but keeps it. Every list exports to
Excel (.xlsx).

**Files.** Documents and receipts are PDFs or JPEG, PNG or WebP images up to 5 MB. They're kept in
the database and served only to a signed-in session.

**Monthly expenses.** The daily 05:00 UTC cron (`/api/cron/digest`) adds each month's recurring
expenses. Opening the Expenses tab does the same, and each one is added only once a month.

**Demo data.** Settings → **Load demo data** adds two staff, an advance, two paid payroll months, three
transfers and a few expenses, all named "(demo)". **Clear demo data** removes exactly those.

**Where the code is.** The rules are in `lib/household/` (`payroll-calc.ts` and `money.ts` are pure and
fully tested), the pages are in `app/(app)/household/`, and the API is in `app/api/household/`. The
tables are in the `household` schema in `prisma/schema.prisma`.
