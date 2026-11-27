-- Bank accounts are kept by bank, title and branch; the account number is no longer asked for.
ALTER TABLE "household"."BankAccount" ALTER COLUMN "accountNumber" SET DEFAULT '';
