import { ArrowLeft, Eye, Landmark, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/household/Avatar";
import { AddBankAccount } from "@/components/household/BankAccountForms";
import { RemoveButton } from "@/components/household/RemoveButton";
import { DeleteDocument, DocumentUpload, PhotoUpload } from "@/components/household/EmployeeExtras";
import { FamilyForm, RemoveFamilyMember } from "@/components/household/FamilyForm";
import { db } from "@/lib/db";
import { listBankAccounts } from "@/lib/household/bank-accounts";
import { ageOn, daysToBirthday, FAMILY_DOCUMENT_LABELS, FAMILY_RELATIONSHIP_LABELS, familyExpiries, whenText } from "@/lib/household/family";
import { toFamilyFormValues } from "@/lib/household/family-view";
import { formatAed, formatPkr, sum } from "@/lib/household/money";
import { getHouseholdSettings } from "@/lib/household/settings";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DOCUMENT_TYPES = Object.entries(FAMILY_DOCUMENT_LABELS) as [string, string][];

export default async function FamilyMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await db().familyMember.findFirst({ where: { id, deletedAt: null }, include: { documents: { orderBy: { createdAt: "desc" } }, recipient: true } });
  if (!member) notFound();
  const settings = await getHouseholdSettings();
  // Children are not sent money directly, so they have no bank accounts here.
  const takesMoney = member.relationship !== "SON" && member.relationship !== "DAUGHTER";
  const accounts = takesMoney ? await listBankAccounts(member.id) : [];

  const files = new Map((await db().storedFile.findMany({ where: { id: { in: member.documents.map((d) => d.fileId) } }, select: { id: true, filename: true, size: true } })).map((f) => [f.id, f]));
  const alerts = familyExpiries([member], settings.expiryAlertDays);
  const age = ageOn(member.dateOfBirth);
  const birthday = daysToBirthday(member.dateOfBirth);
  const year = new Date().getUTCFullYear();
  const sentThisYear = member.recipient
    ? await db().remittance.findMany({ where: { recipientId: member.recipient.id, deletedAt: null, date: { gte: new Date(Date.UTC(year, 0, 1)) } }, select: { amountAed: true, amountPkr: true } })
    : [];

  return (
    <>
      <Link href="/household/family" className="inline-flex items-center gap-1 text-sm text-dim hover:text-txt">
        <ArrowLeft aria-hidden className="size-4" /> All family
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-5">
        <Avatar fileId={member.photoFileId} name={member.fullName} alt={`Photo of ${member.fullName}`} className="size-24 rounded-3xl text-3xl" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs tracking-wider text-accent-text uppercase">{FAMILY_RELATIONSHIP_LABELS[member.relationship]}</p>
          <h1 className="text-3xl font-semibold break-words">{member.fullName}</h1>
          <p className="text-dim">
            {[
              age !== null && member.dateOfBirth ? `${age} ${age === 1 ? "year" : "years"}, born ${dateFormat.format(member.dateOfBirth)}` : null,
              birthday === 0 ? "Birthday today" : birthday !== null && birthday <= 30 ? `Birthday in ${birthday} ${birthday === 1 ? "day" : "days"}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <PhotoUpload action={`/api/household/family/${member.id}/photo`} name={member.fullName} />
      </div>

      {alerts.length > 0 && (
        <ul aria-label="Documents to renew" className="mt-5 space-y-2">
          {alerts.map((a) => (
            <li key={a.document} className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm">
              {a.name} {a.document} {whenText(a.daysLeft)} ({dateFormat.format(a.expiry)})
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <FamilyForm id={member.id} initial={toFamilyFormValues(member)} />
        </div>

        <aside className="min-w-0 space-y-5">
          {member.recipient && !member.recipient.deletedAt && (
            <section aria-labelledby="money-sent" className="rounded-[1.5rem] border border-line bg-surface p-5">
              <h2 id="money-sent" className="font-semibold">
                Money sent in {year}
              </h2>
              <p className="mt-2 font-display text-2xl font-semibold">{formatAed(sum(sentThisYear.map((r) => r.amountAed)))}</p>
              <p className="text-sm text-dim">
                {formatPkr(sum(sentThisYear.map((r) => r.amountPkr)))} received · {sentThisYear.length} {sentThisYear.length === 1 ? "transfer" : "transfers"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Link href={`/household/remittances?send=${member.recipient.id}#new-transfer`} className="inline-flex items-center gap-1 rounded-full border border-line-strong px-3 py-1.5 hover:bg-surface-2">
                  <Send aria-hidden className="size-4" /> Send money
                </Link>
                <Link href={`/household/remittances?recipientId=${member.recipient.id}`} className="inline-flex items-center rounded-full border border-line-strong px-3 py-1.5 hover:bg-surface-2">
                  See transfers <span className="sr-only">to {member.fullName}</span>
                </Link>
              </div>
            </section>
          )}

          <section aria-labelledby="documents" className="rounded-[1.5rem] border border-line bg-surface p-5">
            <h2 id="documents" className="font-semibold">
              Documents ({member.documents.length})
            </h2>
            {member.documents.length ? (
              <ul className="mt-3 space-y-3 text-sm">
                {member.documents.map((d) => {
                  const file = files.get(d.fileId);
                  const label = `${FAMILY_DOCUMENT_LABELS[d.type]}${file ? `, ${file.filename}` : ""}`;
                  return (
                    <li key={d.id} className="rounded-xl border border-line p-3">
                      <p className="font-medium break-words">{FAMILY_DOCUMENT_LABELS[d.type]}</p>
                      <p className="text-dim break-words">
                        {file?.filename} {file ? `· ${Math.max(1, Math.round(file.size / 1024))} KB` : ""}
                        {d.expiry ? ` · expires ${dateFormat.format(d.expiry)}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <a href={`/api/household/files/${d.fileId}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong px-3 text-dim hover:text-txt">
                          <Eye aria-hidden className="size-4" /> View <span className="sr-only">{label} (opens in a new tab)</span>
                        </a>
                        <DeleteDocument path={`/api/household/family-documents/${d.id}`} label={label} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-dim">No copies yet.</p>
            )}
          </section>
        </aside>
      </div>

      {takesMoney && (
        <section aria-labelledby="bank-accounts" className="mt-5 rounded-[1.5rem] border border-line bg-surface p-5">
          <h2 id="bank-accounts" className="flex items-center gap-2 font-semibold">
            <Landmark aria-hidden className="size-5 text-dim" /> Bank accounts ({accounts.length})
          </h2>
          <p className="mt-1 text-sm text-dim">Chosen under &ldquo;To account&rdquo; when you record money sent to {member.relationship === "SELF" ? "yourself" : member.fullName}.</p>
          {accounts.length > 0 && (
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {accounts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line p-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {a.bankName}
                      {a.isPrimary && <span className="ml-2 rounded-md bg-chip px-1.5 py-0.5 text-[11px] font-semibold text-on-accent">Main</span>}
                    </p>
                    {a.accountTitle && <p className="text-dim">{a.accountTitle}</p>}
                    {a.branch && <p className="text-dim">{a.branch}</p>}
                  </div>
                  <RemoveButton path={`/api/household/bank-accounts/${a.id}`} label={`${a.bankName} account`} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <AddBankAccount memberId={member.id} name={member.fullName} />
          </div>
        </section>
      )}

      <section aria-labelledby="upload" className="mt-5 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="upload" className="font-semibold">
          Upload a document
        </h2>
        <p className="mt-1 text-sm text-dim">Passport, CNIC or B-Form, Emirates ID, visa, birth certificate, nikah nama. Only you can open them.</p>
        <div className="mt-3">
          <DocumentUpload action={`/api/household/family/${member.id}/documents`} types={DOCUMENT_TYPES} />
        </div>
      </section>

      <div className="mt-5">
        <RemoveFamilyMember id={member.id} name={member.fullName} />
      </div>
    </>
  );
}
