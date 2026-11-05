import { ApplicationsBoard } from "@/components/ApplicationsBoard";
import { getBoard } from "@/lib/applications/board";
import { getScreeningAnswers } from "@/lib/search/screening";

export default async function ApplicationsPage() {
  const [cards, screening] = await Promise.all([getBoard(), getScreeningAnswers()]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Applications</h1>
      <p className="mt-2 text-dim">Track each application from draft through to an outcome.</p>
      <ApplicationsBoard cards={cards} screening={screening} />
    </>
  );
}
