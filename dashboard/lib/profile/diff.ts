import type { Profile } from "@/lib/profile/schema";

/** Fields a CV can change. Target titles and preferences are your choices, so a CV never touches them. */
const SCALARS = [
  ["name", "Name"],
  ["headline", "Headline"],
  ["location", "Location"],
  ["yearsExperience", "Years of experience"],
  ["currentRole", "Current role"],
  ["leadership", "Leadership"],
] as const;

const CONTACT = [
  ["email", "Email"],
  ["phone", "Phone"],
  ["linkedinUrl", "LinkedIn URL"],
  ["portfolioUrl", "Portfolio URL"],
] as const;

const LISTS = [
  ["coreSkills", "Core skills"],
  ["modules", "Modules"],
  ["industries", "Industries"],
  ["certifications", "Certifications"],
] as const;

type ListKey = (typeof LISTS)[number][0];

export type Change =
  | { id: string; kind: "field"; label: string; before: string; after: string; recommended: true }
  | {
      id: string;
      kind: "list-add" | "list-remove";
      label: string;
      field: ListKey;
      items: string[];
      recommended: boolean;
    };

const normalise = (s: string) => s.trim().toLowerCase();

function missingFrom(items: string[], other: string[]): string[] {
  const seen = new Set(other.map(normalise));
  return items.filter((item) => !seen.has(normalise(item)));
}

/**
 * Lists what a new CV would change. Removals are not recommended by default:
 * a skill missing from a CV doesn't mean you no longer have it.
 */
export function diffProfiles(current: Profile, proposed: Profile): Change[] {
  const changes: Change[] = [];

  for (const [key, label] of SCALARS) {
    const before = String(current[key]);
    const after = String(proposed[key]);
    if (before !== after) changes.push({ id: key, kind: "field", label, before, after, recommended: true });
  }

  for (const [key, label] of CONTACT) {
    const before = current.contact[key];
    const after = proposed.contact[key];
    // A CV with no value for a contact field shouldn't erase the one you have.
    if (after && before !== after) {
      changes.push({ id: `contact.${key}`, kind: "field", label, before, after, recommended: true });
    }
  }

  for (const [field, label] of LISTS) {
    const added = missingFrom(proposed[field], current[field]);
    const removed = missingFrom(current[field], proposed[field]);
    if (added.length) {
      changes.push({ id: `${field}.add`, kind: "list-add", label, field, items: added, recommended: true });
    }
    if (removed.length) {
      changes.push({ id: `${field}.remove`, kind: "list-remove", label, field, items: removed, recommended: false });
    }
  }

  return changes;
}

/** Applies only the selected changes, leaving everything else as it was. */
export function applyChanges(current: Profile, proposed: Profile, changes: Change[], selected: Set<string>): Profile {
  const next: Profile = structuredClone(current);

  for (const change of changes) {
    if (!selected.has(change.id)) continue;

    if (change.kind === "list-add") {
      next[change.field] = [...next[change.field], ...change.items];
    } else if (change.kind === "list-remove") {
      const dropped = new Set(change.items.map(normalise));
      next[change.field] = next[change.field].filter((item) => !dropped.has(normalise(item)));
    } else if (change.id.startsWith("contact.")) {
      const key = change.id.slice("contact.".length) as keyof Profile["contact"];
      next.contact[key] = proposed.contact[key];
    } else if (change.id === "yearsExperience") {
      next.yearsExperience = proposed.yearsExperience;
    } else {
      const key = change.id as "name" | "headline" | "location" | "currentRole" | "leadership";
      next[key] = proposed[key];
    }
  }

  return next;
}
