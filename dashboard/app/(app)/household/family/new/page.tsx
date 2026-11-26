import { FamilyForm } from "@/components/household/FamilyForm";
import { FAMILY_RELATIONSHIP_LABELS } from "@/lib/household/family";
import { EMPTY_FAMILY_MEMBER } from "@/lib/household/family-view";

export default async function NewFamilyMemberPage({ searchParams }: { searchParams: Promise<{ relationship?: string }> }) {
  const { relationship = "" } = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-semibold">Add family member</h1>
      <p className="mt-2 text-dim">Only the name and relationship are needed. Add a photo and copies of documents after saving.</p>
      <div className="mt-6">
        <FamilyForm initial={{ ...EMPTY_FAMILY_MEMBER, relationship: relationship in FAMILY_RELATIONSHIP_LABELS ? relationship : "" }} />
      </div>
    </>
  );
}
