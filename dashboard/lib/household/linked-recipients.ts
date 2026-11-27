import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

type Client = Prisma.TransactionClient | ReturnType<typeof db>;
type RecipientRelationship = "WIFE" | "MOTHER" | "FATHER" | "SIBLING" | "CHILD" | "EMPLOYEE" | "OTHER";

export const FAMILY_TO_RECIPIENT = {
  WIFE: "WIFE",
  SON: "CHILD",
  DAUGHTER: "CHILD",
  MOTHER: "MOTHER",
  FATHER: "FATHER",
  BROTHER: "SIBLING",
  SISTER: "SIBLING",
  OTHER: "OTHER",
} as const satisfies Record<string, RecipientRelationship>;

/** Sons and daughters: money for them goes through you or your wife. */
const CHILDREN: string[] = ["SON", "DAUGHTER"];

/** Relationships you'd have one of, so an older recipient with that relationship can be taken over. */
const ONE_OF_A_KIND: RecipientRelationship[] = ["WIFE", "MOTHER", "FATHER"];

type Person = { key: "familyMemberId" | "employeeId"; id: string; name: string; relationship: RecipientRelationship; phone: string; city: string; isDemo: boolean; hidden: boolean };

/**
 * Keeps a recipient for each adult family member, you included (your own account in Pakistan),
 * and each employee, so they can be chosen
 * when recording money sent. The recipient follows the person's name, and is hidden when they're
 * removed or, for staff, have left; their past transfers stay. The first time your wife, mother or
 * father is added, an earlier recipient with that relationship (such as "Wife") becomes theirs, so
 * the transfers already recorded stay with them. Returns how many recipients changed.
 */
export async function syncLinkedRecipients(client: Client = db()): Promise<number> {
  const [members, employees, recipients] = await Promise.all([
    client.familyMember.findMany({ select: { id: true, fullName: true, relationship: true, phone: true, city: true, isDemo: true, deletedAt: true }, orderBy: { createdAt: "asc" } }),
    client.employee.findMany({ select: { id: true, fullName: true, status: true, phone: true, isDemo: true, deletedAt: true }, orderBy: { createdAt: "asc" } }),
    client.recipient.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const people: Person[] = [
    // You send to your own Pakistan account too; children aren't sent money directly, so they never show.
    ...members.map((m) => ({
      key: "familyMemberId" as const,
      id: m.id,
      name: m.relationship === "SELF" ? `${m.fullName} (me)` : m.fullName,
      relationship: m.relationship === "SELF" ? ("OTHER" as const) : FAMILY_TO_RECIPIENT[m.relationship],
      phone: m.phone,
      city: m.city,
      isDemo: m.isDemo,
      hidden: Boolean(m.deletedAt) || CHILDREN.includes(m.relationship),
    })),
    ...employees.map((e) => ({ key: "employeeId" as const, id: e.id, name: e.fullName, relationship: "EMPLOYEE" as const, phone: e.phone, city: "", isDemo: e.isDemo, hidden: Boolean(e.deletedAt) || e.status === "LEFT" })),
  ];
  let changed = 0;
  const now = new Date();
  const unlinked = recipients.filter((r) => !r.familyMemberId && !r.employeeId && !r.deletedAt && !r.isDemo);
  for (const person of people) {
    const existing = recipients.find((r) => r[person.key] === person.id);
    if (!existing) {
      if (person.hidden) continue;
      const adoptable = !person.isDemo && ONE_OF_A_KIND.includes(person.relationship) ? unlinked.filter((r) => r.relationship === person.relationship) : [];
      if (adoptable.length === 1) {
        const [old] = adoptable;
        await client.recipient.update({ where: { id: old!.id }, data: { [person.key]: person.id, name: person.name } });
        unlinked.splice(unlinked.indexOf(old!), 1);
      } else {
        await client.recipient.create({ data: { [person.key]: person.id, name: person.name, relationship: person.relationship, phone: person.phone, city: person.city, isDemo: person.isDemo } });
      }
      changed++;
      continue;
    }
    const wantHidden = person.hidden;
    if (existing.name !== person.name || existing.relationship !== person.relationship || existing.isDemo !== person.isDemo || Boolean(existing.deletedAt) !== wantHidden) {
      await client.recipient.update({
        where: { id: existing.id },
        data: { name: person.name, relationship: person.relationship, isDemo: person.isDemo, deletedAt: wantHidden ? (existing.deletedAt ?? now) : null },
      });
      changed++;
    }
  }
  return changed;
}
