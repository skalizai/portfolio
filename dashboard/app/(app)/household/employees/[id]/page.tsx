import { ArrowLeft, Eye } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteDocument, DocumentUpload, PhotoUpload, RemoveEmployee } from "@/components/household/EmployeeExtras";
import { EmployeeForm } from "@/components/household/EmployeeForm";
import { ExpiryAlerts } from "@/components/household/ExpiryAlerts";
import { db } from "@/lib/db";
import { toFormValues } from "@/lib/household/employee-view";
import { DOCUMENT_LABELS, estimatedGratuity, expiryAlerts } from "@/lib/household/employees";
import { formatPkr } from "@/lib/household/money";
import { getHouseholdSettings } from "@/lib/household/settings";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employee = await db().employee.findFirst({
    where: { id, deletedAt: null },
    include: { allowances: true, documents: { orderBy: { createdAt: "desc" } } },
  });
  const settings = await getHouseholdSettings();
  if (!employee) notFound();

  const files = new Map((await db().storedFile.findMany({ where: { id: { in: employee.documents.map((d) => d.fileId) } }, select: { id: true, filename: true, size: true } })).map((f) => [f.id, f]));
  const alerts = expiryAlerts([employee], settings.expiryAlertDays);
  const gratuity = estimatedGratuity(employee.basicSalary, employee.joiningDate, settings.gratuityDaysPerYear);

  return (
    <>
      <Link href="/household/employees" className="inline-flex items-center gap-1 text-sm text-dim hover:text-txt">
        <ArrowLeft aria-hidden className="size-4" /> All employees
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {employee.photoFileId ? (
          // Served behind sign-in, so it can't go through the image optimiser.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/household/files/${employee.photoFileId}`} alt={`Photo of ${employee.fullName}`} className="size-20 rounded-full object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold break-words">{employee.fullName}</h1>
          <p className="text-dim">
            {employee.role} · joined {dateFormat.format(employee.joiningDate)}
          </p>
        </div>
        <PhotoUpload employeeId={employee.id} name={employee.fullName} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          <ExpiryAlerts alerts={alerts} windowDays={settings.expiryAlertDays} linkNames={false} />
          <EmployeeForm employeeId={employee.id} initial={toFormValues(employee)} />
        </div>

        <aside className="min-w-0 space-y-5">
          <section aria-labelledby="gratuity" className="rounded-[1.5rem] border border-line bg-surface p-5">
            <h2 id="gratuity" className="font-semibold">
              Estimated gratuity
            </h2>
            <p className="mt-2 font-display text-3xl font-semibold">{formatPkr(gratuity.amount)}</p>
            <p className="mt-2 text-sm text-dim">
              An estimate only: {gratuity.years} completed {gratuity.years === 1 ? "year" : "years"} × {settings.gratuityDaysPerYear.toString()} days of basic pay (basic ÷ 30 a day). The
              real amount depends on the contract and the law.
            </p>
          </section>

          <section aria-labelledby="documents" className="rounded-[1.5rem] border border-line bg-surface p-5">
            <h2 id="documents" className="font-semibold">
              Documents ({employee.documents.length})
            </h2>
            {employee.documents.length ? (
              <ul className="mt-3 space-y-3 text-sm">
                {employee.documents.map((d) => {
                  const file = files.get(d.fileId);
                  const label = `${DOCUMENT_LABELS[d.type]}${file ? `, ${file.filename}` : ""}`;
                  return (
                    <li key={d.id} className="rounded-xl border border-line p-3">
                      <p className="font-medium break-words">{DOCUMENT_LABELS[d.type]}</p>
                      <p className="text-dim break-words">
                        {file?.filename} {file ? `· ${Math.max(1, Math.round(file.size / 1024))} KB` : ""}
                        {d.expiry ? ` · expires ${dateFormat.format(d.expiry)}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <a href={`/api/household/files/${d.fileId}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md border border-line-strong px-3 text-dim hover:text-txt">
                          <Eye aria-hidden className="size-4" /> View <span className="sr-only">{label} (opens in a new tab)</span>
                        </a>
                        <DeleteDocument id={d.id} label={label} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-dim">No documents yet.</p>
            )}
          </section>
        </aside>
      </div>

      <section aria-labelledby="upload" className="mt-5 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="upload" className="font-semibold">
          Upload a document
        </h2>
        <p className="mt-1 text-sm text-dim">CNIC copy, Cantt Pass copy, contract and so on. Only you can open them.</p>
        <div className="mt-3">
          <DocumentUpload employeeId={employee.id} />
        </div>
      </section>

      <div className="mt-5">
        <RemoveEmployee id={employee.id} name={employee.fullName} />
      </div>
    </>
  );
}
