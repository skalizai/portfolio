"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApplyDrawer } from "@/components/ApplyDrawer";
import { Button } from "@/components/ui/button";
import type { BoardCard } from "@/lib/applications/board";
import type { ScreeningAnswers } from "@/lib/search/screening.labels";

const COLUMNS = [
  { id: "drafts", title: "Drafts", statuses: ["DRAFT", "READY"] },
  { id: "applied", title: "Applied", statuses: ["SUBMITTED", "OPENED_EXTERNALLY"] },
  { id: "interview", title: "Interview", statuses: ["INTERVIEW"] },
  { id: "offer", title: "Offer", statuses: ["OFFER"] },
  { id: "closed", title: "Closed", statuses: ["REJECTED", "WITHDRAWN"] },
];

const STAGES = [
  { value: "SUBMITTED", label: "Applied" },
  { value: "INTERVIEW", label: "Interview" },
  { value: "OFFER", label: "Offer" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];

const FIELD = "mt-1 w-full rounded-md border border-line-strong bg-bg px-2 py-1.5 text-sm text-txt";
const OUTLINE = "border border-line-strong";
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" });

function Card({ card, onOpen, onDone }: { card: BoardCard; onOpen: () => void; onDone: (message: string) => void }) {
  const [notes, setNotes] = useState(card.notes ?? "");
  const name = `${card.job.title} at ${card.job.company}`;

  async function update(body: { status?: string; notes?: string }, success: string) {
    const response = await fetch(`/api/applications/${card.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (response?.ok) {
      onDone(success);
      return;
    }
    const result = await response?.json().catch(() => null);
    onDone(result?.error ?? "Couldn't update this application. Please try again.");
  }

  return (
    <li className="rounded-lg border border-line bg-bg p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 font-semibold break-words">{card.job.title}</h3>
        {card.score !== null && <span className="font-mono font-semibold">{card.score}</span>}
      </div>
      <p className="mt-1 break-words">
        {card.job.company}
        {card.job.location ? ` · ${card.job.location}` : ""}
      </p>
      {card.submittedAt && <p className="mt-1 text-dim">Applied {dateFormat.format(new Date(card.submittedAt))}</p>}
      {card.job.applyEmail && (
        <p className="mt-1 break-words">
          <span className="text-dim">Email: </span>
          {card.job.applyEmail}
        </p>
      )}

      {card.submittedAt && (
        <label className="mt-2 block">
          Stage <span className="sr-only">for {name}</span>
          <select className={FIELD} value={card.status} onChange={(e) => update({ status: e.target.value }, "Stage updated.")}>
            {STAGES.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="mt-2 block">
        Notes <span className="sr-only">for {name}</span>
        <textarea className={FIELD} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" className={OUTLINE} onClick={() => update({ notes }, "Notes saved.")}>
          Save notes <span className="sr-only">for {name}</span>
        </Button>
        <Button type="button" size="sm" onClick={onOpen}>
          {card.submittedAt ? "View" : "Review draft"} <span className="sr-only">for {name}</span>
        </Button>
        {!card.submittedAt && card.status !== "WITHDRAWN" && !card.sendAt && (
          <Button type="button" variant="ghost" size="sm" className={OUTLINE} onClick={() => update({ status: "WITHDRAWN" }, "Moved to Closed.")}>
            Not applying <span className="sr-only">for {name}</span>
          </Button>
        )}
        {card.hasLetter && (
          <Button asChild variant="ghost" size="sm" className={OUTLINE}>
            <a href={`/api/applications/${card.id}/letter`}>
              Cover letter <span className="sr-only">for {name}</span>
            </a>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className={OUTLINE}>
          <a href={`/api/applications/${card.id}/cv`}>
            CV <span className="sr-only">for {name}</span>
          </a>
        </Button>
        <Button asChild variant="ghost" size="sm" className={OUTLINE}>
          <a href={card.job.url} target="_blank" rel="noopener noreferrer">
            Listing <span className="sr-only">for {name}, opens in a new tab</span>
          </a>
        </Button>
      </div>
    </li>
  );
}

/** Every application by stage. Stages change through a menu, so it works by keyboard and on a phone. */
export function ApplicationsBoard({ cards, screening }: { cards: BoardCard[]; screening: ScreeningAnswers }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  return (
    <>
      <p role="status" className="mt-2 min-h-5 text-sm">
        {message}
      </p>
      {cards.length === 0 ? (
        <p className="mt-2 rounded-xl border border-line bg-surface p-4 text-dim">No applications yet. Prepare a cover letter from the Matches page to start one.</p>
      ) : (
        <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((column) => {
            const inColumn = cards.filter((card) => column.statuses.includes(card.status));
            return (
              <section key={column.id} aria-label={column.title} className="min-w-0 rounded-xl border border-line bg-surface p-3">
                <h2 className="font-semibold">
                  {column.title} ({inColumn.length})
                </h2>
                {inColumn.length > 0 && (
                  <ul className="mt-2 grid gap-2">
                    {inColumn.map((card) => (
                      <Card
                        key={`${card.id}-${card.status}`}
                        card={card}
                        onOpen={() => setOpen(card.id)}
                        onDone={(text) => {
                          setMessage(text);
                          router.refresh();
                        }}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {open && (
        <ApplyDrawer
          key={open}
          applicationId={open}
          screening={screening}
          onClose={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
