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

## Security

The shield in the top bar opens **Security**:

- **Change password**: your current password and a new one (12 characters or more), then a six-digit
  code emailed to your primary email (the one you sign in with) to confirm. Once confirmed, every device
  is signed out and you sign in with the new password. You're emailed when it changes.
- **Forgot your password?** on the sign-in page: your email, then the emailed code and a new password.
  The page answers the same whatever email is typed, and only sends a code to yours.
- **Sign out everywhere** ends every session, including this one.
- **Recent activity**: sign-ins, wrong passwords and password changes.

Codes last 10 minutes, allow 5 tries and can be used once. At most one is sent a minute and five an hour;
only their hashes are stored. The password hash is kept in the database once it's set from Security
(or with `npm run auth:set-password`); until then the `AUTH_PASSWORD_HASH` setting is used. Emails go
through Resend, the same way as the daily digest.

## Household & Family

Your family and their documents, household staff in Pakistan, their pay and advances, money sent home,
and other household spending.
Open it from **Household & Family** in the top bar.

| Tab | What it does |
| --- | --- |
| Overview | Choose a month: payroll paid, advances outstanding, money sent home (and to your wife), expenses and total outflow, for the month and the year to date. A six-month outflow chart, shares by recipient, purpose and category, document expiries, open advances, the month's payroll and recent transfers. |
| Family | You, your wife, children and other family: photo, date of birth, blood group, CNIC or B-Form, passport, and Emirates ID and visa for anyone in the UAE, with copies of documents. Passports are flagged six months before they expire; birthdays in the coming week show on Home. Lists show only the last 4 characters of numbers. |
| Employees | Staff records: CNIC and Cantt Pass with expiry dates, pay in PKR with allowances, cash or bank transfer, documents and a photo. Lists show only the last 4 characters of CNICs and IBANs. |
| Advances | Advances repaid in one go, at a fixed amount a month, or on a custom schedule. Change or skip one month, or change the monthly amount for the rest; what's owed is always repaid in full. |
| Payroll | One run a month: prepared from active staff with that month's advance repayment, then edited (overtime, Eid gift, unpaid days at basic ÷ 30), approved, and marked paid. Reopening needs a reason. |
| Payslips | Frozen when payroll is paid. View and print, download as PDF, or all of a month as a ZIP. |
| Remittances | Transfers home in AED to your family, your staff or anyone else you add, with the rate, the PKR received (worked out, or as entered), fee, channel, purpose and receipt. Totals by recipient, purpose and month, the average rate, and optional monthly targets. |
| Expenses | Spending in AED or PKR (converted to AED). Category budgets warn at 80% and when passed. Monthly expenses such as rent appear on their day as "to confirm". |
| Settings | Household name and address for payslips, the default PKR per AED rate, payroll day, expiry alert window, and demo data. |

**Money.** Payroll, salaries and advances are in PKR. Remittances are sent in AED and received in PKR.
Expenses are totalled in AED. All amounts are exact decimals, rounded half up to 2 places. Payroll is
shown in AED on the Overview at the default rate from Settings.

**Records.** Every change to employees, advances, payroll, transfers and expenses is written to an
audit log with before and after values. Deleting hides a record but keeps it. Every list exports to
Excel (.xlsx).

**Family and staff as recipients.** Each family member (except you) and each employee is a recipient
for transfers, listed under Family and Staff in "Sent to", and named as in their record. Removing
someone, or an employee leaving, hides them there; what was sent to them stays. The first time your wife,
mother or father is added, an existing recipient with that relationship (such as the built-in "Wife")
becomes theirs, so earlier transfers stay with them.

**Files.** Documents and receipts are PDFs or JPEG, PNG or WebP images up to 5 MB. They're kept in
the database and served only to a signed-in session.

**Monthly expenses.** The daily 05:00 UTC cron (`/api/cron/digest`) adds each month's recurring
expenses. Opening the Expenses tab does the same, and each one is added only once a month.

**Demo data.** Settings → **Load demo data** adds two staff, an advance, two paid payroll months, three
transfers and a few expenses, all named "(demo)". **Clear demo data** removes exactly those.

**Where the code is.** The rules are in `lib/household/` (`payroll-calc.ts` and `money.ts` are pure and
fully tested), the pages are in `app/(app)/household/`, and the API is in `app/api/household/`. The
tables are in the `household` schema in `prisma/schema.prisma`.
