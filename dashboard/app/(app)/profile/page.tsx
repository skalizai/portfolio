import { ProfileEditor } from "@/components/ProfileEditor";
import { EMPTY_PROFILE } from "@/lib/profile/schema";
import { getProfile } from "@/lib/profile/store";

export default async function ProfilePage() {
  const stored = await getProfile();

  return (
    <>
      <h1 className="text-2xl font-semibold">Profile</h1>
      <p className="mt-2 text-dim">Job matching and every application draw on these details.</p>
      <ProfileEditor initial={stored?.profile ?? EMPTY_PROFILE} />
    </>
  );
}
