"use client";

import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type PickerMember = {
  id: string;
  name: string;
  firstName: string;
  relation: string;
  age: number | null;
  photoFileId: string | null;
  sendTo: string | null;
  notes: string[];
};

function Face({ member, picked }: { member: PickerMember; picked: boolean }) {
  const initials = member.name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "relative flex size-28 items-center justify-center overflow-hidden rounded-full bg-surface-2 ring-offset-4 ring-offset-bg transition sm:size-36",
        picked ? "ring-2 ring-brand shadow-[0_0_40px_-6px] shadow-brand/50" : "ring-1 ring-line group-hover:ring-line-strong",
      )}
    >
      {member.photoFileId ? (
        // Served behind sign-in, so it can't go through the image optimiser.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/household/files/${member.photoFileId}`} alt="" className={cn("size-full object-cover", picked ? "" : "photo-mono group-hover:filter-none")} />
      ) : (
        <span aria-hidden className="font-display text-3xl font-semibold text-dim sm:text-4xl">
          {initials}
        </span>
      )}
      {picked && (
        <>
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-brand/45 via-brand/10 to-transparent" />
          <span aria-hidden className="animate-pop absolute flex size-12 items-center justify-center rounded-full bg-brand text-on-accent shadow-lg">
            <Check className="size-6" strokeWidth={3} />
          </span>
        </>
      )}
    </span>
  );
}

/** "Pick family member": big round photos; picking one shows their details and what you can do for them. */
export function FamilyPicker({ members }: { members: PickerMember[] }) {
  const [pickedId, setPickedId] = useState(members[0]?.id ?? null);
  const row = useRef<HTMLUListElement>(null);
  const picked = members.find((m) => m.id === pickedId) ?? null;
  const scroll = (direction: number) => row.current?.scrollBy({ left: direction * 320, behavior: "smooth" });

  return (
    <div>
      <div className="relative">
        <ul ref={row} aria-label="Family members" className="flex snap-x gap-4 overflow-x-auto px-1 pt-2 pb-3 [scrollbar-width:none] sm:gap-7">
          {members.map((m) => {
            const isPicked = m.id === pickedId;
            return (
              <li key={m.id} className="snap-start">
                <button type="button" aria-pressed={isPicked} onClick={() => setPickedId(m.id)} className="group flex w-28 cursor-pointer flex-col items-center gap-3 rounded-2xl text-center sm:w-36">
                  <Face member={m} picked={isPicked} />
                  <span className="w-full">
                    <span className={cn("block truncate font-medium", isPicked ? "text-accent-text" : "text-txt")}>{m.firstName}</span>
                    <span className="block truncate text-xs text-dim">
                      {m.relation}
                      {m.age !== null ? ` · ${m.age}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          <li className="snap-start">
            <Link href="/household/family/new" className="group flex w-28 flex-col items-center gap-3 text-center sm:w-36">
              <span className="flex size-28 items-center justify-center rounded-full border-2 border-dashed border-line-strong text-dim transition group-hover:border-brand group-hover:text-txt sm:size-36">
                <Plus aria-hidden className="size-7" />
              </span>
              <span className="w-full">
                <span className="block font-medium">Add</span>
                <span className="block text-xs text-dim">family member</span>
              </span>
            </Link>
          </li>
        </ul>
        {members.length > 3 && (
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden items-center gap-2 lg:flex">
            <button type="button" aria-label="Scroll back" onClick={() => scroll(-1)} className="pointer-events-auto flex size-10 cursor-pointer items-center justify-center rounded-full border border-line bg-surface-2/90 backdrop-blur hover:text-txt">
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <button type="button" aria-label="Scroll on" onClick={() => scroll(1)} className="pointer-events-auto flex size-10 cursor-pointer items-center justify-center rounded-full border border-line bg-surface-2/90 backdrop-blur hover:text-txt">
              <ChevronRight aria-hidden className="size-5" />
            </button>
          </div>
        )}
      </div>

      {picked && (
        <div aria-live="polite" className="mt-4 flex flex-col gap-4 rounded-3xl border border-line bg-bg/50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold">{picked.name}</p>
            {picked.notes.length ? (
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-dim">
                {picked.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-dim">Nothing due for {picked.firstName}.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/household/family/${picked.id}`} className="flex h-12 items-center rounded-2xl border border-line-strong px-5 text-sm font-medium hover:bg-surface-2">
              {picked.firstName === "You" ? "Open your page" : <>Open {picked.firstName}&rsquo;s page</>}
            </Link>
            {picked.sendTo && (
              <Link
                href={`/household/remittances?send=${picked.sendTo}#new-transfer`}
                className="bg-gradient-accent flex h-12 items-center rounded-2xl px-6 text-sm font-semibold text-on-accent shadow-[0_10px_30px_-10px] shadow-[#ab8af5] hover:opacity-90"
              >
                {picked.firstName === "You" ? "Send to your own account" : `Send money to ${picked.firstName}`}
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
